/**
 * OAuth IPC处理器
 * 处理渲染进程的OAuth相关请求
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IntegratedAuthService } from './IntegratedAuthService'
import { RemoteOAuthService } from './RemoteOAuthService'
import { logger } from '../utils/logger'

export class OAuthIPCHandlers {
  private integratedAuthService: IntegratedAuthService
  private remoteOAuthService: RemoteOAuthService

  constructor(
    integratedAuthService: IntegratedAuthService,
    remoteOAuthService: RemoteOAuthService
  ) {
    this.integratedAuthService = integratedAuthService
    this.remoteOAuthService = remoteOAuthService
    this.registerHandlers()
    this.setupTokensChangedForwarding()
  }

  private registerHandlers() {
    // 开始OAuth认证
    ipcMain.handle('oauth:start', async (event, options: { platform: string; accountEmail?: string; oauthAppId?: string; profileId?: string; displayName?: string; description?: string }) => {
      try {
        logger.info('🚀 [OAuth IPC] Starting OAuth authentication:', options)
        
        const result = await this.integratedAuthService.startAuthFlow({
          platform: options.platform as 'gmail' | 'slack' | 'lark',
          accountEmail: options.accountEmail,
          oauthAppId: options.oauthAppId,
          profileId: options.profileId,
          displayName: options.displayName,
          description: options.description,
          createProfile: true
        })
        
        logger.info('✅ [OAuth IPC] OAuth flow completed:', {
          success: result.success,
          hasAccount: !!result.account,
          error: result.error
        })
        
        return {
          success: result.success,
          account: result.account,
          error: result.error
        }
      } catch (error) {
        logger.error('❌ [OAuth IPC] OAuth authentication failed:', {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          type: error?.constructor?.name
        })
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })

    // 刷新令牌
    ipcMain.handle('oauth:refresh', async (event, options: { platform: string; accountId: string }) => {
      try {
        console.log('Refreshing token:', options)
        
        // 这里可以实现令牌刷新逻辑
        // 暂时返回成功
        return {
          success: true,
          message: '令牌刷新功能待实现'
        }
      } catch (error) {
        console.error('Token refresh failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })

    // 获取用户令牌
    ipcMain.handle('oauth:getUserTokens', async (event, userIdentifier: string, platform?: string) => {
      try {
        console.log('Getting user tokens:', userIdentifier, platform)
        
        const tokens = await this.remoteOAuthService.getUserTokens(userIdentifier, platform)
        return {
          success: true,
          data: tokens
        }
      } catch (error) {
        console.error('Failed to get user tokens:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          data: []
        }
      }
    })

    // 获取OAuth应用
    ipcMain.handle('oauth:getApps', async (event, platform?: string) => {
      try {
        console.log('Getting OAuth apps:', platform)
        
        const apps = await this.remoteOAuthService.getOAuthApps(platform)
        return {
          success: true,
          data: apps
        }
      } catch (error) {
        console.error('Failed to get OAuth apps:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          data: []
        }
      }
    })

    // 获取服务器统计
    ipcMain.handle('oauth:getStats', async (event) => {
      try {
        console.log('Getting server statistics')
        
        const stats = await this.remoteOAuthService.getStats()
        return {
          success: true,
          data: stats
        }
      } catch (error) {
        console.error('Failed to get server statistics:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          data: null
        }
      }
    })

    // 在Chrome Profile中打开URL
    ipcMain.handle('oauth:openInChrome', async (event, options: { accountId: string; url: string }) => {
      try {
        console.log('Opening URL in Chrome Profile:', options)
        
        await this.integratedAuthService.openAccountInBrowser(options.accountId, options.url)
        return {
          success: true,
          message: 'URL已在Chrome Profile中打开'
        }
      } catch (error) {
        console.error('Failed to open URL in Chrome Profile:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })

    console.log('OAuth IPC handlers registered')
  }

  /**
   * 设置 tokens-changed 事件转发到渲染进程
   */
  private setupTokensChangedForwarding() {
    this.remoteOAuthService.on('tokens-changed', (data) => {
      logger.info('🔄 [OAuthIPCHandlers] Forwarding tokens-changed event to renderer processes')

      // 通知所有窗口
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('tokens-changed', data)
          logger.info(`   ✅ Sent to window ${window.id}`)
        }
      })
    })

    logger.info('✅ [OAuthIPCHandlers] tokens-changed event forwarding setup complete')
  }

  /**
   * 清理资源
   */
  dispose() {
    // 移除IPC处理器
    ipcMain.removeHandler('oauth:start')
    ipcMain.removeHandler('oauth:refresh')
    ipcMain.removeHandler('oauth:getUserTokens')
    ipcMain.removeHandler('oauth:getApps')
    ipcMain.removeHandler('oauth:getStats')
    ipcMain.removeHandler('oauth:openInChrome')

    // 移除事件监听器
    this.remoteOAuthService.removeAllListeners('tokens-changed')

    console.log('OAuth IPC handlers cleaned up')
  }
}