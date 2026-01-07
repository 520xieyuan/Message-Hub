/**
 * 账户服务 V2 - 优化版本
 *
 * 主要改进：
 * 1. localStorage 持久化缓存
 * 2. 请求去重机制
 * 3. 事件订阅机制（类似 Pinia）
 * 4. 更长的缓存时间（5分钟）
 * 5. WebSocket 事件监听支持
 */

import { Account } from '../store/useSearchStore'

export interface AccountServiceAPI {
  getUserTokens: (userIdentifier?: string, platform?: string) => Promise<{
    success: boolean
    data: any[]
    error?: string
  }>
  getOAuthApps: (platform?: string) => Promise<{
    success: boolean
    data: any[]
    error?: string
  }>
  refreshToken: (options: { platform: string; accountId: string }) => Promise<{
    success: boolean
    message?: string
    error?: string
  }>
}

class AccountServiceV2 {
  private api: any

  // ✅ 缓存配置
  private static readonly CACHE_KEY = 'accounts_cache_v1'
  private static readonly CACHE_TTL = 5 * 60 * 1000 // 5分钟

  // ✅ 内存缓存
  private accountsCache: {
    data: Account[] | null
    timestamp: number
  } = {
    data: null,
    timestamp: 0
  }

  // ✅ 请求去重
  private pendingRequest: Promise<Account[]> | null = null

  // ✅ 事件监听器（类似 Pinia 的 $subscribe）
  private changeListeners: Set<(accounts: Account[]) => void> = new Set()

  constructor() {
    this.api = (window as any).electronAPI || {}

    // 从 localStorage 加载缓存
    this.loadCacheFromStorage()

    // 监听 WebSocket 事件（如果可用）
    this.setupWebSocketListeners()
  }

  /**
   * ✅ 从 localStorage 加载缓存
   */
  private loadCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem(AccountServiceV2.CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        const age = Date.now() - parsed.timestamp

        if (age < AccountServiceV2.CACHE_TTL) {
          this.accountsCache = {
            data: parsed.data,
            timestamp: parsed.timestamp
          }
          console.log(`✅ [AccountService] Loaded ${parsed.data.length} accounts from localStorage (age: ${Math.round(age / 1000)}s)`)
        } else {
          console.log(`⏰ [AccountService] localStorage cache expired (age: ${Math.round(age / 1000)}s)`)
          localStorage.removeItem(AccountServiceV2.CACHE_KEY)
        }
      }
    } catch (error) {
      console.error('[AccountService] Failed to load cache from localStorage:', error)
      localStorage.removeItem(AccountServiceV2.CACHE_KEY)
    }
  }

  /**
   * ✅ 保存缓存到 localStorage
   */
  private saveCacheToStorage(): void {
    try {
      if (this.accountsCache.data) {
        const toSave = {
          data: this.accountsCache.data,
          timestamp: this.accountsCache.timestamp
        }
        localStorage.setItem(AccountServiceV2.CACHE_KEY, JSON.stringify(toSave))
        console.log(`💾 [AccountService] Saved ${this.accountsCache.data.length} accounts to localStorage`)
      }
    } catch (error) {
      console.error('[AccountService] Failed to save cache to localStorage:', error)
    }
  }

  /**
   * ✅ 设置 WebSocket 监听
   */
  private setupWebSocketListeners(): void {
    // 预留接口：未来从 RemoteOAuthService 接收 token 变更事件
    if ((window as any).electronAPI?.onTokensChanged) {
      (window as any).electronAPI.onTokensChanged(() => {
        console.log('🔄 [AccountService] Received tokens-changed event, clearing cache')
        this.clearCache()
        // 自动重新加载（可选）
        this.getAllAccounts().catch(err => console.error('Failed to reload accounts:', err))
      })
    }
  }

  /**
   * ✅ 订阅账户变更事件（类似 Pinia 的 $subscribe）
   */
  public subscribe(listener: (accounts: Account[]) => void): () => void {
    this.changeListeners.add(listener)
    // 返回取消订阅函数
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  /**
   * ✅ 通知所有监听器
   */
  private notifyListeners(accounts: Account[]): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(accounts)
      } catch (error) {
        console.error('[AccountService] Error in change listener:', error)
      }
    })
  }

  /**
   * 获取 OAuth Server URL
   */
  private async getOAuthServerUrl(): Promise<string> {
    try {
      if ((window as any).electronAPI?.config?.getOAuthServerUrl) {
        const url = await (window as any).electronAPI.config.getOAuthServerUrl()
        return url || 'http://localhost:3000'
      }
    } catch (error) {
      console.error('[AccountService] Failed to get OAuth Server URL:', error)
    }
    return 'http://localhost:3000'
  }

  /**
   * 获取所有用户账户（带缓存 + 请求去重）
   */
  async getAllAccounts(): Promise<Account[]> {
    try {
      // ✅ 检查内存缓存
      const now = Date.now()
      if (this.accountsCache.data && (now - this.accountsCache.timestamp < AccountServiceV2.CACHE_TTL)) {
        console.log(`✅ [AccountService] Using cached accounts (age: ${Math.round((now - this.accountsCache.timestamp) / 1000)}s)`)
        return this.accountsCache.data
      }

      // ✅ 防止并发请求
      if (this.pendingRequest) {
        console.log('⏳ [AccountService] Request already in progress, waiting...')
        return await this.pendingRequest
      }

      console.log('📡 [AccountService] Fetching accounts from OAuth Server')

      // ✅ 创建请求 Promise
      this.pendingRequest = this.fetchAccountsFromServer()

      try {
        const accounts = await this.pendingRequest

        // ✅ 更新缓存
        this.accountsCache = {
          data: accounts,
          timestamp: Date.now()
        }

        // ✅ 保存到 localStorage
        this.saveCacheToStorage()

        // ✅ 通知监听器
        this.notifyListeners(accounts)

        return accounts
      } finally {
        this.pendingRequest = null
      }
    } catch (error) {
      console.error('[AccountService] 获取账户失败:', error)
      return []
    }
  }

  /**
   * ✅ 从服务器获取账户数据
   */
  private async fetchAccountsFromServer(): Promise<Account[]> {
    const oauthServerUrl = await this.getOAuthServerUrl()

    // 获取当前 Client ID
    let clientId: string | undefined
    try {
      if (this.api.config?.getClientId) {
        clientId = await this.api.config.getClientId()
      }
    } catch (error) {
      // Ignore
    }

    // 首先尝试从HTTP API获取数据
    try {
      const url = new URL(`${oauthServerUrl}/api/tokens`)
      if (clientId) {
        url.searchParams.append('client_id', clientId)
      }

      const response = await fetch(url.toString())
      if (response.ok) {
        const tokens = await response.json()

        // 转换为Account格式
        const accounts: Account[] = tokens.map((token: any) => ({
          id: token.id,
          platform: token.platform as 'gmail' | 'slack' | 'lark',
          userIdentifier: token.user_identifier,
          displayName: token.display_name || token.name,
          name: token.name,
          avatar: token.avatar_url,
          enabled: true,
          connectionStatus: this.determineConnectionStatus(token),
          lastChecked: token.updated_at ? new Date(token.updated_at) : new Date(),
          error: token.error,
          oauthAppName: token.app_name
        }))

        return accounts
      }
    } catch (httpError) {
      console.warn('[AccountService] HTTP API failed, trying Electron API:', httpError)
    }

    // 如果HTTP API失败，尝试Electron API
    if (this.api.getUserTokens) {
      const result = await this.api.getUserTokens()

      if (result.success) {
        const accounts: Account[] = result.data.map((token: any) => ({
          id: token.id,
          platform: token.platform as 'gmail' | 'slack' | 'lark',
          userIdentifier: token.user_identifier,
          displayName: token.display_name || token.name,
          name: token.name,
          avatar: token.avatar_url,
          enabled: true,
          connectionStatus: this.determineConnectionStatus(token),
          lastChecked: token.updated_at ? new Date(token.updated_at) : new Date(),
          error: token.error
        }))

        return accounts
      }
    }

    return []
  }

  /**
   * 清空账户缓存（手动刷新时调用）
   */
  clearCache(): void {
    console.log('🧹 [AccountService] Clearing accounts cache')
    this.accountsCache.data = null
    this.accountsCache.timestamp = 0
    localStorage.removeItem(AccountServiceV2.CACHE_KEY)
  }

  /**
   * 根据令牌信息确定连接状态
   */
  private determineConnectionStatus(token: any): Account['connectionStatus'] {
    if (token.error) {
      return 'error'
    }

    if (token.user_identifier && token.platform) {
      return 'connected'
    }

    return 'disconnected'
  }

  // ... 其他方法保持不变（从原 AccountService 复制）
}

export default AccountServiceV2
