/**
 * 应用配置相关的类型定义
 * 包括用户设置、应用配置等
 */

export interface UserConfig {
  /** 用户ID */
  userId: string;
  /** 搜索设置 */
  searchSettings: SearchSettings;
  /** 界面设置 */
  uiSettings: UISettings;
  /** 隐私设置 */
  privacySettings: PrivacySettings;
  /** 配置版本 */
  version: string;
  /** 最后更新时间 */
  lastUpdated: Date;
}

export interface SearchSettings {
  /** 默认结果数量限制 */
  defaultResultLimit: number;
  /** 是否启用搜索历史 */
  enableSearchHistory: boolean;
  /** 自动刷新间隔（秒） */
  autoRefreshInterval: number;
  /** 搜索超时时间（毫秒） */
  searchTimeout: number;
  /** 是否启用搜索缓存 */
  enableCache: boolean;
  /** 缓存过期时间（秒） */
  cacheExpiry: number;
  /** 是否启用实时搜索建议 */
  enableSearchSuggestions: boolean;
  /** 默认搜索排序方式 */
  defaultSortBy: 'relevance' | 'date' | 'sender';
  /** 默认搜索排序顺序 */
  defaultSortOrder: 'asc' | 'desc';
}

export interface UISettings {
  /** 主题设置 */
  theme: 'light' | 'dark' | 'system';
  /** 语言设置 */
  language: string;
  /** 字体大小 */
  fontSize: 'small' | 'medium' | 'large';
  /** 是否启用动画效果 */
  enableAnimations: boolean;
  /** 是否显示平台图标 */
  showPlatformIcons: boolean;
  /** 消息卡片显示密度 */
  messageCardDensity: 'compact' | 'comfortable' | 'spacious';
  /** 侧边栏是否默认展开 */
  sidebarExpanded: boolean;
  /** 窗口设置 */
  windowSettings: WindowSettings;
}

export interface WindowSettings {
  /** 窗口宽度 */
  width: number;
  /** 窗口高度 */
  height: number;
  /** 窗口X坐标 */
  x?: number;
  /** 窗口Y坐标 */
  y?: number;
  /** 是否最大化 */
  maximized: boolean;
  /** 是否全屏 */
  fullscreen: boolean;
}

export interface PrivacySettings {
  /** 是否保存搜索历史 */
  saveSearchHistory: boolean;
  /** 搜索历史保留天数 */
  searchHistoryRetentionDays: number;
  /** 是否启用使用统计 */
  enableUsageStats: boolean;
  /** 是否启用错误报告 */
  enableErrorReporting: boolean;
  /** 是否自动清理缓存 */
  autoCleanCache: boolean;
  /** 缓存清理间隔（天） */
  cacheCleanupInterval: number;
}

export interface AppConfig {
  /** 应用版本 */
  version: string;
  /** 构建时间 */
  buildTime: string;
  /** 环境类型 */
  environment: 'development' | 'production' | 'test';
  /** API配置 */
  api: APIConfig;
  /** 安全配置 */
  security: SecurityConfig;
  /** 日志配置 */
  logging: LoggingConfig;
}

export interface APIConfig {
  /** API基础URL */
  baseUrl: string;
  /** 请求超时时间（毫秒） */
  timeout: number;
  /** 重试次数 */
  retryAttempts: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;
  /** 是否启用请求缓存 */
  enableCache: boolean;
}

export interface SecurityConfig {
  /** 加密算法 */
  encryptionAlgorithm: string;
  /** 密钥长度 */
  keyLength: number;
  /** 是否启用SSL验证 */
  enableSSLVerification: boolean;
  /** 令牌刷新阈值（秒） */
  tokenRefreshThreshold: number;
}

export interface LoggingConfig {
  /** 日志级别 */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** 是否启用文件日志 */
  enableFileLogging: boolean;
  /** 日志文件最大大小（MB） */
  maxFileSize: number;
  /** 日志文件保留数量 */
  maxFiles: number;
  /** 是否启用控制台日志 */
  enableConsoleLogging: boolean;
}