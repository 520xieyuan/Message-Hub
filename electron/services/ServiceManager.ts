/**
 * 服务管理器
 * 负责初始化和管理所有应用服务
 * 提供服务依赖注入和生命周期管理
 */

import { EventEmitter } from 'events'
import { SecureStorageService, SecureStorageOptions } from './SecureStorageService'
import { ConfigurationService } from './ConfigurationService'
import { PlatformAdapterManager } from './PlatformAdapterManager'
import { SearchService, SearchServiceOptions } from './SearchService'
import { SearchIPCHandlers } from './SearchIPCHandlers'
import { IntegratedAuthService } from './IntegratedAuthService'
import { RemoteOAuthService } from './RemoteOAuthService'
import { OAuthIPCHandlers } from './OAuthIPCHandlers'
import { logger } from '../utils/logger'

export interface ServiceManagerOptions {
  /** 应用名称 */
  appName: string
  /** 应用版本 */
  appVersion: string
  /** 是否为开发环境 */
  isDevelopment: boolean
  /** OAuth服务器URL */
  oauthServerUrl?: string
  /** 安全存储选项 */
  secureStorageOptions?: Partial<SecureStorageOptions>
  /** 搜索服务选项 */
  searchServiceOptions?: Partial<SearchServiceOptions>
}

export class ServiceManager extends EventEmitter {
  private secureStorageService: SecureStorageService | null = null
  private configurationService: ConfigurationService | null = null
  private platformAdapterManager: PlatformAdapterManager | null = null
  private searchService: SearchService | null = null
  private searchIPCHandlers: SearchIPCHandlers | null = null
  private integratedAuthService: IntegratedAuthService | null = null
  private remoteOAuthService: RemoteOAuthService | null = null
  private oauthIPCHandlers: OAuthIPCHandlers | null = null
  private isInitialized = false
  private options: ServiceManagerOptions

  constructor(options: ServiceManagerOptions) {
    super()
    this.options = options
  }

  /**
   * 初始化所有服务
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing services...')

      // 初始化安全存储服务
      await this.initializeSecureStorage()

      // 初始化配置管理服务
      await this.initializeConfiguration()

      // 初始化平台适配器管理器
      await this.initializePlatformAdapterManager()

      // 初始化搜索服务
      await this.initializeSearchService()

      // 初始化集成认证服务
      await this.initializeIntegratedAuthService()

      this.isInitialized = true
      this.emit('initialized')

      logger.info('All services initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize services:', error)
      throw new Error(`Service initialization failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 初始化安全存储服务
   */
  private async initializeSecureStorage(): Promise<void> {
    const defaultOptions: SecureStorageOptions = {
      serviceName: this.options.appName,
      encryptionAlgorithm: 'aes256',
      enableEncryption: !this.options.isDevelopment
    }

    const options = {
      ...defaultOptions,
      ...this.options.secureStorageOptions
    }

    this.secureStorageService = new SecureStorageService(options)

    // 打印配置文件路径
    logger.info('📁 [ServiceManager] Config file location:', this.secureStorageService.getStorePath())

    // 验证存储服务
    const isValid = await this.secureStorageService.validateStorageIntegrity()
    if (!isValid) {
      logger.warn('Secure storage integrity check failed')
    }

    logger.info('Secure storage service initialized')
  }

  /**
   * 初始化配置管理服务
   */
  private async initializeConfiguration(): Promise<void> {
    if (!this.secureStorageService) {
      throw new Error('Secure storage service must be initialized first')
    }

    this.configurationService = new ConfigurationService({
      secureStorage: this.secureStorageService,
      defaultConfig: {
        userId: `user-${Date.now()}`,
        version: this.options.appVersion
      }
    })

    await this.configurationService.initialize()

    // 监听配置变更事件
    this.configurationService.on('userConfigUpdated', (config) => {
      this.emit('userConfigUpdated', config)
    })

    this.configurationService.on('appConfigUpdated', (config) => {
      this.emit('appConfigUpdated', config)
    })

    logger.info('Configuration service initialized')
  }

  /**
   * 初始化平台适配器管理器
   */
  private async initializePlatformAdapterManager(): Promise<void> {
    if (!this.configurationService) {
      throw new Error('Configuration service must be initialized first')
    }

    // 确保有默认的平台配置
    await this.ensureDefaultPlatformConfigs()

    this.platformAdapterManager = new PlatformAdapterManager(this.configurationService)
    await this.platformAdapterManager.initialize()

    logger.info('Platform adapter manager initialized')
  }

  /**
   * 确保有默认的平台配置
   */
  private async ensureDefaultPlatformConfigs(): Promise<void> {
    // Platform configs 现在从 OAuth Server 动态管理
    // 不再需要在本地创建默认配置
    return
  }

  // 以下方法已废弃，保留以避免破坏现有代码
  private async _deprecatedEnsureDefaultPlatformConfigs_OLD(): Promise<void> {
    // 已废弃，不再使用
    logger.warn('This method is deprecated')
  }

  /**
   * 从OAuth服务器创建Gmail配置
   */
  private async createGmailConfigsFromOAuthServer(): Promise<any[]> {
    return new Promise(async (resolve) => {
      const http = require('http')

      const serverUrl = this.configurationService
        ? await this.configurationService.getOAuthServerUrl()
        : process.env.OAUTH_SERVER_URL || 'http://localhost:3000';

      const req = http.get(`${serverUrl}/api/oauth-apps`, (res: any) => {
        let data = ''

        res.on('data', (chunk: any) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const apps = JSON.parse(data)
            const gmailApps = apps.filter((app: any) => app.platform === 'gmail' && app.is_active)

            const configs = gmailApps.map((app: any) => ({
              id: `gmail-${app.id}`,
              name: 'gmail' as const,
              displayName: app.name || 'Gmail',
              enabled: true,
              credentials: {
                accessToken: '', // 将在认证时获取
                refreshToken: '',
                clientId: app.client_id,
                clientSecret: '', // 需要从安全存储获取
                additional: {
                  redirectUri: app.redirect_uri,
                  oauthAppId: app.id
                }
              },
              settings: {
                searchScope: ['https://www.googleapis.com/auth/gmail.readonly'],
                maxResults: 100,
                timeout: 30000
              },
              connectionStatus: {
                connected: false,
                lastChecked: new Date(),
                error: 'Not authenticated - OAuth configuration available'
              },
              lastUpdated: new Date()
            }))

            console.log(`Found ${configs.length} Gmail OAuth apps from server`)
            resolve(configs)
          } catch (parseError) {
            console.warn('Failed to parse OAuth apps response:', parseError)
            resolve([])
          }
        })
      })

      req.on('error', (error: any) => {
        logger.warn('Failed to fetch OAuth apps from server:', error)
        resolve([])
      })

      req.setTimeout(5000, () => {
        console.warn('OAuth server request timeout')
        req.destroy()
        resolve([])
      })
    })
  }

  /**
   * 创建基本的Gmail配置（后备方案）- 已废弃
   * Platform configs 现在从 OAuth Server 管理
   */
  private async createBasicGmailConfig(): Promise<void> {
    // 不再需要创建本地配置
    console.log('createBasicGmailConfig is deprecated, platforms are now managed by OAuth Server')
  }

  /**
   * 初始化搜索服务
   */
  private async initializeSearchService(): Promise<void> {
    if (!this.platformAdapterManager || !this.configurationService) {
      throw new Error('Platform adapter manager and configuration service must be initialized first')
    }

    // 创建搜索服务
    this.searchService = new SearchService(
      this.platformAdapterManager,
      this.configurationService,
      this.options.searchServiceOptions
    )

    // 创建搜索IPC处理器
    this.searchIPCHandlers = new SearchIPCHandlers(this.searchService)

    console.log('Search service initialized')
  }

  /**
   * 获取安全存储服务
   */
  getSecureStorageService(): SecureStorageService {
    if (!this.secureStorageService) {
      throw new Error('Secure storage service not initialized')
    }
    return this.secureStorageService
  }

  /**
   * 获取配置管理服务
   */
  getConfigurationService(): ConfigurationService {
    if (!this.configurationService) {
      throw new Error('Configuration service not initialized')
    }
    return this.configurationService
  }

  /**
   * 获取平台适配器管理器
   */
  getPlatformAdapterManager(): PlatformAdapterManager {
    if (!this.platformAdapterManager) {
      throw new Error('Platform adapter manager not initialized')
    }
    return this.platformAdapterManager
  }

  /**
   * 初始化集成认证服务
   */
  private async initializeIntegratedAuthService(): Promise<void> {
    logger.info('🔧 [ServiceManager] Starting IntegratedAuthService initialization...')
    
    try {
      if (!this.configurationService) {
        throw new Error('Configuration service must be initialized first')
      }

      const serverUrl = await this.configurationService.getOAuthServerUrl()

      logger.info(`🔧 [ServiceManager] Initializing OAuth services with URL: ${serverUrl}`)

      // 初始化RemoteOAuthService（传入 serverUrl 和 ConfigurationService）
      this.remoteOAuthService = new RemoteOAuthService({
        serverUrl,
        httpServerUrl: serverUrl
      }, this.configurationService)

      // 初始化IntegratedAuthService（传入 serverUrl 和 ConfigurationService）
      this.integratedAuthService = new IntegratedAuthService(serverUrl, this.configurationService)

      // 监听 OAuth Server URL 变更
      this.configurationService.on('oauthServerUrlChanged', async (newUrl: string) => {
        logger.info(`🔄 [ServiceManager] OAuth Server URL changed to: ${newUrl}`)
        
        try {
          // 1. 断开并重新创建 RemoteOAuthService
          if (this.remoteOAuthService) {
            this.remoteOAuthService.disconnect()
          }
          this.remoteOAuthService = new RemoteOAuthService({ 
            serverUrl: newUrl,
            httpServerUrl: newUrl 
          }, this.configurationService || undefined)
          
          // 2. 断开并重新创建 IntegratedAuthService
          if (this.integratedAuthService) {
            await this.integratedAuthService.disconnect()
          }
          this.integratedAuthService = new IntegratedAuthService(newUrl, this.configurationService || undefined)
          
          // 3. 连接并初始化
          try {
            await this.remoteOAuthService.connect()
            await this.integratedAuthService.initialize()
            logger.info('✅ [ServiceManager] OAuth services reconnected successfully')
          } catch (connectionError) {
            logger.warn('⚠️  [ServiceManager] OAuth server connection failed after URL change:', connectionError)
            // 即使连接失败，也要初始化服务
            await this.integratedAuthService.initialize()
          }
          
          // 4. 重新创建 OAuth IPC 处理器
          if (this.oauthIPCHandlers) {
            this.oauthIPCHandlers.dispose()
          }
          this.oauthIPCHandlers = new OAuthIPCHandlers(
            this.integratedAuthService,
            this.remoteOAuthService
          )
          
          logger.info('✅ [ServiceManager] OAuth services updated successfully')
        } catch (error) {
          logger.error('❌ [ServiceManager] Failed to update OAuth services:', {
            error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          })
        }
      })

      // 尝试连接OAuth服务器
      try {
        await this.remoteOAuthService.connect()
        await this.integratedAuthService.initialize()
        logger.info('OAuth server connected successfully')
      } catch (connectionError) {
        logger.warn('OAuth server connection failed, will retry later:', connectionError)
        // 即使连接失败，也要初始化服务，允许后续重连
        await this.integratedAuthService.initialize()
      }

      // 始终创建OAuth IPC处理器，即使连接失败
      this.oauthIPCHandlers = new OAuthIPCHandlers(
        this.integratedAuthService,
        this.remoteOAuthService
      )

      logger.info('✅ [ServiceManager] Integrated auth service initialized successfully')
    } catch (error) {
      logger.error('❌ [ServiceManager] Failed to initialize integrated auth service:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      // 不抛出错误，允许应用在没有OAuth服务器的情况下运行
    }
  }

  /**
   * 获取搜索服务
   */
  getSearchService(): SearchService {
    if (!this.searchService) {
      throw new Error('Search service not initialized')
    }
    return this.searchService
  }

  /**
   * 获取集成认证服务
   */
  getIntegratedAuthService(): IntegratedAuthService | null {
    return this.integratedAuthService
  }

  /**
   * 检查服务是否已初始化
   */
  isServiceInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * 获取服务状态
   */
  getServiceStatus(): {
    initialized: boolean
    secureStorage: boolean
    configuration: boolean
    platformAdapterManager: boolean
    searchService: boolean
  } {
    return {
      initialized: this.isInitialized,
      secureStorage: this.secureStorageService !== null,
      configuration: this.configurationService !== null,
      platformAdapterManager: this.platformAdapterManager !== null,
      searchService: this.searchService !== null
    }
  }

  /**
   * 关闭所有服务
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down services...')

      // 清理OAuth IPC处理器
      if (this.oauthIPCHandlers) {
        this.oauthIPCHandlers.dispose()
        this.oauthIPCHandlers = null
      }

      // 清理集成认证服务
      if (this.integratedAuthService) {
        await this.integratedAuthService.disconnect()
        this.integratedAuthService = null
      }

      // 清理远程OAuth服务
      if (this.remoteOAuthService) {
        this.remoteOAuthService.disconnect()
        this.remoteOAuthService = null
      }

      // 清理搜索服务
      if (this.searchIPCHandlers) {
        await this.searchIPCHandlers.cleanup()
        this.searchIPCHandlers = null
      }

      if (this.searchService) {
        await this.searchService.cleanup()
        this.searchService = null
      }

      // 清理平台适配器管理器
      if (this.platformAdapterManager) {
        await this.platformAdapterManager.cleanup()
        this.platformAdapterManager = null
      }

      // 清理配置服务
      if (this.configurationService) {
        this.configurationService.removeAllListeners()
        this.configurationService = null
      }

      // 清理安全存储服务
      if (this.secureStorageService) {
        this.secureStorageService = null
      }

      this.isInitialized = false
      this.emit('shutdown')

      console.log('All services shut down successfully')
    } catch (error) {
      console.error('Failed to shutdown services:', error)
      throw new Error(`Service shutdown failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 重启服务
   */
  async restart(): Promise<void> {
    await this.shutdown()
    await this.initialize()
  }

  /**
   * 获取服务统计信息
   */
  async getServiceStats(): Promise<{
    storage: any
    configuration: any
    platformAdapters: any
    search?: any
  }> {
    const stats = {
      storage: null as any,
      configuration: null as any,
      platformAdapters: null as any,
      search: null as any
    }

    try {
      if (this.secureStorageService) {
        stats.storage = this.secureStorageService.getStorageStats()
      }

      if (this.configurationService) {
        stats.configuration = this.configurationService.getConfigStats()
      }

      if (this.platformAdapterManager) {
        stats.platformAdapters = {
          activeAdapters: this.platformAdapterManager.getActiveAdapters(),
          adapterCount: this.platformAdapterManager.getActiveAdapters().length
        }
      }

      if (this.searchService) {
        stats.search = this.searchService.getMetrics()
      }
    } catch (error) {
      console.error('Failed to get service stats:', error)
    }

    return stats
  }

  /**
   * 执行服务健康检查
   */
  async performHealthCheck(): Promise<{
    overall: boolean
    services: {
      secureStorage: boolean
      configuration: boolean
      platformAdapters: boolean
      searchService: boolean
    }
    errors: string[]
  }> {
    const result = {
      overall: true,
      services: {
        secureStorage: false,
        configuration: false,
        platformAdapters: false,
        searchService: false
      },
      errors: [] as string[]
    }

    try {
      // 检查安全存储服务
      if (this.secureStorageService) {
        result.services.secureStorage = await this.secureStorageService.validateStorageIntegrity()
        if (!result.services.secureStorage) {
          result.errors.push('Secure storage integrity check failed')
        }
      } else {
        result.errors.push('Secure storage service not initialized')
      }

      // 检查配置服务
      if (this.configurationService) {
        result.services.configuration = this.configurationService.validateConfig()
        if (!result.services.configuration) {
          result.errors.push('Configuration validation failed')
        }
      } else {
        result.errors.push('Configuration service not initialized')
      }

      // 检查平台适配器管理器
      if (this.platformAdapterManager) {
        const activeAdapters = this.platformAdapterManager.getActiveAdapters()
        result.services.platformAdapters = activeAdapters.length >= 0 // 允许0个适配器
        if (!result.services.platformAdapters) {
          result.errors.push('Platform adapter manager validation failed')
        }
      } else {
        result.errors.push('Platform adapter manager not initialized')
      }

      // 检查搜索服务
      if (this.searchService) {
        result.services.searchService = true
      } else {
        result.errors.push('Search service not initialized')
      }

      result.overall = result.services.secureStorage && result.services.configuration && result.services.platformAdapters && result.services.searchService
    } catch (error) {
      result.errors.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`)
      result.overall = false
    }

    return result
  }
}