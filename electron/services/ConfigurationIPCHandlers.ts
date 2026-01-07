/**
 * 配置服务 IPC 处理器
 * 为渲染进程提供配置管理的 IPC 接口
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { ConfigurationService } from './ConfigurationService'
import { ServiceManager } from './ServiceManager'
import { 
  UserConfig, 
  SearchSettings, 
  UISettings, 
  PrivacySettings,
  WindowSettings 
} from '../../src/types/config'
import { PlatformConfig } from '../../src/types/platform'

export class ConfigurationIPCHandlers {
  private configService: ConfigurationService

  constructor(serviceManager: ServiceManager) {
    this.configService = serviceManager.getConfigurationService()
    this.registerHandlers()
    this.setupEventForwarding()
  }

  /**
   * 设置事件转发：将 ConfigurationService 的事件转发到渲染进程
   */
  private setupEventForwarding(): void {
    this.configService.on('oauthServerUrlChanged', (newUrl: string) => {
      const allWindows = BrowserWindow.getAllWindows()
      allWindows.forEach(window => {
        window.webContents.send('oauth-server-url-changed', newUrl)
      })
    })
  }

  /**
   * 注册所有 IPC 处理器
   */
  private registerHandlers(): void {
    // 用户配置相关
    ipcMain.handle('config:getUserConfig', this.handleGetUserConfig.bind(this))
    ipcMain.handle('config:updateUserConfig', this.handleUpdateUserConfig.bind(this))

    // 搜索设置相关
    ipcMain.handle('config:getSearchSettings', this.handleGetSearchSettings.bind(this))
    ipcMain.handle('config:updateSearchSettings', this.handleUpdateSearchSettings.bind(this))

    // UI设置相关
    ipcMain.handle('config:getUISettings', this.handleGetUISettings.bind(this))
    ipcMain.handle('config:updateUISettings', this.handleUpdateUISettings.bind(this))

    // 隐私设置相关
    ipcMain.handle('config:getPrivacySettings', this.handleGetPrivacySettings.bind(this))
    ipcMain.handle('config:updatePrivacySettings', this.handleUpdatePrivacySettings.bind(this))

    // 平台配置相关
    ipcMain.handle('config:getPlatformConfigs', this.handleGetPlatformConfigs.bind(this))
    ipcMain.handle('config:getPlatformConfig', this.handleGetPlatformConfig.bind(this))
    ipcMain.handle('config:addPlatformConfig', this.handleAddPlatformConfig.bind(this))
    ipcMain.handle('config:updatePlatformConfig', this.handleUpdatePlatformConfig.bind(this))
    ipcMain.handle('config:removePlatformConfig', this.handleRemovePlatformConfig.bind(this))
    ipcMain.handle('config:getEnabledPlatformConfigs', this.handleGetEnabledPlatformConfigs.bind(this))

    // 窗口状态相关
    ipcMain.handle('config:saveWindowState', this.handleSaveWindowState.bind(this))
    ipcMain.handle('config:getWindowState', this.handleGetWindowState.bind(this))

    // 工具方法
    ipcMain.handle('config:resetToDefaults', this.handleResetToDefaults.bind(this))
    ipcMain.handle('config:exportConfig', this.handleExportConfig.bind(this))
    ipcMain.handle('config:getConfigStats', this.handleGetConfigStats.bind(this))
    ipcMain.handle('config:validateConfig', this.handleValidateConfig.bind(this))

    // OAuth Server URL 相关
    ipcMain.handle('config:getOAuthServerUrl', this.handleGetOAuthServerUrl.bind(this))
    ipcMain.handle('config:setOAuthServerUrl', this.handleSetOAuthServerUrl.bind(this))

    // Client ID 管理相关
    ipcMain.handle('config:getClientId', this.handleGetClientId.bind(this))
    ipcMain.handle('config:setClientId', this.handleSetClientId.bind(this))
    ipcMain.handle('config:resetClientId', this.handleResetClientId.bind(this))
  }

  /**
   * 获取用户配置
   */
  private async handleGetUserConfig(event: IpcMainInvokeEvent): Promise<UserConfig> {
    try {
      return this.configService.getUserConfig()
    } catch (error) {
      console.error('Failed to get user config:', error)
      throw error
    }
  }

  /**
   * 更新用户配置
   */
  private async handleUpdateUserConfig(
    event: IpcMainInvokeEvent, 
    updates: Partial<UserConfig>
  ): Promise<void> {
    try {
      await this.configService.updateUserConfig(updates)
    } catch (error) {
      console.error('Failed to update user config:', error)
      throw error
    }
  }

  /**
   * 获取搜索设置
   */
  private async handleGetSearchSettings(event: IpcMainInvokeEvent): Promise<SearchSettings> {
    try {
      return this.configService.getSearchSettings()
    } catch (error) {
      console.error('Failed to get search settings:', error)
      throw error
    }
  }

  /**
   * 更新搜索设置
   */
  private async handleUpdateSearchSettings(
    event: IpcMainInvokeEvent, 
    settings: Partial<SearchSettings>
  ): Promise<void> {
    try {
      await this.configService.updateSearchSettings(settings)
    } catch (error) {
      console.error('Failed to update search settings:', error)
      throw error
    }
  }

  /**
   * 获取UI设置
   */
  private async handleGetUISettings(event: IpcMainInvokeEvent): Promise<UISettings> {
    try {
      return this.configService.getUISettings()
    } catch (error) {
      console.error('Failed to get UI settings:', error)
      throw error
    }
  }

  /**
   * 更新UI设置
   */
  private async handleUpdateUISettings(
    event: IpcMainInvokeEvent, 
    settings: Partial<UISettings>
  ): Promise<void> {
    try {
      await this.configService.updateUISettings(settings)
    } catch (error) {
      console.error('Failed to update UI settings:', error)
      throw error
    }
  }

  /**
   * 获取隐私设置
   */
  private async handleGetPrivacySettings(event: IpcMainInvokeEvent): Promise<PrivacySettings> {
    try {
      return this.configService.getPrivacySettings()
    } catch (error) {
      console.error('Failed to get privacy settings:', error)
      throw error
    }
  }

  /**
   * 更新隐私设置
   */
  private async handleUpdatePrivacySettings(
    event: IpcMainInvokeEvent, 
    settings: Partial<PrivacySettings>
  ): Promise<void> {
    try {
      await this.configService.updatePrivacySettings(settings)
    } catch (error) {
      console.error('Failed to update privacy settings:', error)
      throw error
    }
  }

  /**
   * 获取平台配置列表 - 已废弃，现在从 OAuth Server 获取
   */
  private async handleGetPlatformConfigs(event: IpcMainInvokeEvent): Promise<PlatformConfig[]> {
    // 返回空数组，platforms 现在从 OAuth Server 管理
    return []
  }

  /**
   * 获取特定平台配置 - 已废弃，现在从 OAuth Server 获取
   */
  private async handleGetPlatformConfig(
    event: IpcMainInvokeEvent, 
    platformId: string
  ): Promise<PlatformConfig | null> {
    // 返回 null，platforms 现在从 OAuth Server 管理
    return null
  }

  /**
   * 添加平台配置 - 已废弃，现在从 OAuth Server 管理
   */
  private async handleAddPlatformConfig(
    event: IpcMainInvokeEvent, 
    config: PlatformConfig
  ): Promise<void> {
    // 不执行任何操作，platforms 现在从 OAuth Server 管理
    console.warn('addPlatformConfig is deprecated, platforms are now managed by OAuth Server')
  }

  /**
   * 更新平台配置 - 已废弃，现在从 OAuth Server 管理
   */
  private async handleUpdatePlatformConfig(
    event: IpcMainInvokeEvent, 
    platformId: string, 
    updates: Partial<PlatformConfig>
  ): Promise<void> {
    // 不执行任何操作，platforms 现在从 OAuth Server 管理
    console.warn('updatePlatformConfig is deprecated, platforms are now managed by OAuth Server')
  }

  /**
   * 删除平台配置 - 已废弃，现在从 OAuth Server 管理
   */
  private async handleRemovePlatformConfig(
    event: IpcMainInvokeEvent, 
    platformId: string
  ): Promise<void> {
    // 不执行任何操作，platforms 现在从 OAuth Server 管理
    console.warn('removePlatformConfig is deprecated, platforms are now managed by OAuth Server')
  }

  /**
   * 获取启用的平台配置 - 已废弃，现在从 OAuth Server 获取
   */
  private async handleGetEnabledPlatformConfigs(event: IpcMainInvokeEvent): Promise<PlatformConfig[]> {
    // 返回空数组，platforms 现在从 OAuth Server 管理
    return []
  }

  /**
   * 保存窗口状态
   */
  private async handleSaveWindowState(
    event: IpcMainInvokeEvent, 
    windowState: WindowSettings
  ): Promise<void> {
    try {
      this.configService.saveWindowState(windowState)
    } catch (error) {
      console.error('Failed to save window state:', error)
      throw error
    }
  }

  /**
   * 获取窗口状态
   */
  private async handleGetWindowState(event: IpcMainInvokeEvent): Promise<WindowSettings | null> {
    try {
      return this.configService.getWindowState()
    } catch (error) {
      console.error('Failed to get window state:', error)
      throw error
    }
  }

  /**
   * 重置配置到默认值
   */
  private async handleResetToDefaults(event: IpcMainInvokeEvent): Promise<void> {
    try {
      await this.configService.resetToDefaults()
    } catch (error) {
      console.error('Failed to reset to defaults:', error)
      throw error
    }
  }

  /**
   * 导出配置
   */
  private async handleExportConfig(event: IpcMainInvokeEvent): Promise<object> {
    try {
      return this.configService.exportConfig()
    } catch (error) {
      console.error('Failed to export config:', error)
      throw error
    }
  }

  /**
   * 获取配置统计信息
   */
  private async handleGetConfigStats(event: IpcMainInvokeEvent): Promise<any> {
    try {
      return this.configService.getConfigStats()
    } catch (error) {
      console.error('Failed to get config stats:', error)
      throw error
    }
  }

  /**
   * 验证配置
   */
  private async handleValidateConfig(event: IpcMainInvokeEvent): Promise<boolean> {
    try {
      return this.configService.validateConfig()
    } catch (error) {
      console.error('Failed to validate config:', error)
      throw error
    }
  }

  /**
   * 获取 OAuth Server URL
   */
  private async handleGetOAuthServerUrl(event: IpcMainInvokeEvent): Promise<string> {
    try {
      return await this.configService.getOAuthServerUrl()
    } catch (error) {
      console.error('Failed to get OAuth Server URL:', error)
      throw error
    }
  }

  /**
   * 设置 OAuth Server URL
   */
  private async handleSetOAuthServerUrl(event: IpcMainInvokeEvent, url: string): Promise<void> {
    try {
      await this.configService.setOAuthServerUrl(url)
    } catch (error) {
      console.error('Failed to set OAuth Server URL:', error)
      throw error
    }
  }

  /**
   * 获取 Client ID
   */
  private async handleGetClientId(event: IpcMainInvokeEvent): Promise<string> {
    try {
      return this.configService.getClientId()
    } catch (error) {
      console.error('Failed to get Client ID:', error)
      throw error
    }
  }

  /**
   * 设置 Client ID（用于跨设备同步）
   */
  private async handleSetClientId(event: IpcMainInvokeEvent, newClientId: string): Promise<{ success: boolean; clientId?: string; error?: string }> {
    try {
      this.configService.setClientId(newClientId)
      return { success: true, clientId: newClientId }
    } catch (error) {
      console.error('Failed to set Client ID:', error)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * 重置 Client ID
   */
  private async handleResetClientId(event: IpcMainInvokeEvent): Promise<{ success: boolean; clientId: string }> {
    try {
      const newClientId = this.configService.resetClientId()
      return { success: true, clientId: newClientId }
    } catch (error) {
      console.error('Failed to reset Client ID:', error)
      throw error
    }
  }

  /**
   * 移除所有 IPC 处理器
   */
  removeHandlers(): void {
    const handlers = [
      'config:getUserConfig',
      'config:updateUserConfig',
      'config:getSearchSettings',
      'config:updateSearchSettings',
      'config:getUISettings',
      'config:updateUISettings',
      'config:getPrivacySettings',
      'config:updatePrivacySettings',
      'config:getPlatformConfigs',
      'config:getPlatformConfig',
      'config:addPlatformConfig',
      'config:updatePlatformConfig',
      'config:removePlatformConfig',
      'config:getEnabledPlatformConfigs',
      'config:saveWindowState',
      'config:getWindowState',
      'config:resetToDefaults',
      'config:exportConfig',
      'config:getConfigStats',
      'config:validateConfig',
      'config:getOAuthServerUrl',
      'config:setOAuthServerUrl',
      'config:getClientId',
      'config:setClientId',
      'config:resetClientId'
    ]

    handlers.forEach(handler => {
      ipcMain.removeHandler(handler)
    })
  }
}