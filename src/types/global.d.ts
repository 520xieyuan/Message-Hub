// 全局类型定义文件
// 扩展 Window 接口以包含 electronAPI

import { SearchRequest, SearchResponse } from './search'
import { PlatformConfig, AuthResult, PlatformUserInfo } from './platform'
import { UserConfig } from './config'
import { LLMConfig, SummarizeRequest, SummarizeResponse, LLMConnectionTestResult } from './llm'

declare global {
  interface Window {
    electronAPI?: {
      app: {
        getVersion: () => Promise<string>
        getPlatform: () => Promise<{
          platform: string
          arch: string
          version: string
          electronVersion: string
          chromeVersion: string
          nodeVersion: string
        }>
        getPaths: () => Promise<{
          userData: string
          appData: string
          temp: string
          desktop: string
          documents: string
          downloads: string
        }>
        restart: () => Promise<void>
        quit: () => Promise<void>
      }
      search: {
        execute: (request: SearchRequest) => Promise<SearchResponse>
        cancel: (searchId: string) => Promise<{ success: boolean; message?: string }>
        cancelAll: () => Promise<{ success: boolean; message?: string }>
        clearCache: () => Promise<{ success: boolean; message?: string }>
        getCacheStats: () => Promise<{
          size: number
          maxSize: number
          hitRate: number
          entries: Array<{ key: string; timestamp: Date; ttl: number; resultCount: number }>
        }>
        getMetrics: () => Promise<any>
        resetMetrics: () => Promise<{ success: boolean; message?: string }>
        getOptions: () => Promise<any>
        updateOptions: (options: any) => Promise<{ success: boolean; message?: string }>
        // 保留旧的API以兼容现有代码
        perform: (request: SearchRequest) => Promise<SearchResponse>
        getHistory: () => Promise<any[]>
        clearHistory: () => Promise<boolean>
      }
      platformAdapter: {
        search: (request: SearchRequest) => Promise<SearchResponse>
        loadAdapter: (config: PlatformConfig) => Promise<void>
        unloadAdapter: (configId: string) => Promise<void>
        reloadAdapter: (configId: string) => Promise<void>
        getActiveAdapters: () => Promise<string[]>
        authenticate: (configId: string) => Promise<AuthResult>
        refreshToken: (configId: string) => Promise<AuthResult>
        getUserInfo: (configId: string) => Promise<PlatformUserInfo>
        testConnection: (configId: string) => Promise<boolean>
        validateAllConnections: () => Promise<Record<string, boolean>>
      }
      platform: {
        getConfigs: () => Promise<PlatformConfig[]>
        addConfig: (config: Omit<PlatformConfig, 'id' | 'lastUpdated'>) => Promise<PlatformConfig>
        updateConfig: (id: string, config: Partial<PlatformConfig>) => Promise<PlatformConfig>
        removeConfig: (id: string) => Promise<boolean>
        testConnection: (id: string) => Promise<boolean>
        startAuth: (platformType: string) => Promise<string>
      }
      config: {
        getUserConfig: () => Promise<UserConfig>
        updateUserConfig: (config: Partial<UserConfig>) => Promise<void>
        getSearchSettings: () => Promise<any>
        updateSearchSettings: (settings: any) => Promise<void>
        getUISettings: () => Promise<any>
        updateUISettings: (settings: any) => Promise<void>
        getPrivacySettings: () => Promise<any>
        updatePrivacySettings: (settings: any) => Promise<void>
        getPlatformConfigs: () => Promise<PlatformConfig[]>
        getPlatformConfig: (platformId: string) => Promise<PlatformConfig | null>
        addPlatformConfig: (config: PlatformConfig) => Promise<void>
        updatePlatformConfig: (platformId: string, updates: Partial<PlatformConfig>) => Promise<void>
        removePlatformConfig: (platformId: string) => Promise<void>
        getEnabledPlatformConfigs: () => Promise<PlatformConfig[]>
        saveWindowState: (windowState: any) => Promise<void>
        getWindowState: () => Promise<any>
        resetToDefaults: () => Promise<void>
        exportConfig: () => Promise<object>
        getConfigStats: () => Promise<any>
        validateConfig: () => Promise<boolean>
        getOAuthServerUrl: () => Promise<string>
        setOAuthServerUrl: (url: string) => Promise<void>
        // Client ID 管理
        getClientId: () => Promise<string>
        setClientId: (clientId: string) => Promise<{ success: boolean; clientId?: string; error?: string }>
        showLogFile: () => Promise<boolean>
        showErrorBox: (title: string, content: string) => Promise<void>
        showSaveDialog: (options: any) => Promise<any>
        showOpenDialog: (options: any) => Promise<any>
      }
      // OAuth相关API
      startOAuth?: (options: { platform: string; accountEmail?: string; oauthAppId?: string; profileId?: string; displayName?: string; description?: string }) => Promise<{
        success: boolean
        account?: any
        error?: string
      }>
      refreshToken?: (options: { platform: string; accountId: string }) => Promise<{
        success: boolean
        message?: string
        error?: string
      }>
      getUserTokens?: (userIdentifier: string, platform?: string) => Promise<{
        success: boolean
        data: any[]
        error?: string
      }>
      getOAuthApps?: (platform?: string) => Promise<{
        success: boolean
        data: any[]
        error?: string
      }>
      getServerStats?: () => Promise<{
        success: boolean
        data: any
        error?: string
      }>
      openInChrome?: (options: { accountId: string; url: string }) => Promise<{
        success: boolean
        message?: string
        error?: string
      }>
      // Chrome 诊断
      diagnoseChromeInstallation?: () => Promise<{
        success: boolean
        chromePath: string | null
        userDataDir: string | null
        checkedPaths: Array<{ path: string; exists: boolean }>
        profiles: number
        error?: string
      }>
      // Chrome Profile相关API
      listChromeProfiles?: () => Promise<{
        success: boolean
        data: Array<{
          id: string
          name: string
          path: string
          accountEmail?: string
          platform?: string
          isDefault: boolean
          lastUsed: string
          displayName?: string
        }>
        error?: string
      }>
      openGmailWithProfile?: (options: { accountEmail: string; url: string; displayName?: string }) => Promise<{
        success: boolean
        message?: string
        error?: string
      }>
      // LLM相关API
      llm: {
        /** 执行消息总结（非流式） */
        summarize: (request: SummarizeRequest) => Promise<SummarizeResponse>
        /** 执行消息总结（流式） */
        summarizeStream: (request: SummarizeRequest) => Promise<SummarizeResponse>
        /** 取消流式请求 */
        cancelStream: () => Promise<{ success: boolean }>
        /** 获取LLM配置（会自动从远程获取） */
        getConfig: () => Promise<LLMConfig>
        /** 刷新远程配置 */
        refreshConfig: () => Promise<{ success: boolean; message?: string }>
        /** 更新LLM配置（本地） */
        updateConfig: (config: Partial<LLMConfig>) => Promise<{ success: boolean; message?: string }>
        /** 测试连接 */
        testConnection: () => Promise<LLMConnectionTestResult>
        /** 获取可用模型列表 */
        getModels: () => Promise<{ success: boolean; models?: string[]; error?: string }>
        /** 监听流式响应块 */
        onStreamChunk: (callback: (data: { chunk: string; isComplete: boolean; fullContent: string }) => void) => void
        /** 移除流式响应监听 */
        offStreamChunk: () => void
      }
      on: (channel: string, callback: (...args: any[]) => void) => void
      off: (channel: string, callback: (...args: any[]) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}

export { }