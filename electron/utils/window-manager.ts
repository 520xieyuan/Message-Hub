/**
 * 窗口管理器
 * 负责管理应用窗口的创建、状态保存和恢复
 */

import { BrowserWindow, screen } from 'electron'
import Store from 'electron-store'
import { WindowSettings } from '../../src/types/config'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
  fullscreen: boolean
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private store: Store<{ windowState: WindowState }>

  constructor() {
    this.store = new Store({
      name: 'window-state',
      defaults: {
        windowState: {
          width: 1200,
          height: 800,
          maximized: false,
          fullscreen: false
        } as WindowState
      }
    })
  }

  /**
   * 创建主窗口
   */
  createMainWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    // 获取保存的窗口状态
    const savedState = this.store.get('windowState')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    // 确保窗口在屏幕范围内
    const windowState: WindowState = {
      width: Math.min(savedState.width, screenWidth),
      height: Math.min(savedState.height, screenHeight),
      maximized: savedState.maximized,
      fullscreen: savedState.fullscreen
    }

    // 如果有保存的位置，确保窗口在可见区域内
    if (savedState.x !== undefined && savedState.y !== undefined) {
      const displays = screen.getAllDisplays()
      const windowVisible = displays.some(display => {
        const { x, y, width, height } = display.bounds
        return savedState.x! >= x && savedState.x! < x + width &&
               savedState.y! >= y && savedState.y! < y + height
      })

      if (windowVisible) {
        windowState.x = savedState.x
        windowState.y = savedState.y
      }
    }

    // 合并选项
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      ...options,
      ...windowState,
      show: false // 总是先隐藏，等待ready-to-show事件
    }

    // 创建窗口
    this.mainWindow = new BrowserWindow(windowOptions)

    // 恢复窗口状态
    if (windowState.maximized) {
      this.mainWindow.maximize()
    }

    if (windowState.fullscreen) {
      this.mainWindow.setFullScreen(true)
    }

    // 监听窗口状态变化
    this.setupWindowStateListeners()

    return this.mainWindow
  }

  /**
   * 获取主窗口
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * 销毁主窗口
   */
  destroyMainWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.saveWindowState()
      this.mainWindow = null
    }
  }

  /**
   * 保存窗口状态
   */
  saveWindowState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    const bounds = this.mainWindow.getBounds()
    const windowState: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: this.mainWindow.isMaximized(),
      fullscreen: this.mainWindow.isFullScreen()
    }

    this.store.set('windowState', windowState)
  }

  /**
   * 获取窗口设置（用于前端）
   */
  getWindowSettings(): WindowSettings {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return this.store.get('windowState') as WindowSettings
    }

    const bounds = this.mainWindow.getBounds()
    return {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: this.mainWindow.isMaximized(),
      fullscreen: this.mainWindow.isFullScreen()
    }
  }

  /**
   * 应用窗口设置
   */
  applyWindowSettings(settings: Partial<WindowSettings>): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    // 应用尺寸和位置
    if (settings.width && settings.height) {
      this.mainWindow.setSize(settings.width, settings.height)
    }

    if (settings.x !== undefined && settings.y !== undefined) {
      this.mainWindow.setPosition(settings.x, settings.y)
    }

    // 应用窗口状态
    if (settings.maximized !== undefined) {
      if (settings.maximized) {
        this.mainWindow.maximize()
      } else {
        this.mainWindow.unmaximize()
      }
    }

    if (settings.fullscreen !== undefined) {
      this.mainWindow.setFullScreen(settings.fullscreen)
    }

    // 保存新的状态
    this.saveWindowState()
  }

  /**
   * 设置窗口状态监听器
   */
  private setupWindowStateListeners(): void {
    if (!this.mainWindow) {
      return
    }

    // 定期保存窗口状态
    const saveState = () => this.saveWindowState()

    this.mainWindow.on('resize', saveState)
    this.mainWindow.on('move', saveState)
    this.mainWindow.on('maximize', saveState)
    this.mainWindow.on('unmaximize', saveState)
    this.mainWindow.on('enter-full-screen', saveState)
    this.mainWindow.on('leave-full-screen', saveState)

    // 窗口关闭前保存状态
    this.mainWindow.on('close', () => {
      this.saveWindowState()
    })
  }

  /**
   * 重置窗口到默认状态
   */
  resetToDefault(): void {
    const defaultState: WindowState = {
      width: 1200,
      height: 800,
      maximized: false,
      fullscreen: false
    }

    this.store.set('windowState', defaultState)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setSize(defaultState.width, defaultState.height)
      this.mainWindow.center()
      
      if (this.mainWindow.isMaximized()) {
        this.mainWindow.unmaximize()
      }
      
      if (this.mainWindow.isFullScreen()) {
        this.mainWindow.setFullScreen(false)
      }
    }
  }
}