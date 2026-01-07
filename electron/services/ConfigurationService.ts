/**
 * 配置管理服务
 * 管理用户配置、应用设置和平台配置
 * 使用 SecureStorageService 进行数据持久化
 */

import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { SecureStorageService } from './SecureStorageService'
import {
  UserConfig,
  SearchSettings,
  UISettings,
  PrivacySettings,
  AppConfig,
  WindowSettings
} from '../../src/types/config'

export interface ConfigurationServiceOptions {
  /** 安全存储服务实例 */
  secureStorage: SecureStorageService
  /** 默认配置 */
  defaultConfig?: Partial<UserConfig>
}

export class ConfigurationService extends EventEmitter {
  private secureStorage: SecureStorageService
  private userConfig: UserConfig | null = null
  private appConfig: AppConfig | null = null
  private clientId: string = ''
  private isInitialized = false

  // 配置键常量
  private static readonly CONFIG_KEYS = {
    USER_CONFIG: 'userConfig',
    APP_CONFIG: 'appConfig',
    SEARCH_HISTORY: 'searchHistory',
    WINDOW_STATE: 'windowState',
    CLIENT_ID: 'clientId'
  } as const

  constructor(options: ConfigurationServiceOptions) {
    super()
    this.secureStorage = options.secureStorage

    // 设置默认配置
    if (options.defaultConfig) {
      this.setDefaultUserConfig(options.defaultConfig)
    }
  }

  /**
   * 初始化配置服务
   */
  async initialize(): Promise<void> {
    try {
      // 验证存储完整性
      const isStorageValid = await this.secureStorage.validateStorageIntegrity()
      if (!isStorageValid) {
        console.warn('Storage integrity check failed, using default configuration')
      }

      // 加载用户配置
      await this.loadUserConfig()

      // 加载应用配置
      this.loadAppConfig()

      // 初始化 Client ID
      this.initializeClientId()

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      console.error('Failed to initialize configuration service:', error)
      throw new Error(`Configuration initialization failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 创建默认用户配置
   */
  private createDefaultUserConfig(): UserConfig {
    return {
      userId: `user-${Date.now()}`,
      searchSettings: {
        defaultResultLimit: 50,
        enableSearchHistory: true,
        autoRefreshInterval: 300,
        searchTimeout: 10000,
        enableCache: true,
        cacheExpiry: 3600,
        enableSearchSuggestions: true,
        defaultSortBy: 'relevance',
        defaultSortOrder: 'desc'
      },
      uiSettings: {
        theme: 'system',
        language: 'zh-CN',
        fontSize: 'medium',
        enableAnimations: true,
        showPlatformIcons: true,
        messageCardDensity: 'comfortable',
        sidebarExpanded: true,
        windowSettings: {
          width: 1200,
          height: 800,
          maximized: false,
          fullscreen: false
        }
      },
      privacySettings: {
        saveSearchHistory: true,
        searchHistoryRetentionDays: 30,
        enableUsageStats: false,
        enableErrorReporting: true,
        autoCleanCache: true,
        cacheCleanupInterval: 7
      },
      version: '1.0.0',
      lastUpdated: new Date()
    }
  }

  /**
   * 设置默认用户配置
   */
  private setDefaultUserConfig(defaultConfig: Partial<UserConfig>): void {
    // 这个方法现在主要用于在构造函数中设置默认值
    // 实际的默认配置创建在 createDefaultUserConfig 中
  }

  /**
   * 加载用户配置
   */
  private async loadUserConfig(): Promise<void> {
    try {
      this.userConfig = this.secureStorage.getConfig<UserConfig>(
        ConfigurationService.CONFIG_KEYS.USER_CONFIG
      )

      if (!this.userConfig) {
        // 如果没有配置，创建默认配置
        this.userConfig = this.createDefaultUserConfig()
        this.secureStorage.setConfig(ConfigurationService.CONFIG_KEYS.USER_CONFIG, this.userConfig)
      }
    } catch (error) {
      console.error('Failed to load user config:', error)
      throw error
    }
  }

  /**
   * 加载应用配置
   */
  private loadAppConfig(): void {
    try {
      this.appConfig = this.secureStorage.getConfig<AppConfig>(
        ConfigurationService.CONFIG_KEYS.APP_CONFIG,
        {
          version: '1.0.0',
          buildTime: new Date().toISOString(),
          environment: 'production',
          api: {
            baseUrl: '',
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            enableCache: true
          },
          security: {
            encryptionAlgorithm: 'aes256',
            keyLength: 256,
            enableSSLVerification: true,
            tokenRefreshThreshold: 300
          },
          logging: {
            level: 'info',
            enableFileLogging: true,
            maxFileSize: 10,
            maxFiles: 5,
            enableConsoleLogging: true
          }
        }
      )
    } catch (error) {
      console.error('Failed to load app config:', error)
      throw error
    }
  }

  /**
   * 获取用户配置
   */
  getUserConfig(): UserConfig {
    if (!this.isInitialized || !this.userConfig) {
      throw new Error('Configuration service not initialized')
    }
    return { ...this.userConfig }
  }

  /**
   * 更新用户配置
   */
  async updateUserConfig(updates: Partial<UserConfig>): Promise<void> {
    if (!this.isInitialized || !this.userConfig) {
      throw new Error('Configuration service not initialized')
    }

    try {
      // 合并配置更新
      const updatedConfig: UserConfig = {
        ...this.userConfig,
        ...updates,
        lastUpdated: new Date()
      }

      this.secureStorage.setConfig(ConfigurationService.CONFIG_KEYS.USER_CONFIG, updatedConfig)

      this.userConfig = updatedConfig
      this.emit('userConfigUpdated', updatedConfig)
    } catch (error) {
      console.error('Failed to update user config:', error)
      throw new Error(`Failed to update configuration: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取搜索设置
   */
  getSearchSettings(): SearchSettings {
    return this.getUserConfig().searchSettings
  }

  /**
   * 更新搜索设置
   */
  async updateSearchSettings(settings: Partial<SearchSettings>): Promise<void> {
    const currentConfig = this.getUserConfig()
    await this.updateUserConfig({
      searchSettings: {
        ...currentConfig.searchSettings,
        ...settings
      }
    })
  }

  /**
   * 获取UI设置
   */
  getUISettings(): UISettings {
    return this.getUserConfig().uiSettings
  }

  /**
   * 更新UI设置
   */
  async updateUISettings(settings: Partial<UISettings>): Promise<void> {
    const currentConfig = this.getUserConfig()
    await this.updateUserConfig({
      uiSettings: {
        ...currentConfig.uiSettings,
        ...settings
      }
    })
  }

  /**
   * 获取隐私设置
   */
  getPrivacySettings(): PrivacySettings {
    return this.getUserConfig().privacySettings
  }

  /**
   * 更新隐私设置
   */
  async updatePrivacySettings(settings: Partial<PrivacySettings>): Promise<void> {
    const currentConfig = this.getUserConfig()
    await this.updateUserConfig({
      privacySettings: {
        ...currentConfig.privacySettings,
        ...settings
      }
    })
  }



  /**
   * 获取应用配置
   */
  getAppConfig(): AppConfig {
    if (!this.appConfig) {
      throw new Error('App configuration not loaded')
    }
    return { ...this.appConfig }
  }

  /**
   * 更新应用配置
   */
  updateAppConfig(updates: Partial<AppConfig>): void {
    if (!this.appConfig) {
      throw new Error('App configuration not loaded')
    }

    this.appConfig = {
      ...this.appConfig,
      ...updates
    }

    this.secureStorage.setConfig(ConfigurationService.CONFIG_KEYS.APP_CONFIG, this.appConfig)
    this.emit('appConfigUpdated', this.appConfig)
  }

  /**
   * 保存窗口状态
   */
  saveWindowState(windowState: WindowSettings): void {
    this.secureStorage.setConfig(ConfigurationService.CONFIG_KEYS.WINDOW_STATE, windowState)
  }

  /**
   * 获取窗口状态
   */
  getWindowState(): WindowSettings | null {
    return this.secureStorage.getConfig<WindowSettings>(
      ConfigurationService.CONFIG_KEYS.WINDOW_STATE
    )
  }

  /**
   * 重置配置到默认值
   */
  async resetToDefaults(): Promise<void> {
    try {
      // 清除所有配置
      await this.secureStorage.clearAllSensitiveData()

      // 重新初始化
      this.userConfig = null
      this.appConfig = null
      this.isInitialized = false

      await this.initialize()

      this.emit('configReset')
    } catch (error) {
      console.error('Failed to reset configuration:', error)
      throw new Error(`Failed to reset configuration: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 导出配置（不包含敏感信息）
   */
  exportConfig(): object {
    const config = this.getUserConfig()
    return config
  }

  /**
   * 获取配置统计信息
   */
  getConfigStats(): {
    configSize: number
    lastUpdated: Date
  } {
    const config = this.getUserConfig()

    return {
      configSize: JSON.stringify(config).length,
      lastUpdated: config.lastUpdated
    }
  }

  /**
   * 验证配置完整性
   */
  validateConfig(): boolean {
    try {
      const config = this.getUserConfig()

      // 基本验证
      if (!config.userId || !config.version) {
        return false
      }

      return true
    } catch (error) {
      console.error('Config validation failed:', error)
      return false
    }
  }

  /**
   * 清理过期数据
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      const privacySettings = this.getPrivacySettings()

      if (privacySettings.autoCleanCache) {
        // 这里可以添加清理逻辑
        // 例如清理过期的搜索历史、缓存等
        this.emit('dataCleanupCompleted')
      }
    } catch (error) {
      console.error('Failed to cleanup expired data:', error)
    }
  }

  /**
   * 获取 OAuth Server URL
   */
  async getOAuthServerUrl(): Promise<string> {
    try {
      const url = this.secureStorage.getConfig<string>('oauthServerUrl')
      return url || process.env.OAUTH_SERVER_URL || 'http://localhost:3000'
    } catch (error) {
      console.error('Failed to get OAuth Server URL:', error)
      return process.env.OAUTH_SERVER_URL || 'http://localhost:3000'
    }
  }

  /**
   * 设置 OAuth Server URL
   */
  async setOAuthServerUrl(url: string): Promise<void> {
    try {
      // 验证 URL 格式
      new URL(url) // 如果格式不正确会抛出错误

      this.secureStorage.setConfig('oauthServerUrl', url)
      this.emit('oauthServerUrlChanged', url)
    } catch (error) {
      console.error('Failed to set OAuth Server URL:', error)
      throw new Error('Invalid URL format or storage error')
    }
  }

  /**
   * 初始化 Client ID
   */
  private initializeClientId(): void {
    let clientId = this.secureStorage.getConfig<string>(ConfigurationService.CONFIG_KEYS.CLIENT_ID)

    if (!clientId) {
      clientId = randomUUID()
      this.secureStorage.setConfig(ConfigurationService.CONFIG_KEYS.CLIENT_ID, clientId)
      console.log('🆕 Generated new Client ID:', clientId)
    } else {
      console.log('📌 Using existing Client ID:', clientId)
    }

    this.clientId = clientId
  }

  /**
   * 获取 Client ID
   */
  getClientId(): string {
    if (!this.clientId) {
      throw new Error('Client ID not initialized')
    }
    return this.clientId
  }

  /**
   * 设置 Client ID（用于跨设备同步）
   */
  setClientId(newClientId: string): void {
    if (!newClientId || newClientId.trim() === '') {
      throw new Error('Client ID cannot be empty')
    }

    console.log('🔄 Updating Client ID:', newClientId)
    this.clientId = newClientId.trim()
    this.secureStorage.setConfig(ConfigurationService.CONFIG_KEYS.CLIENT_ID, this.clientId)
    this.emit('clientIdChanged', this.clientId)
  }

  /**
   * 重置 Client ID（生成新的）
   */
  resetClientId(): string {
    const newClientId = randomUUID()
    this.setClientId(newClientId)
    console.log('🔄 Reset Client ID:', newClientId)
    return newClientId
  }
}