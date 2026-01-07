/**
 * 集成认证服务
 * 整合OAuth认证、Chrome Profile管理和账户管理
 */

import { EventEmitter } from 'events'
import { RemoteOAuthService } from './RemoteOAuthService'
import { ChromeProfileManager } from './ChromeProfileManager'
import { AccountManager, Account, Project } from './AccountManager'
import { ConfigurationService } from './ConfigurationService'
import { join } from 'path'
import { app } from 'electron'
import { logger } from '../utils/logger'

export interface AuthFlowOptions {
  platform: 'gmail' | 'slack' | 'lark'
  projectId?: string
  accountEmail?: string
  displayName?: string
  description?: string
  createProfile?: boolean
  oauthAppId?: string // OAuth 应用 ID
  profileId?: string // Chrome Profile ID (如果要使用现有Profile)
}

export interface AuthResult {
  success: boolean
  account?: Account
  chromeProfileId?: string
  tokens?: any
  error?: string
}

export class IntegratedAuthService extends EventEmitter {
  private oauthService: RemoteOAuthService
  private profileManager: ChromeProfileManager
  private accountManager: AccountManager
  private isInitialized = false
  private oauthSessions: Map<string, { accountEmail?: string; platform: string; profileId?: string }> = new Map()
  private pendingProfileId: string | undefined // 临时存储用户选择的profileId

  constructor(serverUrl: string, configService?: ConfigurationService) {
    super()

    // 初始化各个服务
    this.oauthService = new RemoteOAuthService({ serverUrl }, configService)
    this.profileManager = new ChromeProfileManager()

    // 账户管理器配置文件路径
    const configPath = join(app.getPath('userData'), 'accounts.json')
    this.accountManager = new AccountManager(configPath)

    this.setupEventHandlers()
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    logger.info('🔧 [IntegratedAuth] Initializing service...')
    
    try {
      await this.oauthService.connect()
      this.isInitialized = true
      logger.info('✅ [IntegratedAuth] Service initialized successfully (connected)')
    } catch (error) {
      logger.warn('⚠️  [IntegratedAuth] OAuth server connection failed, but marking as initialized:', error)
      // 即使连接失败，也标记为已初始化，允许后续操作尝试重连
      this.isInitialized = true
      logger.info('✅ [IntegratedAuth] Service initialized (without connection)')
    }
  }

  /**
   * 开始完整的认证流程
   */
  async startAuthFlow(options: AuthFlowOptions): Promise<AuthResult> {
    if (!this.isInitialized) {
      throw new Error('服务未初始化')
    }

    // 检查 OAuth 服务是否已连接
    if (!this.oauthService.isConnectedToServer()) {
      throw new Error('OAuth Server 未连接，请检查服务器配置')
    }

    try {
      logger.info(`🔐 [IntegratedAuth] Starting auth flow: ${options.platform} - ${options.accountEmail || 'new account'} - profileId: ${options.profileId || 'auto'}`)

      // 保存用户选择的profileId（如果有）
      this.pendingProfileId = options.profileId

      // 1. 开始OAuth流程并获取sessionId
      // 我们需要修改startOAuth来返回sessionId，以便关联accountEmail
      logger.info(`🔐 [IntegratedAuth] Calling oauthService.startOAuth...`)
      const oauthResult = await this.oauthService.startOAuth(options.platform, options.oauthAppId, options.accountEmail, options.displayName, options.description)
      
      logger.info(`🔐 [IntegratedAuth] OAuth result received:`, {
        hasResult: !!oauthResult,
        hasTokens: !!oauthResult?.tokens,
        userIdentifier: oauthResult?.user_identifier
      })
      
      if (!oauthResult || !oauthResult.tokens) {
        logger.error(`❌ [IntegratedAuth] OAuth failed: no result or tokens`)
        return {
          success: false,
          error: 'OAuth认证失败'
        }
      }

      // 2. 令牌已自动保存到数据库，获取用户信息
      const userIdentifier = oauthResult.user_identifier || options.accountEmail || 'unknown'
      const displayName = oauthResult.user_info?.name || oauthResult.user_info?.user_name || options.displayName || 'Unknown User'

      // 3. 使用指定的Chrome Profile或创建新的
      let chromeProfileId: string | undefined
      if (options.profileId) {
        // 使用用户选择的现有Profile
        chromeProfileId = options.profileId
        console.log(`Using existing Chrome Profile: ${chromeProfileId}`)
      } else if (options.createProfile !== false) {
        // 创建新的Profile
        const profile = await this.profileManager.getOrCreateProfile(
          options.platform,
          userIdentifier,
          displayName
        )
        chromeProfileId = profile.id
        console.log(`Created new Chrome Profile: ${chromeProfileId}`)
      }

      console.log(`Auth flow completed: ${userIdentifier}`)
      
      const result: AuthResult = {
        success: true,
        account: {
          id: `remote_${Date.now()}`,
          email: userIdentifier,
          displayName,
          platform: options.platform,
          projectId: 'remote',
          chromeProfileId,
          isActive: true,
          tokens: {
            accessToken: oauthResult.tokens.access_token,
            refreshToken: oauthResult.tokens.refresh_token,
            expiresAt: oauthResult.tokens.expires_in 
              ? new Date(Date.now() + oauthResult.tokens.expires_in * 1000)
              : undefined
          },
          metadata: oauthResult.user_info,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        chromeProfileId,
        tokens: oauthResult.tokens
      }

      this.emit('auth-success', result)
      
      return result

    } catch (error) {
      logger.error('❌ [IntegratedAuth] Auth flow failed:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        platform: options.platform,
        accountEmail: options.accountEmail
      })
      
      const result: AuthResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
      
      this.emit('auth-error', result)
      return result
    }
  }

  /**
   * 打开账户对应的浏览器
   */
  async openAccountInBrowser(accountId: string, url: string): Promise<void> {
    const account = this.accountManager.getAccounts().find(acc => acc.id === accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    if (!account.chromeProfileId) {
      throw new Error(`账户未关联Chrome Profile: ${account.email}`)
    }

    await this.profileManager.openChromeWithProfile(account.chromeProfileId, url)
    console.log(`Opened in Chrome Profile: ${account.email} -> ${url}`)
  }

  /**
   * 为账户创建Chrome Profile
   */
  async createProfileForAccount(accountId: string): Promise<string> {
    const account = this.accountManager.getAccounts().find(acc => acc.id === accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    if (account.chromeProfileId) {
      throw new Error(`账户已有Chrome Profile: ${account.email}`)
    }

    const profile = await this.profileManager.getOrCreateProfile(
      account.platform,
      account.email,
      account.displayName
    )

    await this.accountManager.linkChromeProfile(accountId, profile.id)
    
    console.log(`Created Chrome Profile for account: ${account.email} -> ${profile.id}`)
    return profile.id
  }

  /**
   * 获取项目列表
   */
  getProjects(platform?: 'gmail' | 'slack' | 'lark'): Project[] {
    return this.accountManager.getProjects(platform)
  }

  /**
   * 获取账户列表
   */
  getAccounts(projectId?: string, platform?: 'gmail' | 'slack' | 'lark'): Account[] {
    return this.accountManager.getAccounts(projectId, platform)
  }

  /**
   * 获取账户分组
   */
  getAccountGroups() {
    return this.accountManager.getAccountGroups()
  }

  /**
   * 创建新项目
   */
  async createProject(platform: 'gmail' | 'slack' | 'lark', name: string, description?: string): Promise<Project> {
    return await this.accountManager.createProject(platform, name, description)
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    const project = this.accountManager.getProjects().find(p => p.id === projectId)
    if (!project) {
      throw new Error(`项目不存在: ${projectId}`)
    }

    // 删除项目下所有账户的Chrome Profiles
    for (const account of project.accounts) {
      if (account.chromeProfileId) {
        try {
          await this.profileManager.deleteProfile(account.chromeProfileId)
        } catch (error) {
          console.warn(`删除Chrome Profile失败: ${account.chromeProfileId}`, error)
        }
      }
    }

    await this.accountManager.deleteProject(projectId)
    console.log(`Project deleted: ${project.name}`)
  }

  /**
   * 删除账户
   */
  async deleteAccount(accountId: string): Promise<void> {
    const account = this.accountManager.getAccounts().find(acc => acc.id === accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    // 删除关联的Chrome Profile
    if (account.chromeProfileId) {
      try {
        await this.profileManager.deleteProfile(account.chromeProfileId)
      } catch (error) {
        console.warn(`删除Chrome Profile失败: ${account.chromeProfileId}`, error)
      }
    }

    await this.accountManager.deleteAccount(accountId)
    console.log(`Account deleted: ${account.email}`)
  }

  /**
   * 获取统计信息
   */
  async getStatistics() {
    try {
      // 从服务器获取统计信息
      const serverStats = await this.oauthService.getStats()
      return {
        ...this.accountManager.getStatistics(),
        server: serverStats
      }
    } catch (error) {
      console.error('获取服务器统计失败:', error)
      return this.accountManager.getStatistics()
    }
  }

  /**
   * 从服务器获取用户令牌
   */
  async getUserTokensFromServer(userIdentifier: string, platform?: string) {
    try {
      return await this.oauthService.getUserTokens(userIdentifier, platform)
    } catch (error) {
      console.error('从服务器获取用户令牌失败:', error)
      throw error
    }
  }

  /**
   * 从服务器获取OAuth应用配置
   */
  async getOAuthAppsFromServer(platform?: string) {
    try {
      return await this.oauthService.getOAuthApps(platform)
    } catch (error) {
      console.error('从服务器获取OAuth应用失败:', error)
      throw error
    }
  }

  /**
   * 删除服务器上的用户令牌
   */
  async deleteUserTokenFromServer(tokenId: string) {
    try {
      await this.oauthService.deleteUserToken(tokenId)
    } catch (error) {
      console.error('删除服务器用户令牌失败:', error)
      throw error
    }
  }

  /**
   * 刷新账户令牌
   */
  async refreshAccountToken(accountId: string): Promise<boolean> {
    const account = this.accountManager.getAccounts().find(acc => acc.id === accountId)
    if (!account || !account.tokens?.refreshToken) {
      return false
    }

    try {
      // 这里应该调用对应平台的token刷新API
      // 暂时返回false，需要根据具体平台实现
      console.log(`Refreshing token: ${account.email}`)
      return false
    } catch (error) {
      console.error(`刷新令牌失败: ${account.email}`, error)
      return false
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.oauthService) {
      await this.oauthService.disconnect()
    }
    this.isInitialized = false
    console.log('Integrated auth service disconnected')
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.oauthService.on('connected', () => {
      this.emit('connected')
    })

    this.oauthService.on('disconnected', () => {
      this.emit('disconnected')
    })

    this.oauthService.on('error', (error) => {
      this.emit('error', error)
    })

    // 监听OAuth URL事件，打开Chrome Profile进行授权
    this.oauthService.on('oauth-url', async (data: { sessionId: string; platform: string; authUrl: string; accountEmail?: string }) => {
      try {
        console.log(`Opening Chrome for OAuth: ${data.platform} - ${data.authUrl} - ${data.accountEmail || 'new account'}`)
        
        let profileId: string
        
        // 1. 优先使用用户选择的profileId
        if (this.pendingProfileId) {
          profileId = this.pendingProfileId
          console.log(`Using user-selected profile: ${profileId}`)
          // 清除临时保存的profileId
          this.pendingProfileId = undefined
        } else {
          // 2. 否则创建或获取Profile
          const accountEmail = data.accountEmail
          let profile
          
          if (accountEmail) {
            // 检查是否已存在该邮箱的Profile
            console.log(`Checking existing profile for: ${accountEmail}`)
            profile = await this.profileManager.getOrCreateProfile(
              data.platform,
              accountEmail,
              accountEmail
            )
            console.log(`Using existing/created profile for: ${accountEmail}`)
          } else {
            // 创建临时Profile作为fallback
            const tempEmail = `oauth-temp-${Date.now()}@${data.platform}.com`
            profile = await this.profileManager.getOrCreateProfile(
              data.platform,
              tempEmail,
              `OAuth ${data.platform}`
            )
            console.log(`Created temporary profile: ${tempEmail}`)
          }
          
          profileId = profile.id
        }
        
        // 使用Chrome Profile打开OAuth URL
        await this.profileManager.openChromeWithProfile(profileId, data.authUrl)
        console.log(`Chrome opened for OAuth authorization: ${data.platform}`)
        
      } catch (error) {
        console.error('Failed to open Chrome for OAuth:', error)
        this.emit('error', error)
      }
    })
  }

  /**
   * 获取用户信息
   */
  private async getUserInfo(platform: string, tokens: any): Promise<{
    email?: string
    name?: string
    metadata?: any
  }> {
    // 这里应该根据平台调用相应的API获取用户信息
    // 暂时返回基本信息
    return {
      email: undefined, // 需要从API获取
      name: undefined,  // 需要从API获取
      metadata: {
        platform,
        tokenType: tokens.token_type,
        scope: tokens.scope
      }
    }
  }

  /**
   * 获取默认项目名称
   */
  private getDefaultProjectName(platform: string, email?: string): string {
    if (email) {
      const domain = email.split('@')[1]
      return `${platform.toUpperCase()} - ${domain}`
    }
    return `${platform.toUpperCase()} 项目`
  }
}