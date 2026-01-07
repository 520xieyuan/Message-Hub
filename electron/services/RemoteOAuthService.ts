/**
 * 远程OAuth服务
 * 通过Socket.IO连接到远程OAuth服务器，处理OAuth流程
 * 集成数据库API进行令牌管理
 */

import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { io, Socket } from 'socket.io-client'
import axios from 'axios'
import { ConfigurationService } from './ConfigurationService'
import { logger } from '../utils/logger'

export interface OAuthConfig {
  serverUrl: string
  httpServerUrl: string
  reconnectInterval: number
  maxReconnectAttempts: number
  sessionTimeout: number
}

export interface OAuthResult {
  platform: string
  tokens: {
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    scope?: string
  }
  user_info?: any
  user_identifier?: string
  sessionId: string
  timestamp: string
}

export interface UserToken {
  id: string
  oauth_app_id: string
  user_identifier: string
  display_name?: string
  platform: string
  expires_at?: string
  user_info?: string
  created_at: string
  updated_at: string
}

export interface OAuthError {
  error: string
  description?: string
  sessionId?: string
  timestamp: string
}

export class RemoteOAuthService extends EventEmitter {
  private socket: Socket | null = null
  private config: OAuthConfig
  private clientId: string
  private isConnected: boolean = false
  private reconnectAttempts: number = 0
  private pendingSessions: Map<string, { platform: string; resolve: Function; reject: Function; accountEmail?: string }> = new Map()
  private configService: ConfigurationService | null = null

  constructor(config: Partial<OAuthConfig> = {}, configService?: ConfigurationService) {
    super()

    this.config = {
      serverUrl: '',
      httpServerUrl: '',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      sessionTimeout: 10 * 60 * 1000, // 10分钟
      ...config
    }

    this.clientId = randomUUID()
    this.configService = configService || null

    // 监听配置变更
    if (this.configService) {
      this.configService.on('oauthServerUrlChanged', this.handleServerUrlChange.bind(this))
    }
  }

  /**
   * 处理服务器 URL 变更
   */
  private async handleServerUrlChange(newUrl: string): Promise<void> {
    // 拒绝所有待处理的会话
    for (const [, session] of this.pendingSessions.entries()) {
      session.reject(new Error('OAuth Server URL 已更新，请重新尝试'))
    }
    this.pendingSessions.clear()

    // 断开当前连接
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.isConnected = false

    // 更新配置
    this.config.serverUrl = newUrl
    this.config.httpServerUrl = newUrl

    // 重新连接
    try {
      await this.connect()
      this.emit('reconnected', newUrl)
    } catch (error) {
      console.error('RemoteOAuthService reconnection failed:', error)
      this.emit('reconnect-failed', error)
    }
  }

  /**
   * 连接到OAuth服务器
   */
  async connect(): Promise<void> {
    // 如果没有配置 serverUrl，从 ConfigurationService 获取
    if (!this.config.serverUrl && this.configService) {
      const url = await this.configService.getOAuthServerUrl()
      this.config.serverUrl = url
      this.config.httpServerUrl = url
    }

    return new Promise((resolve, reject) => {
      try {
        logger.info(`Connecting to OAuth server: ${this.config.serverUrl}`)

        this.socket = io(this.config.serverUrl, {
          transports: ['websocket', 'polling'],
          reconnection: false // 我们自己处理重连
        })

        this.socket.on('connect', () => {
          logger.info('Socket.IO connection established')
          this.isConnected = true
          this.reconnectAttempts = 0

          // 注册客户端
          this.socket?.emit('register', {
            clientId: this.clientId,
            appVersion: process.env.npm_package_version || '1.0.0'
          })

          resolve()
        })

        // 监听所有事件
        this.socket.onAny((event, data) => {
          this.handleMessage({ event, data })
        })

        this.socket.on('disconnect', (reason) => {
          logger.warn(`Socket.IO connection disconnected: ${reason}`)
          this.isConnected = false
          this.handleDisconnect()
        })

        this.socket.on('connect_error', (error) => {
          logger.error('Socket.IO connection error:', error)
          logger.error('OAuth Server URL:', this.config.serverUrl)
          logger.error('Error details:', {
            message: error.message,
            name: error.name,
            stack: error.stack
          })
          this.isConnected = false
          reject(error)
        })

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.isConnected = false
  }

  /**
   * 开始OAuth流程
   */
  async startOAuth(platform: string, oauthAppId?: string, accountEmail?: string, displayName?: string, description?: string): Promise<OAuthResult> {
    // 检查连接状态
    if (!this.isConnected || !this.socket?.connected) {
      logger.error('❌ [RemoteOAuthService] Not connected to OAuth server')
      logger.error('   isConnected:', this.isConnected)
      logger.error('   socket.connected:', this.socket?.connected)
      logger.error('   serverUrl:', this.config.serverUrl)
      throw new Error('未连接到OAuth服务器，请检查设置中的 OAuth Server 地址')
    }

    const sessionId = randomUUID()

    // 从 ConfigurationService 获取 client_id
    const clientId = this.configService?.getClientId()

    logger.info(`🔐 [RemoteOAuthService] Starting OAuth flow`)
    logger.info(`   Platform: ${platform}`)
    logger.info(`   SessionId: ${sessionId}`)
    logger.info(`   OAuth App ID: ${oauthAppId || 'default'}`)
    logger.info(`   Client ID: ${clientId || 'N/A'}`)
    logger.info(`   Server URL: ${this.config.serverUrl}`)

    return new Promise((resolve, reject) => {
      // 存储会话信息（包括accountEmail）
      this.pendingSessions.set(sessionId, { platform, resolve, reject, accountEmail })

      logger.info(`📝 [RemoteOAuthService] Session stored, total pending: ${this.pendingSessions.size}`)

      // 设置超时
      setTimeout(() => {
        if (this.pendingSessions.has(sessionId)) {
          this.pendingSessions.delete(sessionId)
          logger.error(`⏱️  [RemoteOAuthService] OAuth flow timeout for session: ${sessionId}`)
          reject(new Error('OAuth流程超时（10分钟），请重试'))
        }
      }, this.config.sessionTimeout)

      // 发送OAuth请求
      const payload = {
        platform,
        sessionId,
        oauthAppId, // 传递 OAuth 应用 ID
        accountEmail, // 传递账户邮箱
        displayName, // 传递用户自定义显示名称
        description, // 传递用户自定义描述
        clientId // 传递 client_id
      }

      logger.info(`📤 [RemoteOAuthService] Sending start-oauth event`)
      this.send('start-oauth', payload)
    })
  }

  /**
   * 检查连接状态
   */
  isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true
  }

  /**
   * 获取客户端ID
   */
  getClientId(): string {
    return this.clientId
  }

  /**
   * 获取当前的服务器 URL
   */
  private async getServerUrl(): Promise<string> {
    if (this.configService) {
      return await this.configService.getOAuthServerUrl()
    }
    return this.config.httpServerUrl
  }

  /**
   * 获取用户令牌
   */
  async getUserTokens(userIdentifier: string, platform?: string): Promise<UserToken[]> {
    try {
      const baseUrl = await this.getServerUrl()
      const url = `${baseUrl}/api/tokens/${encodeURIComponent(userIdentifier)}`
      const params = platform ? { platform } : {}

      const response = await axios.get(url, { params })
      return response.data
    } catch (error) {
      console.error('获取用户令牌失败:', error)
      throw new Error(`获取用户令牌失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取用户令牌（包含访问令牌）
   */
  async getUserTokensFull(userIdentifier: string, platform?: string): Promise<UserToken[]> {
    try {
      const baseUrl = await this.getServerUrl()
      const url = `${baseUrl}/api/tokens/${encodeURIComponent(userIdentifier)}/full`
      const params = platform ? { platform } : {}

      const response = await axios.get(url, { params })
      return response.data
    } catch (error) {
      console.error('获取完整用户令牌失败:', error)
      throw new Error(`获取完整用户令牌失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 删除用户令牌
   */
  async deleteUserToken(tokenId: string): Promise<void> {
    try {
      const baseUrl = await this.getServerUrl()
      const url = `${baseUrl}/api/tokens/${tokenId}`
      await axios.delete(url)
    } catch (error) {
      console.error('删除用户令牌失败:', error)
      throw new Error(`删除用户令牌失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取OAuth应用列表
   */
  async getOAuthApps(platform?: string): Promise<any[]> {
    try {
      const baseUrl = await this.getServerUrl()
      const url = `${baseUrl}/api/oauth-apps`
      const params = platform ? { platform } : {}

      const response = await axios.get(url, { params })
      return response.data
    } catch (error) {
      console.error('获取OAuth应用失败:', error)
      throw new Error(`获取OAuth应用失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<any> {
    try {
      const baseUrl = await this.getServerUrl()
      const url = `${baseUrl}/api/stats`
      const response = await axios.get(url)
      return response.data
    } catch (error) {
      console.error('获取统计信息失败:', error)
      throw new Error(`获取统计信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 发送消息到服务器
   */
  private send(event: string, data: any): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data)
    } else {
      console.error('Socket.IO未连接，无法发送消息')
    }
  }

  /**
   * 处理服务器消息
   */
  private handleMessage(message: any): void {
    const { event, data } = message

    switch (event) {
      case 'registered':
        console.log('Client registered successfully:', data)
        this.emit('registered', data)
        break

      case 'oauth-url':
        console.log('Received OAuth URL:', data)
        this.handleOAuthUrl(data)
        break

      case 'oauth-success':
        console.log('OAuth authorization successful:', data)
        this.handleOAuthSuccess(data)
        break

      case 'oauth-error':
        console.error('OAuth授权失败:', data)
        this.handleOAuthError(data)
        break

      case 'tokens-changed':
        logger.info('✅ [RemoteOAuthService] Received tokens-changed event:', data)
        this.handleTokensChanged(data)
        break

      default:
        console.log('Unknown message type:', event, data)
    }
  }

  /**
   * 处理OAuth URL
   */
  private handleOAuthUrl(data: { sessionId: string; platform: string; authUrl: string }): void {
    const { sessionId, platform, authUrl } = data

    // 从pendingSessions中获取accountEmail
    const session = this.pendingSessions.get(sessionId)
    const accountEmail = session?.accountEmail

    // 触发事件，让上层处理浏览器打开（包含accountEmail）
    this.emit('oauth-url', { sessionId, platform, authUrl, accountEmail })
  }

  /**
   * 处理OAuth成功
   */
  private handleOAuthSuccess(data: OAuthResult): void {
    logger.info(`✅ [RemoteOAuthService] OAuth success received`)
    logger.info(`   SessionId: ${data.sessionId}`)
    logger.info(`   Platform: ${data.platform}`)
    
    const session = this.pendingSessions.get(data.sessionId)
    if (session) {
      logger.info(`   Session found, resolving promise`)
      this.pendingSessions.delete(data.sessionId)
      session.resolve(data)
    } else {
      logger.warn(`⚠️  [RemoteOAuthService] Session not found for: ${data.sessionId}`)
      logger.warn(`   Available sessions: ${Array.from(this.pendingSessions.keys()).join(', ')}`)
    }

    this.emit('oauth-success', data)
  }

  /**
   * 处理OAuth错误
   */
  private handleOAuthError(data: OAuthError): void {
    logger.error(`❌ [RemoteOAuthService] OAuth error received`)
    logger.error(`   Error: ${data.error}`)
    logger.error(`   Description: ${data.description || 'N/A'}`)
    logger.error(`   SessionId: ${data.sessionId || 'N/A'}`)

    if (data.sessionId) {
      const session = this.pendingSessions.get(data.sessionId)
      if (session) {
        logger.error(`   Session found, rejecting promise`)
        this.pendingSessions.delete(data.sessionId)
        session.reject(new Error(`OAuth失败: ${data.error} - ${data.description || ''}`))
      } else {
        logger.warn(`⚠️  [RemoteOAuthService] Session not found for error: ${data.sessionId}`)
      }
    }

    this.emit('oauth-error', data)
  }

  /**
   * ✅ 处理 tokens 变更事件
   */
  private handleTokensChanged(data: any): void {
    logger.info(`🔄 [RemoteOAuthService] Tokens changed - triggering refresh`)
    logger.info(`   Triggered by: ${data.triggerClientId || 'unknown'}`)
    logger.info(`   Timestamp: ${data.timestamp || 'N/A'}`)

    // 向外部发出事件，供其他服务监听
    this.emit('tokens-changed', data)
  }

  /**
   * 处理连接断开
   */
  private handleDisconnect(): void {
    this.emit('disconnected')

    // 拒绝所有待处理的会话
    for (const [sessionId, session] of this.pendingSessions.entries()) {
      session.reject(new Error('连接断开'))
    }
    this.pendingSessions.clear()

    // 尝试重连
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting reconnection (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`)

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('重连失败:', error)
        })
      }, this.config.reconnectInterval)
    } else {
      console.log('Maximum reconnection attempts reached, stopping reconnection. HTTP API still available.')
      this.emit('max-reconnect-attempts-reached')
    }
  }
}