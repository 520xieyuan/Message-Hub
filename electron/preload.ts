import { contextBridge, ipcRenderer } from 'electron'
import { SearchRequest, SearchResponse } from '../src/types/search'
import { PlatformConfig, AuthResult, PlatformUserInfo } from '../src/types/platform'
import { UserConfig } from '../src/types/config'
import { LLMConfig, SummarizeRequest, SummarizeResponse, LLMConnectionTestResult } from '../src/types/llm'

// 暴露受保护的方法，允许渲染进程使用ipcRenderer，而不暴露整个对象
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用相关API
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getPaths: () => ipcRenderer.invoke('app:getPaths'),
    restart: () => ipcRenderer.invoke('app:restart'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },

  // 搜索相关API
  search: {
    execute: (request: SearchRequest) => ipcRenderer.invoke('search:execute', request),
    cancel: (searchId: string) => ipcRenderer.invoke('search:cancel', searchId),
    cancelAll: () => ipcRenderer.invoke('search:cancelAll'),
    clearCache: () => ipcRenderer.invoke('search:clearCache'),
    getCacheStats: () => ipcRenderer.invoke('search:getCacheStats'),
    getMetrics: () => ipcRenderer.invoke('search:getMetrics'),
    resetMetrics: () => ipcRenderer.invoke('search:resetMetrics'),
    getOptions: () => ipcRenderer.invoke('search:getOptions'),
    updateOptions: (options: any) => ipcRenderer.invoke('search:updateOptions', options),
    // 保留旧的API以兼容现有代码
    perform: (request: SearchRequest) => ipcRenderer.invoke('search:execute', request),
    getHistory: () => ipcRenderer.invoke('search:getHistory'),
    clearHistory: () => ipcRenderer.invoke('search:clearHistory'),
  },

  // 平台适配器相关API
  platformAdapter: {
    search: (request: SearchRequest) => ipcRenderer.invoke('platform-adapter:search', request),
    loadAdapter: (config: PlatformConfig) => ipcRenderer.invoke('platform-adapter:load-adapter', config),
    unloadAdapter: (configId: string) => ipcRenderer.invoke('platform-adapter:unload-adapter', configId),
    reloadAdapter: (configId: string) => ipcRenderer.invoke('platform-adapter:reload-adapter', configId),
    getActiveAdapters: () => ipcRenderer.invoke('platform-adapter:get-active-adapters'),
    authenticate: (configId: string) => ipcRenderer.invoke('platform-adapter:authenticate', configId),
    refreshToken: (configId: string) => ipcRenderer.invoke('platform-adapter:refresh-token', configId),
    getUserInfo: (configId: string) => ipcRenderer.invoke('platform-adapter:get-user-info', configId),
    testConnection: (configId: string) => ipcRenderer.invoke('platform-adapter:test-connection', configId),
    validateAllConnections: () => ipcRenderer.invoke('platform-adapter:validate-all-connections'),
  },

  // 平台配置相关API
  platform: {
    getConfigs: () => ipcRenderer.invoke('platform:getConfigs'),
    addConfig: (config: Omit<PlatformConfig, 'id' | 'lastUpdated'>) =>
      ipcRenderer.invoke('platform:addConfig', config),
    updateConfig: (id: string, config: Partial<PlatformConfig>) =>
      ipcRenderer.invoke('platform:updateConfig', id, config),
    removeConfig: (id: string) => ipcRenderer.invoke('platform:removeConfig', id),
    testConnection: (id: string) => ipcRenderer.invoke('platform:testConnection', id),
    startAuth: (platformType: string) => ipcRenderer.invoke('platform:startAuth', platformType),
  },

  // 配置管理相关API
  config: {
    getUserConfig: () => ipcRenderer.invoke('config:getUserConfig'),
    updateUserConfig: (config: Partial<UserConfig>) =>
      ipcRenderer.invoke('config:updateUserConfig', config),
    getSearchSettings: () => ipcRenderer.invoke('config:getSearchSettings'),
    updateSearchSettings: (settings: any) =>
      ipcRenderer.invoke('config:updateSearchSettings', settings),
    getUISettings: () => ipcRenderer.invoke('config:getUISettings'),
    updateUISettings: (settings: any) =>
      ipcRenderer.invoke('config:updateUISettings', settings),
    getPrivacySettings: () => ipcRenderer.invoke('config:getPrivacySettings'),
    updatePrivacySettings: (settings: any) =>
      ipcRenderer.invoke('config:updatePrivacySettings', settings),
    getPlatformConfigs: () => ipcRenderer.invoke('config:getPlatformConfigs'),
    getPlatformConfig: (platformId: string) =>
      ipcRenderer.invoke('config:getPlatformConfig', platformId),
    addPlatformConfig: (config: PlatformConfig) =>
      ipcRenderer.invoke('config:addPlatformConfig', config),
    updatePlatformConfig: (platformId: string, updates: Partial<PlatformConfig>) =>
      ipcRenderer.invoke('config:updatePlatformConfig', platformId, updates),
    removePlatformConfig: (platformId: string) =>
      ipcRenderer.invoke('config:removePlatformConfig', platformId),
    getEnabledPlatformConfigs: () => ipcRenderer.invoke('config:getEnabledPlatformConfigs'),
    saveWindowState: (windowState: any) =>
      ipcRenderer.invoke('config:saveWindowState', windowState),
    getWindowState: () => ipcRenderer.invoke('config:getWindowState'),
    resetToDefaults: () => ipcRenderer.invoke('config:resetToDefaults'),
    exportConfig: () => ipcRenderer.invoke('config:exportConfig'),
    getConfigStats: () => ipcRenderer.invoke('config:getConfigStats'),
    validateConfig: () => ipcRenderer.invoke('config:validateConfig'),
    getOAuthServerUrl: () => ipcRenderer.invoke('config:getOAuthServerUrl'),
    setOAuthServerUrl: (url: string) => ipcRenderer.invoke('config:setOAuthServerUrl', url),
    // Client ID 管理
    getClientId: () => ipcRenderer.invoke('config:getClientId'),
    setClientId: (clientId: string) => ipcRenderer.invoke('config:setClientId', clientId),
    resetClientId: () => ipcRenderer.invoke('config:resetClientId'),
  },

  // 窗口管理相关API
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    getState: () => ipcRenderer.invoke('window:getState'),
    setBounds: (bounds: { x?: number, y?: number, width?: number, height?: number }) =>
      ipcRenderer.invoke('window:setBounds', bounds),
    forceFocus: () => ipcRenderer.invoke('window:forceFocus'),
  },

  // 系统相关API
  system: {
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    showItemInFolder: (path: string) => ipcRenderer.invoke('system:showItemInFolder', path),
    showMessageBox: (options: Electron.MessageBoxOptions) =>
      ipcRenderer.invoke('system:showMessageBox', options),
    showErrorBox: (title: string, content: string) =>
      ipcRenderer.invoke('system:showErrorBox', title, content),
    showSaveDialog: (options: Electron.SaveDialogOptions) =>
      ipcRenderer.invoke('system:showSaveDialog', options),
    showOpenDialog: (options: Electron.OpenDialogOptions) =>
      ipcRenderer.invoke('system:showOpenDialog', options),
    getLogFilePath: () => ipcRenderer.invoke('system:getLogFilePath'),
    showLogFile: () => ipcRenderer.invoke('system:showLogFile'),
  },

  // OAuth相关API
  startOAuth: (options: { platform: string; accountEmail?: string; oauthAppId?: string; profileId?: string; displayName?: string; description?: string }) =>
    ipcRenderer.invoke('oauth:start', options),
  refreshToken: (options: { platform: string; accountId: string }) =>
    ipcRenderer.invoke('oauth:refresh', options),
  getUserTokens: (userIdentifier: string, platform?: string) =>
    ipcRenderer.invoke('oauth:getUserTokens', userIdentifier, platform),
  getOAuthApps: (platform?: string) =>
    ipcRenderer.invoke('oauth:getApps', platform),
  getServerStats: () =>
    ipcRenderer.invoke('oauth:getStats'),
  openInChrome: (options: { accountId: string; url: string }) =>
    ipcRenderer.invoke('oauth:openInChrome', options),

  // Chrome Profile相关API
  listChromeProfiles: () => ipcRenderer.invoke('chrome:listProfiles'),
  openGmailWithProfile: (options: { accountEmail: string; url: string; displayName?: string }) =>
    ipcRenderer.invoke('chrome:openGmailWithProfile', options),
  diagnoseChromeInstallation: () => ipcRenderer.invoke('chrome:diagnose'),

  // LLM相关API
  llm: {
    summarize: (request: SummarizeRequest) => ipcRenderer.invoke('llm:summarize', request),
    summarizeStream: (request: SummarizeRequest) => ipcRenderer.invoke('llm:summarizeStream', request),
    cancelStream: () => ipcRenderer.invoke('llm:cancelStream'),
    getConfig: () => ipcRenderer.invoke('llm:getConfig'),
    refreshConfig: () => ipcRenderer.invoke('llm:refreshConfig'),
    updateConfig: (config: Partial<LLMConfig>) => ipcRenderer.invoke('llm:updateConfig', config),
    testConnection: () => ipcRenderer.invoke('llm:testConnection'),
    getModels: () => ipcRenderer.invoke('llm:getModels'),
    // 流式事件监听
    onStreamChunk: (callback: (data: { chunk: string; isComplete: boolean; fullContent: string }) => void) => {
      ipcRenderer.on('llm:stream-chunk', (_event, data) => callback(data))
    },
    offStreamChunk: () => {
      ipcRenderer.removeAllListeners('llm:stream-chunk')
    },
  },

  // Tokens 变更监听器
  onTokensChanged: (callback: () => void) => {
    ipcRenderer.on('tokens-changed', callback)
  },

  // 事件监听器
  on: (channel: string, callback: (...args: any[]) => void) => {
    // 只允许特定的事件频道
    const validChannels = [
      'menu:new-search',
      'menu:open-settings',
      'search:progress',
      'search:complete',
      'search:error',
      'platform:auth-complete',
      'platform:auth-error',
      'config:updated',
      'config:userConfigUpdated',
      'config:appConfigUpdated',
      'oauth-server-url-changed',
      'window:focus',
      'window:blur'
    ]

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback)
    }
  },

  // 移除事件监听器
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },

  // 移除所有监听器
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

// TypeScript类型定义在 src/types/global.d.ts 中