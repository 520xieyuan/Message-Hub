import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import { join } from 'path'
import { isDev, isWindows, isMacOS } from './utils/env'
import { setupIpcHandlers } from './utils/ipc-handlers'
import { WindowManager } from './utils/window-manager'
import { ServiceManager } from './services/ServiceManager'
import { ConfigurationIPCHandlers } from './services/ConfigurationIPCHandlers'
import { PlatformAdapterIPCHandlers } from './services/PlatformAdapterIPCHandlers'
import { SearchIPCHandlers } from './services/SearchIPCHandlers'
import { LLMService } from './services/LLMService'
import { LLMIPCHandlers } from './ipc/LLMIPCHandlers'

// Window manager instance
let windowManager: WindowManager | null = null

// Service manager instance
let serviceManager: ServiceManager | null = null

// Configuration IPC handlers instance
let configIPCHandlers: ConfigurationIPCHandlers | null = null

// Platform adapter IPC handlers instance
let platformAdapterIPCHandlers: PlatformAdapterIPCHandlers | null = null

// Search service IPC handlers instance
let searchIPCHandlers: SearchIPCHandlers | null = null

// LLM service instance
let llmService: LLMService | null = null

// LLM IPC handlers instance
let llmIPCHandlers: LLMIPCHandlers | null = null

// Application quit status flag
let isQuitting = false

/**
 * Setup system-related IPC handlers
 */
function setupSystemHandlers(): void {
  // Open URL in external browser
  ipcMain.handle('system:openExternal', async (event, url: string) => {
    try {
      await shell.openExternal(url)
      return true
    } catch (error) {
      console.error('Failed to open external link:', error)
      return false
    }
  })


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

  // 获取日志文件路径
  ipcMain.handle('system:getLogFilePath', async () => {
    try {
      const { logger } = require('./utils/logger')
      return logger.getLogFilePath()
    } catch (error) {
      console.error('Failed to get log file path:', error)
      return null
    }
  })

  // 打开日志文件所在文件夹
  ipcMain.handle('system:showLogFile', async () => {
    try {
      const { logger } = require('./utils/logger')
      const logPath = logger.getLogFilePath()
      shell.showItemInFolder(logPath)
      return true
    } catch (error) {
      console.error('Failed to show log file:', error)
      return false
    }
  })

  // 强制窗口获取焦点
  ipcMain.handle('window:forceFocus', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
      // 稍微延迟一下再次聚焦 webContents
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.webContents.focus()
        }
      }, 100)
    }
  })
}

/**
 * 设置Chrome Profile相关的IPC处理器
 */
function setupChromeProfileHandlers(): void {
  const { ChromeProfileManager } = require('./services/ChromeProfileManager')
  const profileManager = new ChromeProfileManager()

  // 获取所有Chrome Profiles列表
  ipcMain.handle('chrome:listProfiles', async () => {
    try {
      const profiles = await profileManager.listProfiles()
      return {
        success: true,
        data: profiles
      }
    } catch (error) {
      console.error('[Chrome Profile] Failed to list profiles:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      }
    }
  })

  // 使用Chrome Profile打开Gmail
  ipcMain.handle('chrome:openGmailWithProfile', async (event, options: { accountEmail: string; url: string; displayName?: string }) => {
    try {
      console.log('[Chrome Profile] Opening Gmail with profile:', options.accountEmail)

      // 获取或创建Chrome Profile
      const profile = await profileManager.getOrCreateProfile(
        'gmail',
        options.accountEmail,
        options.displayName
      )

      // 使用Profile打开Chrome
      await profileManager.openChromeWithProfile(profile.id, options.url)

      return {
        success: true,
        message: `Chrome opened with profile: ${profile.displayName || profile.accountEmail}`
      }
    } catch (error) {
      console.error('[Chrome Profile] Failed to open Gmail with profile:', error)

      // 降级方案：使用默认浏览器打开
      try {
        console.log('[Chrome Profile] Falling back to default browser')
        const { shell } = require('electron')
        await shell.openExternal(options.url)
        return {
          success: true,
          message: '已使用默认浏览器打开（Chrome Profile 不可用）',
          fallback: true
        }
      } catch (fallbackError) {
        console.error('[Chrome Profile] Fallback also failed:', fallbackError)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  })

  // 诊断 Chrome 安装
  ipcMain.handle('chrome:diagnose', async () => {
    try {
      const result = await profileManager.diagnoseChrome()
      return result
    } catch (error) {
      console.error('[Chrome Profile] Diagnosis failed:', error)
      return {
        success: false,
        chromePath: null,
        userDataDir: null,
        checkedPaths: [],
        profiles: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })
}

function createWindow(): void {
  // 创建窗口管理器
  windowManager = new WindowManager()

  // 获取保存的窗口状态
  let windowState = {
    width: 1200,
    height: 800,
    x: undefined as number | undefined,
    y: undefined as number | undefined,
    maximized: false,
    fullscreen: false
  }
  if (serviceManager) {
    try {
      const savedState = serviceManager.getConfigurationService().getWindowState()
      if (savedState) {
        windowState = {
          width: savedState.width,
          height: savedState.height,
          x: savedState.x,
          y: savedState.y,
          maximized: savedState.maximized,
          fullscreen: savedState.fullscreen
        }
      }
    } catch (error) {
      console.warn('Failed to load window state:', error)
    }
  }

  // 创建主窗口
  const mainWindow = windowManager.createMainWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
      // 启用网络访问以支持OAuth认证
      webSecurity: !isDev,
      // 允许运行不安全的内容（仅开发环境）
      allowRunningInsecureContent: isDev,
      // 启用焦点相关特性，修复 Input 框无法获取焦点的问题
      enableBlinkFeatures: 'FocuslessSpatialNavigation',
      // 禁用可能导致焦点问题的特性
      disableBlinkFeatures: '',
    },
    show: false, // 先不显示窗口，等待ready-to-show事件
    titleBarStyle: isWindows ? 'default' : 'hiddenInset',
    // 设置应用图标（如果存在）
    ...(process.platform !== 'darwin' && {
      icon: join(__dirname, '../assets/icon.png')
    }),
    // 启用原生窗口框架
    frame: true,
    // 设置背景色
    backgroundColor: '#ffffff',
  })

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // 开发环境下打开开发者工具
    mainWindow.webContents.openDevTools()
  } else {
    // 打包后的路径：dist/main/electron/main.js -> dist/renderer/index.html
    mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
  }

  // 当窗口准备好显示时显示窗口
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 恢复窗口状态
      if (windowState.maximized) {
        mainWindow.maximize()
      }
      if (windowState.fullscreen) {
        mainWindow.setFullScreen(true)
      }

      mainWindow.show()
      mainWindow.focus()

      // 确保 webContents 获取焦点，解决 Input 框无法聚焦的问题
      // 使用多次尝试策略
      const focusWebContents = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.focus()
        }
      }

      focusWebContents()
      setTimeout(focusWebContents, 100)
      setTimeout(focusWebContents, 500)
    }
  })

  // 当窗口获得焦点时，确保 webContents 也获得焦点
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.focus()
    }
  })

  // 当窗口从隐藏状态恢复时，强制聚焦
  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus()
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.focus()
        }
      }, 100)
    }
  })

  // 当窗口从最小化恢复时，强制聚焦
  mainWindow.on('restore', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus()
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.focus()
        }
      }, 100)
    }
  })

  // 处理窗口关闭事件
  mainWindow.on('close', (event) => {
    if (isMacOS && !isQuitting) {
      // macOS上隐藏窗口而不是关闭
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // 当窗口关闭时触发
  mainWindow.on('closed', () => {
    if (windowManager) {
      windowManager.destroyMainWindow()
    }
  })

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 在外部浏览器中打开链接
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 防止导航到外部URL
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    if (parsedUrl.origin !== 'http://localhost:5173' && !isDev) {
      event.preventDefault()
    }
  })
}

// 初始化服务
async function initializeServices(): Promise<void> {
  try {
    console.log('Initializing application services...')

    // 创建服务管理器
    serviceManager = new ServiceManager({
      appName: 'mcare-message-hub',
      appVersion: app.getVersion(),
      isDevelopment: isDev,
      secureStorageOptions: {
        enableEncryption: !isDev // 开发环境禁用加密以便调试
      }
    })

    // 初始化所有服务
    await serviceManager.initialize()

    // 设置配置服务的IPC处理器
    configIPCHandlers = new ConfigurationIPCHandlers(serviceManager)

    // 设置平台适配器的IPC处理器
    platformAdapterIPCHandlers = new PlatformAdapterIPCHandlers(serviceManager.getPlatformAdapterManager())

    // 设置搜索服务的IPC处理器
    searchIPCHandlers = new SearchIPCHandlers(serviceManager.getSearchService())

    // 初始化LLM服务和IPC处理器
    llmService = new LLMService()

    // 设置 OAuth Server URL 以获取远程 LLM 配置
    const oauthServerUrl = await serviceManager.getConfigurationService().getOAuthServerUrl()
    llmService.setOAuthServerUrl(oauthServerUrl)

    // 预加载远程 LLM 配置（不阻塞启动，但尽早加载）
    llmService.fetchRemoteConfig().catch((err) => {
      console.warn('[Main] Failed to preload LLM config:', err)
    })

    // 监听 OAuth Server URL 变更
    serviceManager.getConfigurationService().on('oauthServerUrlChanged', (newUrl: string) => {
      if (llmService) {
        llmService.setOAuthServerUrl(newUrl)
        console.log(`[Main] LLMService OAuth Server URL updated to: ${newUrl}`)
      }
    })

    llmIPCHandlers = new LLMIPCHandlers(llmService)

    // 设置系统相关的IPC处理器（只注册system和window handlers）
    setupSystemHandlers()

    // 设置Chrome Profile的IPC处理器
    setupChromeProfileHandlers()

    // 监听服务事件
    serviceManager.on('userConfigUpdated', (config) => {
      // 通知渲染进程配置已更新
      windowManager?.getMainWindow()?.webContents.send('config:userConfigUpdated', config)
    })

    serviceManager.on('appConfigUpdated', (config) => {
      // 通知渲染进程应用配置已更新
      windowManager?.getMainWindow()?.webContents.send('config:appConfigUpdated', config)
    })

    console.log('All services initialized successfully')
  } catch (error) {
    console.error('Failed to initialize services:', error)
    throw error
  }
}

// 设置应用菜单
function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建搜索',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            windowManager?.getMainWindow()?.webContents.send('menu:new-search')
          }
        },
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            windowManager?.getMainWindow()?.webContents.send('menu:open-settings')
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: isMacOS ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: async () => {
            await dialog.showMessageBox(windowManager?.getMainWindow() || new BrowserWindow(), {
              type: 'info',
              title: '关于 MCare Message Hub',
              message: 'MCare Message Hub',
              detail: `版本: ${app.getVersion()}\n统一搜索Slack、Gmail、Lark等平台的消息`
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(async () => {
  try {
    // 设置应用安全策略
    setupSecurityPolicy()

    // 初始化服务管理器（会自动注册所有 IPC handlers）
    await initializeServices()

    // 创建应用菜单
    createApplicationMenu()

    // 创建主窗口
    createWindow()

    app.on('activate', () => {
      // 在macOS上，当点击dock图标并且没有其他窗口打开时，通常会重新创建一个窗口
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else if (windowManager?.getMainWindow()) {
        // 如果窗口存在但被隐藏，则显示它
        windowManager.getMainWindow()?.show()
      }
    })
  } catch (error) {
    console.error('Failed to initialize application:', error)
    dialog.showErrorBox('初始化失败', `应用初始化失败: ${error instanceof Error ? error.message : String(error)}`)
    app.quit()
  }
})

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  // 在macOS上，应用和它们的菜单栏通常会保持活跃状态，直到用户使用Cmd + Q明确退出
  if (!isMacOS) {
    app.quit()
  }
})

// 应用即将退出时的清理工作
app.on('before-quit', async () => {
  isQuitting = true

  try {
    // 保存窗口状态
    if (windowManager && serviceManager) {
      const configService = serviceManager.getConfigurationService()
      const mainWindow = windowManager.getMainWindow()

      if (mainWindow && !mainWindow.isDestroyed()) {
        const bounds = mainWindow.getBounds()
        const windowState = {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          maximized: mainWindow.isMaximized(),
          fullscreen: mainWindow.isFullScreen()
        }
        configService.saveWindowState(windowState)
      }
    }

    // 关闭服务
    if (serviceManager) {
      await serviceManager.shutdown()
    }

    // 清理IPC处理器
    if (configIPCHandlers) {
      configIPCHandlers.removeHandlers()
    }

    if (platformAdapterIPCHandlers) {
      platformAdapterIPCHandlers.removeHandlers()
    }

    if (searchIPCHandlers) {
      await searchIPCHandlers.cleanup()
    }

    // 清理LLM IPC处理器和服务
    if (llmIPCHandlers) {
      await llmIPCHandlers.cleanup()
    }

    if (llmService) {
      await llmService.cleanup()
    }
  } catch (error) {
    console.error('Error during app shutdown:', error)
  }
})

// 设置安全策略
function setupSecurityPolicy(): void {
  // 设置内容安全策略
  app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
      // 阻止新窗口创建，改为在外部浏览器打开
      event.preventDefault()
      shell.openExternal(navigationUrl)
    })

    contents.on('will-attach-webview', (event, webPreferences, params) => {
      // 阻止webview附加
      event.preventDefault()
    })

    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl)

      // 只允许导航到本地开发服务器或打包后的文件
      if (isDev && parsedUrl.origin !== 'http://localhost:5173') {
        event.preventDefault()
      } else if (!isDev && !navigationUrl.startsWith('file://')) {
        event.preventDefault()
      }
    })
  })
}