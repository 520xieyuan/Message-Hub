/**
 * IPC通信处理器
 * 设置主进程与渲染进程之间的所有IPC通信
 */

import { ipcMain, app, shell, dialog, BrowserWindow } from 'electron'
import { SearchRequest, SearchResponse } from '../../src/types/search'
import { PlatformConfig } from '../../src/types/platform'
import { UserConfig, WindowSettings } from '../../src/types/config'
import { AppError, ErrorType } from '../../src/types/error'

/**
 * 设置所有IPC处理器
 */
export function setupIpcHandlers(): void {
  // 应用相关的IPC处理器
  setupAppHandlers()
  
  // 搜索相关的IPC处理器
  setupSearchHandlers()
  
  // 平台配置相关的IPC处理器
  setupPlatformHandlers()
  
  // 配置管理相关的IPC处理器
  setupConfigHandlers()
  
  // 窗口管理相关的IPC处理器
  setupWindowHandlers()
  
  // 系统相关的IPC处理器
  setupSystemHandlers()
  
  // Chrome Profile相关的IPC处理器
  setupChromeProfileHandlers()
}

/**
 * 应用相关的IPC处理器
 */
function setupAppHandlers(): void {
  // 获取应用版本
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  // 获取平台信息
  ipcMain.handle('app:getPlatform', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node
    }
  })

  // 获取应用路径信息
  ipcMain.handle('app:getPaths', () => {
    return {
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      temp: app.getPath('temp'),
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads')
    }
  })

  // 重启应用
  ipcMain.handle('app:restart', () => {
    app.relaunch()
    app.exit()
  })

  // 退出应用
  ipcMain.handle('app:quit', () => {
    app.quit()
  })
}

/**
 * 搜索相关的IPC处理器
 */
function setupSearchHandlers(): void {
  // 执行搜索
  ipcMain.handle('search:perform', async (event, request: SearchRequest): Promise<SearchResponse> => {
    try {
      // 这里将在后续任务中实现实际的搜索逻辑
      // 目前返回模拟数据
      console.log('执行搜索:', request)
      
      // 模拟搜索延迟
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        searchTime: 1000,
        platformStatus: {}
      }
    } catch (error) {
      console.error('搜索失败:', error)
      throw createAppError(ErrorType.SEARCH_ERROR, '搜索执行失败', error)
    }
  })

  // 获取搜索历史
  ipcMain.handle('search:getHistory', async () => {
    try {
      // 这里将在后续任务中实现实际的历史获取逻辑
      console.log('获取搜索历史')
      return []
    } catch (error) {
      console.error('获取搜索历史失败:', error)
      throw createAppError(ErrorType.STORAGE_ERROR, '获取搜索历史失败', error)
    }
  })

  // 清除搜索历史
  ipcMain.handle('search:clearHistory', async () => {
    try {
      // 这里将在后续任务中实现实际的历史清除逻辑
      console.log('清除搜索历史')
      return true
    } catch (error) {
      console.error('清除搜索历史失败:', error)
      throw createAppError(ErrorType.STORAGE_ERROR, '清除搜索历史失败', error)
    }
  })

  // 取消搜索
  ipcMain.handle('search:cancel', async (event, searchId: string) => {
    try {
      // 这里将在后续任务中实现搜索取消逻辑
      console.log('取消搜索:', searchId)
      return true
    } catch (error) {
      console.error('取消搜索失败:', error)
      throw createAppError(ErrorType.SEARCH_ERROR, '取消搜索失败', error)
    }
  })
}

/**
 * 平台配置相关的IPC处理器
 */
function setupPlatformHandlers(): void {
  // 获取平台配置列表
  ipcMain.handle('platform:getConfigs', async (): Promise<PlatformConfig[]> => {
    try {
      // 这里将在后续任务中实现实际的配置获取逻辑
      console.log('获取平台配置')
      return []
    } catch (error) {
      console.error('获取平台配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '获取平台配置失败', error)
    }
  })

  // 添加平台配置
  ipcMain.handle('platform:addConfig', async (event, config: Omit<PlatformConfig, 'id' | 'lastUpdated'>): Promise<PlatformConfig> => {
    try {
      // 这里将在后续任务中实现实际的配置添加逻辑
      console.log('添加平台配置:', config)
      
      const newConfig: PlatformConfig = {
        ...config,
        id: `${config.name}_${Date.now()}`,
        lastUpdated: new Date()
      }
      
      return newConfig
    } catch (error) {
      console.error('添加平台配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '添加平台配置失败', error)
    }
  })

  // 更新平台配置
  ipcMain.handle('platform:updateConfig', async (event, id: string, config: Partial<PlatformConfig>): Promise<PlatformConfig> => {
    try {
      // 这里将在后续任务中实现实际的配置更新逻辑
      console.log('更新平台配置:', id, config)
      
      // 模拟返回更新后的配置
      return {
        ...config,
        id,
        lastUpdated: new Date()
      } as PlatformConfig
    } catch (error) {
      console.error('更新平台配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '更新平台配置失败', error)
    }
  })

  // 删除平台配置
  ipcMain.handle('platform:removeConfig', async (event, id: string): Promise<boolean> => {
    try {
      // 这里将在后续任务中实现实际的配置删除逻辑
      console.log('删除平台配置:', id)
      return true
    } catch (error) {
      console.error('删除平台配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '删除平台配置失败', error)
    }
  })

  // 测试平台连接
  ipcMain.handle('platform:testConnection', async (event, id: string): Promise<boolean> => {
    try {
      // 这里将在后续任务中实现实际的连接测试逻辑
      console.log('测试平台连接:', id)
      
      // 模拟连接测试延迟
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      return true
    } catch (error) {
      console.error('测试平台连接失败:', error)
      throw createAppError(ErrorType.PLATFORM_ERROR, '测试平台连接失败', error)
    }
  })

  // 开始OAuth认证
  ipcMain.handle('platform:startAuth', async (event, platformType: string): Promise<string> => {
    try {
      // 这里将在后续任务中实现实际的OAuth认证逻辑
      console.log('开始OAuth认证:', platformType)
      
      // 返回认证URL（模拟）
      return `https://oauth.${platformType}.com/authorize?client_id=xxx&redirect_uri=xxx`
    } catch (error) {
      console.error('开始OAuth认证失败:', error)
      throw createAppError(ErrorType.AUTH_ERROR, '开始OAuth认证失败', error)
    }
  })
}

/**
 * 配置管理相关的IPC处理器
 */
function setupConfigHandlers(): void {
  // 获取用户配置
  ipcMain.handle('config:getUserConfig', async (): Promise<UserConfig> => {
    try {
      // 这里将在后续任务中实现实际的配置获取逻辑
      console.log('获取用户配置')
      
      // 返回默认配置
      const defaultConfig: UserConfig = {
        userId: 'default',
        searchSettings: {
          defaultResultLimit: 50,
          enableSearchHistory: true,
          autoRefreshInterval: 300,
          searchTimeout: 30000,
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
      
      return defaultConfig
    } catch (error) {
      console.error('获取用户配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '获取用户配置失败', error)
    }
  })

  // 更新用户配置
  ipcMain.handle('config:updateUserConfig', async (event, config: Partial<UserConfig>): Promise<UserConfig> => {
    try {
      // 这里将在后续任务中实现实际的配置更新逻辑
      console.log('更新用户配置:', config)
      
      // 模拟返回更新后的配置
      return {
        ...config,
        lastUpdated: new Date()
      } as UserConfig
    } catch (error) {
      console.error('更新用户配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '更新用户配置失败', error)
    }
  })

  // 重置配置
  ipcMain.handle('config:resetConfig', async (): Promise<boolean> => {
    try {
      // 这里将在后续任务中实现实际的配置重置逻辑
      console.log('重置配置')
      return true
    } catch (error) {
      console.error('重置配置失败:', error)
      throw createAppError(ErrorType.CONFIG_ERROR, '重置配置失败', error)
    }
  })
}

/**
 * 窗口管理相关的IPC处理器
 */
function setupWindowHandlers(): void {
  // 最小化窗口
  ipcMain.handle('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.minimize()
    }
  })

  // 最大化/还原窗口
  ipcMain.handle('window:toggleMaximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  // 关闭窗口
  ipcMain.handle('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.close()
    }
  })

  // 获取窗口状态
  ipcMain.handle('window:getState', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      const bounds = window.getBounds()
      return {
        ...bounds,
        maximized: window.isMaximized(),
        minimized: window.isMinimized(),
        fullscreen: window.isFullScreen(),
        focused: window.isFocused()
      }
    }
    return null
  })

  // 设置窗口大小和位置
  ipcMain.handle('window:setBounds', (event, bounds: { x?: number, y?: number, width?: number, height?: number }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.setBounds(bounds)
    }
  })
}

/**
 * 系统相关的IPC处理器
 */
function setupSystemHandlers(): void {
  // 在外部浏览器中打开URL
  ipcMain.handle('system:openExternal', async (event, url: string) => {
    try {
      await shell.openExternal(url)
      return true
    } catch (error) {
      console.error('打开外部链接失败:', error)
      throw createAppError(ErrorType.UNKNOWN_ERROR, '打开外部链接失败', error)
    }
  })

  // 显示文件夹
  ipcMain.handle('system:showItemInFolder', async (event, path: string) => {
    try {
      shell.showItemInFolder(path)
      return true
    } catch (error) {
      console.error('显示文件夹失败:', error)
      throw createAppError(ErrorType.UNKNOWN_ERROR, '显示文件夹失败', error)
    }
  })

  // 显示消息框
  ipcMain.handle('system:showMessageBox', async (event, options: Electron.MessageBoxOptions) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showMessageBox(window || new BrowserWindow(), options)
      return result
    } catch (error) {
      console.error('显示消息框失败:', error)
      throw createAppError(ErrorType.UNKNOWN_ERROR, '显示消息框失败', error)
    }
  })

  // 显示错误对话框
  ipcMain.handle('system:showErrorBox', (event, title: string, content: string) => {
    dialog.showErrorBox(title, content)
  })

  // 显示文件保存对话框
  ipcMain.handle('system:showSaveDialog', async (event, options: Electron.SaveDialogOptions) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showSaveDialog(window || new BrowserWindow(), options)
      return result
    } catch (error) {
      console.error('显示保存对话框失败:', error)
      throw createAppError(ErrorType.UNKNOWN_ERROR, '显示保存对话框失败', error)
    }
  })

  // 显示文件打开对话框
  ipcMain.handle('system:showOpenDialog', async (event, options: Electron.OpenDialogOptions) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(window || new BrowserWindow(), options)
      return result
    } catch (error) {
      console.error('显示打开对话框失败:', error)
      throw createAppError(ErrorType.UNKNOWN_ERROR, '显示打开对话框失败', error)
    }
  })

  // 获取日志文件路径
  ipcMain.handle('system:getLogFilePath', async () => {
    try {
      const { logger } = require('./logger')
      return logger.getLogFilePath()
    } catch (error) {
      console.error('Failed to get log file path:', error)
      return null
    }
  })

  // 打开日志文件所在文件夹
  ipcMain.handle('system:showLogFile', async () => {
    try {
      const { logger } = require('./logger')
      const logPath = logger.getLogFilePath()
      shell.showItemInFolder(logPath)
      return true
    } catch (error) {
      console.error('Failed to show log file:', error)
      return false
    }
  })
}

/**
 * 创建应用错误对象
 */
function createAppError(type: ErrorType, message: string, originalError?: any): AppError {
  return {
    type,
    message,
    retryable: false,
    timestamp: new Date(),
    details: originalError,
    stack: originalError?.stack,
    userMessage: message
  }
}
/**
 * Chrome Profile相关的IPC处理器
 * 注意：Chrome Profile handlers 已在 main.ts 中注册
 */
function setupChromeProfileHandlers(): void {
  // Chrome Profile handlers 已在 main.ts 中注册
  // 这里保留空函数以保持代码结构一致
}
