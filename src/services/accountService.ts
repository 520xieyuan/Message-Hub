/**
 * 账户服务
 * 负责获取和管理用户账户信息
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

class AccountService {
  private api: any // 使用 any 类型以包含所有 electronAPI 方法

  // ✅ 缓存配置
  private static readonly CACHE_KEY = 'accounts_cache_v1'
  private static readonly CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

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

  constructor() {
    // 获取完整的 Electron IPC API
    this.api = (window as any).electronAPI || {}

    if (!this.api.getUserTokens || !this.api.getOAuthApps) {
      // console.warn('Account API not fully available. Some features may not work in browser environment.')
    }

    // ✅ 从 localStorage 加载缓存
    this.loadCacheFromStorage()

    // ✅ 监听 WebSocket tokens-changed 事件
    this.setupTokensChangedListener()
  }

  /**
   * ✅ 从 localStorage 加载缓存
   */
  private loadCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem(AccountService.CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        const age = Date.now() - parsed.timestamp

        if (age < AccountService.CACHE_TTL) {
          this.accountsCache = {
            data: parsed.data,
            timestamp: parsed.timestamp
          }
          console.log(`✅ [AccountService] Loaded ${parsed.data.length} accounts from localStorage (age: ${Math.round(age / 1000)}s)`)
        } else {
          console.log(`⏰ [AccountService] localStorage cache expired (age: ${Math.round(age / 1000)}s)`)
          localStorage.removeItem(AccountService.CACHE_KEY)
        }
      }
    } catch (error) {
      console.error('[AccountService] Failed to load cache from localStorage:', error)
      localStorage.removeItem(AccountService.CACHE_KEY)
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
        localStorage.setItem(AccountService.CACHE_KEY, JSON.stringify(toSave))
        console.log(`💾 [AccountService] Saved ${this.accountsCache.data.length} accounts to localStorage`)
      }
    } catch (error) {
      console.error('[AccountService] Failed to save cache to localStorage:', error)
    }
  }

  /**
   * ✅ 监听 tokens-changed 事件
   */
  private setupTokensChangedListener(): void {
    // 通过 Electron IPC 监听 tokens-changed 事件
    if ((window as any).electronAPI?.onTokensChanged) {
      (window as any).electronAPI.onTokensChanged(() => {
        console.log('🔄 [AccountService] Received tokens-changed event, clearing cache')
        this.clearCache()
        // 自动重新加载（静默）
        this.getAllAccounts().catch(err => console.error('Failed to reload accounts:', err))
      })
    }
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
      console.error('Failed to get OAuth Server URL:', error)
    }
    return 'http://localhost:3000'
  }

  /**
   * 获取所有用户账户（带缓存）
   */
  async getAllAccounts(): Promise<Account[]> {
    try {
      // ✅ 检查内存缓存
      const now = Date.now()
      if (this.accountsCache.data && (now - this.accountsCache.timestamp < AccountService.CACHE_TTL)) {
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

        return accounts
      } finally {
        this.pendingRequest = null
      }
    } catch (error) {
      console.error('获取账户失败:', error)
      // 返回模拟数据而不是抛出错误，确保界面能正常显示
      return this.getMockAccounts()
    }
  }

  /**
   * ✅ 从服务器获取账户数据
   */
  private async fetchAccountsFromServer(): Promise<Account[]> {
    try {
      const oauthServerUrl = await this.getOAuthServerUrl()

      // 获取当前 Client ID
      let clientId: string | undefined
      try {
        if (this.api.config?.getClientId) {
          clientId = await this.api.config.getClientId()
          // console.log('[AccountService] Got Client ID:', clientId)
        } else {
          // console.warn('[AccountService] getClientId method not available')
        }
      } catch (error) {
        // console.warn('[AccountService] Failed to get Client ID:', error)
      }

      // 首先尝试从HTTP API获取数据（与AccountsPage保持一致）
      try {
        // 构建 URL，包含 client_id 参数
        const url = new URL(`${oauthServerUrl}/api/tokens`)
        if (clientId) {
          url.searchParams.append('client_id', clientId)
          // console.log('[AccountService] API URL with client_id:', url.toString())
        } else {
          // console.warn('[AccountService] No Client ID, URL without client_id:', url.toString())
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
            enabled: true, // 默认启用
            connectionStatus: this.determineConnectionStatus(token),
            lastChecked: token.updated_at ? new Date(token.updated_at) : new Date(),
            error: token.error,
            // 添加OAuth应用信息
            oauthAppName: token.app_name
          }))

          return accounts
        }
      } catch (httpError) {
        // console.warn('HTTP API获取账户失败，尝试Electron API:', httpError)
      }

      // 如果HTTP API失败，尝试Electron API
      if (this.api.getUserTokens) {
        const result = await this.api.getUserTokens()

        if (!result.success) {
          throw new Error(result.error || '获取账户失败')
        }

        // 转换为Account格式
        const accounts: Account[] = result.data.map((token: any) => ({
          id: token.id,
          platform: token.platform as 'gmail' | 'slack' | 'lark',
          userIdentifier: token.user_identifier,
          displayName: token.display_name || token.name,
          name: token.name,
          avatar: token.avatar_url,
          enabled: true, // 默认启用
          connectionStatus: this.determineConnectionStatus(token),
          lastChecked: token.updated_at ? new Date(token.updated_at) : new Date(),
          error: token.error
        }))

        return accounts
      }

      // 如果都失败，返回空数组
      return []
    } catch (error) {
      console.error('[AccountService] Failed to fetch accounts from server:', error)
      return []
    }
  }

  /**
   * ✅ 清空账户缓存（手动刷新时调用）
   */
  clearCache(): void {
    console.log('🧹 [AccountService] Clearing accounts cache')
    this.accountsCache.data = null
    this.accountsCache.timestamp = 0
    localStorage.removeItem(AccountService.CACHE_KEY)
  }

  /**
 * 直接用获取到的数据更新缓存（避免重复请求服务器）
 * @param tokens 从 OAuth Server 获取的原始 token 数据
 */
  updateCacheWithData(tokens: any[]): void {
    console.log(`🔄 [AccountService] Updating cache with ${tokens.length} tokens`)

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

    this.accountsCache = {
      data: accounts,
      timestamp: Date.now()
    }

    this.saveCacheToStorage()

    console.log(`✅ [AccountService] Cache updated with ${accounts.length} accounts`)
  }

  /**
   * 获取指定平台的账户
   */
  async getAccountsByPlatform(platform: string): Promise<Account[]> {
    try {
      const oauthServerUrl = await this.getOAuthServerUrl()

      // 获取当前 Client ID
      let clientId: string | undefined
      try {
        if (this.api.config?.getClientId) {
          clientId = await this.api.config.getClientId()
          // console.log('[AccountService] getAccountsByPlatform - Got Client ID:', clientId)
        } else {
          // console.warn('[AccountService] getAccountsByPlatform - getClientId method not available')
        }
      } catch (error) {
        // console.warn('[AccountService] getAccountsByPlatform - Failed to get Client ID:', error)
      }

      // 首先尝试从HTTP API获取数据
      try {
        // 构建 URL，包含 platform 和 client_id 参数
        const url = new URL(`${oauthServerUrl}/api/tokens`)
        url.searchParams.append('platform', platform)
        if (clientId) {
          url.searchParams.append('client_id', clientId)
          // console.log('[AccountService] getAccountsByPlatform - API URL with client_id:', url.toString())
        } else {
          // console.warn('[AccountService] getAccountsByPlatform - No Client ID, URL without client_id:', url.toString())
        }

        const response = await fetch(url.toString())
        if (response.ok) {
          const tokens = await response.json()

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
        // console.warn('HTTP API获取平台账户失败，尝试Electron API:', httpError)
      }

      // 如果HTTP API失败，尝试Electron API
      if (!this.api.getUserTokens) {
        return this.getMockAccounts().filter(acc => acc.platform === platform)
      }

      const result = await this.api.getUserTokens(undefined, platform)

      if (!result.success) {
        throw new Error(result.error || '获取账户失败')
      }

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
    } catch (error) {
      console.error('获取平台账户失败:', error)
      throw error
    }
  }

  /**
   * 刷新账户令牌
   */
  async refreshAccountToken(accountId: string, platform: string): Promise<void> {
    try {
      if (!this.api.refreshToken) {
        throw new Error('刷新令牌功能不可用')
      }

      const result = await this.api.refreshToken({
        platform,
        accountId
      })

      if (!result.success) {
        throw new Error(result.error || '刷新令牌失败')
      }
    } catch (error) {
      console.error('刷新账户令牌失败:', error)
      throw error
    }
  }

  /**
   * 测试账户连接
   */
  async testAccountConnection(accountId: string): Promise<boolean> {
    try {
      // 这里可以调用平台适配器的测试连接方法
      if (window.electronAPI?.platformAdapter?.testConnection) {
        return await window.electronAPI.platformAdapter.testConnection(accountId)
      }

      // 浏览器环境返回模拟结果
      return Math.random() > 0.3 // 70% 成功率
    } catch (error) {
      console.error('测试账户连接失败:', error)
      return false
    }
  }

  /**
   * 批量测试所有账户连接
   */
  async testAllConnections(accounts: Account[]): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}

    // 并行测试所有连接
    const promises = accounts.map(async (account) => {
      try {
        const isConnected = await this.testAccountConnection(account.id)
        results[account.id] = isConnected
      } catch (error) {
        results[account.id] = false
      }
    })

    await Promise.all(promises)
    return results
  }

  /**
   * 获取账户统计信息
   */
  getAccountStats(accounts: Account[]) {
    const total = accounts.length
    const byPlatform = accounts.reduce((stats, account) => {
      stats[account.platform] = (stats[account.platform] || 0) + 1
      return stats
    }, {} as Record<string, number>)

    const connected = accounts.filter(acc => acc.connectionStatus === 'connected').length
    const disconnected = accounts.filter(acc => acc.connectionStatus === 'disconnected').length
    const error = accounts.filter(acc => acc.connectionStatus === 'error').length

    return {
      total,
      connected,
      disconnected,
      error,
      byPlatform
    }
  }

  /**
   * 根据令牌信息确定连接状态
   *
   * 注意：不再检查 expires_at 是否过期来判断状态
   * access_token 过期会在实际使用时由 GmailAdapter 自动刷新
   * 只有当 refresh_token 也过期时才需要用户重新授权
   */
  private determineConnectionStatus(token: any): Account['connectionStatus'] {
    // 检查是否有错误信息
    if (token.error) {
      return 'error'
    }

    // 如果有用户标识符和平台信息，且没有错误，认为是已连接
    // API返回的数据结构中不包含access_token字段，但包含用户信息
    if (token.user_identifier && token.platform) {
      return 'connected'
    }

    // 默认为未连接
    return 'disconnected'
  }

  /**
   * 获取模拟账户数据（用于浏览器环境测试）
   */
  private getMockAccounts(): Account[] {
    return [
      {
        id: 'gmail-1',
        platform: 'gmail',
        userIdentifier: 'user@gmail.com',
        displayName: '工作邮箱',
        name: 'John Doe',
        enabled: true,
        connectionStatus: 'connected',
        lastChecked: new Date()
      },
      {
        id: 'gmail-2',
        platform: 'gmail',
        userIdentifier: 'personal@gmail.com',
        displayName: '个人邮箱',
        name: 'John Doe',
        enabled: true,
        connectionStatus: 'connected',
        lastChecked: new Date()
      },
      {
        id: 'slack-1',
        platform: 'slack',
        userIdentifier: 'john.doe@company.com',
        displayName: '公司 Slack',
        name: 'John Doe',
        enabled: true,
        connectionStatus: 'connected',
        lastChecked: new Date()
      },
      {
        id: 'lark-1',
        platform: 'lark',
        userIdentifier: 'john.doe@company.com',
        displayName: '公司 Lark',
        name: 'John Doe',
        enabled: true,
        connectionStatus: 'error',
        lastChecked: new Date(),
        error: '令牌已过期'
      }
    ]
  }

  /**
   * 将账户转换为搜索请求中的平台列表
   */
  getSelectedPlatformsForSearch(accounts: Account[], selectedAccountIds: string[]): string[] {
    const selectedAccounts = accounts.filter(acc =>
      selectedAccountIds.includes(acc.id) &&
      acc.connectionStatus === 'connected'
    )

    // 按平台分组，返回有选中账户的平台列表
    const platforms = Array.from(new Set(selectedAccounts.map(acc => acc.platform)))
    return platforms
  }

  /**
   * 获取选中账户的详细信息（用于搜索请求）
   */
  getSelectedAccountsDetails(accounts: Account[], selectedAccountIds: string[]) {
    return accounts.filter(acc =>
      selectedAccountIds.includes(acc.id) &&
      acc.connectionStatus === 'connected'
    ).map(acc => ({
      id: acc.id,
      platform: acc.platform,
      userIdentifier: acc.userIdentifier,
      displayName: acc.displayName || acc.name
    }))
  }

  /**
   * 获取过期的账户
   */
  getExpiredAccounts(accounts: Account[], selectedAccountIds: string[]) {
    return accounts.filter(acc =>
      selectedAccountIds.includes(acc.id) &&
      acc.connectionStatus === 'error'
    ).map(acc => ({
      id: acc.id,
      platform: acc.platform,
      userIdentifier: acc.userIdentifier,
      displayName: acc.displayName || acc.name,
      error: acc.error,
      oauthAppName: acc.oauthAppName
    }))
  }

  /**
   * 检查选中账户中是否有过期的
   */
  hasExpiredAccounts(accounts: Account[], selectedAccountIds: string[]): boolean {
    return accounts.some(acc =>
      selectedAccountIds.includes(acc.id) &&
      acc.connectionStatus === 'error'
    )
  }

  /**
   * 启动OAuth重新授权流程
   */
  async startReauthorization(account: {
    platform: string;
    userIdentifier: string;
    displayName?: string;
    oauthAppName?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 首先获取正确的OAuth应用ID
      const oauthAppId = await this.findOAuthAppId(account.oauthAppName, account.platform);

      // 检查是否在Electron环境中
      if (window.electronAPI?.startOAuth) {
        // console.log('🔄 开始重新授权:', {
        //   ...account,
        //   oauthAppId
        // })

        const result = await window.electronAPI.startOAuth({
          platform: account.platform,
          accountEmail: account.userIdentifier,
          oauthAppId: oauthAppId // 传递正确的OAuth应用ID
        })

        if (result.success) {
          // console.log('✅ 重新授权成功:', account.userIdentifier)
          return { success: true }
        } else {
          console.error('❌ 重新授权失败:', result.error)
          return {
            success: false,
            error: result.error || '重新授权失败'
          }
        }
      } else {
        // 浏览器环境，尝试通过HTTP API
        const oauthServerUrl = await this.getOAuthServerUrl()
        const response = await fetch(`${oauthServerUrl}/api/oauth-apps`)
        if (response.ok) {
          const apps = await response.json()

          // 优先使用指定的OAuth应用
          let targetApp = null;
          if (account.oauthAppName) {
            targetApp = apps.find((app: any) =>
              app.name === account.oauthAppName &&
              app.platform === account.platform &&
              app.is_active
            );
          }

          // 如果找不到指定的应用，使用第一个可用的
          if (!targetApp) {
            targetApp = apps.find((app: any) =>
              app.platform === account.platform && app.is_active
            );
          }

          if (targetApp) {
            const authUrl = this.buildOAuthUrl(targetApp, account.userIdentifier)

            // 在新窗口中打开授权页面
            window.open(authUrl, '_blank', 'width=600,height=700')

            return {
              success: true,
              error: '请在新打开的窗口中完成授权'
            }
          }
        }

        return {
          success: false,
          error: '无法找到可用的OAuth配置'
        }
      }
    } catch (error) {
      console.error('启动重新授权失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '启动授权失败'
      }
    }
  }

  /**
   * 根据OAuth应用名称查找应用ID
   */
  private async findOAuthAppId(oauthAppName?: string, platform?: string): Promise<string | undefined> {
    try {
      const baseUrl = await this.getOAuthServerUrl();
      const response = await fetch(`${baseUrl}/api/oauth-apps`);
      if (response.ok) {
        const apps = await response.json();

        // 优先使用指定的OAuth应用名称
        if (oauthAppName) {
          const targetApp = apps.find((app: any) =>
            app.name === oauthAppName &&
            app.platform === platform &&
            app.is_active
          );
          if (targetApp) {
            // console.log(`🎯 找到匹配的OAuth应用: ${oauthAppName} (ID: ${targetApp.id})`);
            return targetApp.id;
          }
        }

        // 如果找不到指定的应用，使用第一个可用的
        const fallbackApp = apps.find((app: any) =>
          app.platform === platform && app.is_active
        );
        if (fallbackApp) {
          // console.log(`⚠️  使用备用OAuth应用: ${fallbackApp.name} (ID: ${fallbackApp.id})`);
          return fallbackApp.id;
        }
      }
    } catch (error) {
      console.error('查找OAuth应用失败:', error);
    }

    return undefined;
  }

  /**
   * 构建OAuth授权URL
   */
  private buildOAuthUrl(app: any, userIdentifier: string): string {
    const baseUrl = 'https://accounts.google.com/oauth2/v2/auth'
    const params = new URLSearchParams({
      client_id: app.client_id,
      redirect_uri: app.redirect_uri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly profile email',
      access_type: 'offline',
      prompt: 'consent',
      login_hint: userIdentifier,
      state: JSON.stringify({
        platform: app.platform,
        app_id: app.id,
        user_email: userIdentifier
      })
    })

    return `${baseUrl}?${params.toString()}`
  }

  /**
   * 批量重新授权多个账户
   */
  async batchReauthorize(accounts: Array<{
    platform: string;
    userIdentifier: string;
    displayName?: string;
    oauthAppName?: string;
  }>): Promise<Array<{ account: any; success: boolean; error?: string }>> {
    const results = []

    for (const account of accounts) {
      const result = await this.startReauthorization(account)
      results.push({
        account,
        success: result.success,
        error: result.error
      })

      // 添加延迟避免过快的请求
      if (accounts.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return results
  }
}

// 创建单例实例
let accountServiceInstance: AccountService | null = null

export const getAccountService = (): AccountService => {
  if (!accountServiceInstance) {
    accountServiceInstance = new AccountService()
  }
  return accountServiceInstance
}

export default AccountService