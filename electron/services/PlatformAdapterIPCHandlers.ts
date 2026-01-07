/**
 * 平台适配器IPC处理器
 * 处理渲染进程与平台适配器管理器之间的通信
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { PlatformAdapterManager } from './PlatformAdapterManager';
import { SearchRequest, SearchResponse } from '../../src/types/search';
import { PlatformConfig, AuthResult, PlatformUserInfo } from '../../src/types/platform';

export class PlatformAdapterIPCHandlers {
  private platformAdapterManager: PlatformAdapterManager;

  constructor(platformAdapterManager: PlatformAdapterManager) {
    this.platformAdapterManager = platformAdapterManager;
    this.registerHandlers();
  }

  /**
   * 注册所有IPC处理器
   */
  private registerHandlers(): void {
    // 搜索相关
    ipcMain.handle('platform-adapter:search', this.handleSearch.bind(this));
    
    // 平台管理相关
    ipcMain.handle('platform-adapter:load-adapter', this.handleLoadAdapter.bind(this));
    ipcMain.handle('platform-adapter:unload-adapter', this.handleUnloadAdapter.bind(this));
    ipcMain.handle('platform-adapter:reload-adapter', this.handleReloadAdapter.bind(this));
    ipcMain.handle('platform-adapter:get-active-adapters', this.handleGetActiveAdapters.bind(this));
    
    // 认证相关
    ipcMain.handle('platform-adapter:authenticate', this.handleAuthenticate.bind(this));
    ipcMain.handle('platform-adapter:refresh-token', this.handleRefreshToken.bind(this));
    ipcMain.handle('platform-adapter:get-user-info', this.handleGetUserInfo.bind(this));
    
    // 连接测试相关
    ipcMain.handle('platform-adapter:test-connection', this.handleTestConnection.bind(this));
    ipcMain.handle('platform-adapter:validate-all-connections', this.handleValidateAllConnections.bind(this));
  }

  /**
   * 处理搜索请求
   */
  private async handleSearch(event: IpcMainInvokeEvent, request: SearchRequest): Promise<SearchResponse> {
    try {
      return await this.platformAdapterManager.search(request);
    } catch (error) {
      console.error('Search failed:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理加载适配器请求
   */
  private async handleLoadAdapter(event: IpcMainInvokeEvent, config: PlatformConfig): Promise<void> {
    try {
      await this.platformAdapterManager.loadAdapter(config);
    } catch (error) {
      console.error('Failed to load adapter:', error);
      throw new Error(`Failed to load adapter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理卸载适配器请求
   */
  private async handleUnloadAdapter(event: IpcMainInvokeEvent, configId: string): Promise<void> {
    try {
      await this.platformAdapterManager.unloadAdapter(configId);
    } catch (error) {
      console.error('Failed to unload adapter:', error);
      throw new Error(`Failed to unload adapter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理重新加载适配器请求
   */
  private async handleReloadAdapter(event: IpcMainInvokeEvent, configId: string): Promise<void> {
    try {
      await this.platformAdapterManager.reloadAdapter(configId);
    } catch (error) {
      console.error('Failed to reload adapter:', error);
      throw new Error(`Failed to reload adapter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理获取活跃适配器请求
   */
  private async handleGetActiveAdapters(event: IpcMainInvokeEvent): Promise<string[]> {
    try {
      return this.platformAdapterManager.getActiveAdapters();
    } catch (error) {
      console.error('Failed to get active adapters:', error);
      throw new Error(`Failed to get active adapters: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理认证请求
   */
  private async handleAuthenticate(event: IpcMainInvokeEvent, configId: string): Promise<AuthResult> {
    try {
      return await this.platformAdapterManager.authenticatePlatform(configId);
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理刷新令牌请求
   */
  private async handleRefreshToken(event: IpcMainInvokeEvent, configId: string): Promise<AuthResult> {
    try {
      return await this.platformAdapterManager.refreshPlatformToken(configId);
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理获取用户信息请求
   */
  private async handleGetUserInfo(event: IpcMainInvokeEvent, configId: string): Promise<PlatformUserInfo> {
    try {
      return await this.platformAdapterManager.getPlatformUserInfo(configId);
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw new Error(`Failed to get user info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理测试连接请求
   */
  private async handleTestConnection(event: IpcMainInvokeEvent, configId: string): Promise<boolean> {
    try {
      return await this.platformAdapterManager.testPlatformConnection(configId);
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * 处理验证所有连接请求
   */
  private async handleValidateAllConnections(event: IpcMainInvokeEvent): Promise<Record<string, boolean>> {
    try {
      return await this.platformAdapterManager.validateAllConnections();
    } catch (error) {
      console.error('Failed to validate all connections:', error);
      throw new Error(`Failed to validate all connections: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 移除所有IPC处理器
   */
  public removeHandlers(): void {
    ipcMain.removeHandler('platform-adapter:search');
    ipcMain.removeHandler('platform-adapter:load-adapter');
    ipcMain.removeHandler('platform-adapter:unload-adapter');
    ipcMain.removeHandler('platform-adapter:reload-adapter');
    ipcMain.removeHandler('platform-adapter:get-active-adapters');
    ipcMain.removeHandler('platform-adapter:authenticate');
    ipcMain.removeHandler('platform-adapter:refresh-token');
    ipcMain.removeHandler('platform-adapter:get-user-info');
    ipcMain.removeHandler('platform-adapter:test-connection');
    ipcMain.removeHandler('platform-adapter:validate-all-connections');
  }
}