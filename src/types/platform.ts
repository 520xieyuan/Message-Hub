/**
 * 平台适配器相关的类型定义
 * 定义各个消息平台的集成接口和配置
 */

import { SearchRequest, MessageResult } from './search'

export type PlatformType = 'slack' | 'gmail' | 'lark'

export interface PlatformConfig {
  /** 平台配置ID */
  id: string;
  /** 平台名称 */
  name: PlatformType;
  /** 平台显示名称 */
  displayName: string;
  /** 是否启用该平台 */
  enabled: boolean;
  /** 认证凭据 */
  credentials: PlatformCredentials;
  /** 平台特定设置 */
  settings: PlatformSettings;
  /** 连接状态 */
  connectionStatus: ConnectionStatus;
  /** 最后更新时间 */
  lastUpdated: Date;
}

export interface PlatformCredentials {
  /** 访问令牌 */
  accessToken: string;
  /** 刷新令牌 */
  refreshToken?: string;
  /** 令牌过期时间 */
  expiresAt?: Date;
  /** 客户端ID */
  clientId?: string;
  /** 客户端密钥 */
  clientSecret?: string;
  /** 其他平台特定的认证信息 */
  additional?: Record<string, string>;
}

export interface PlatformSettings {
  /** 搜索范围 */
  searchScope?: string[];
  /** 最大结果数量 */
  maxResults?: number;
  /** 搜索超时时间（毫秒） */
  timeout?: number;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存过期时间（秒） */
  cacheExpiry?: number;
  /** 平台特定的设置 */
  platformSpecific?: Record<string, any>;
}

export interface ConnectionStatus {
  /** 是否已连接 */
  connected: boolean;
  /** 最后检查时间 */
  lastChecked: Date;
  /** 连接错误信息 */
  error?: string;
  /** 连接质量评分 (1-5) */
  quality?: number;
}

export interface AuthResult {
  /** 认证是否成功 */
  success: boolean;
  /** 访问令牌 */
  accessToken?: string;
  /** 刷新令牌 */
  refreshToken?: string;
  /** 令牌过期时间 */
  expiresAt?: Date;
  /** 错误信息 */
  error?: string;
  /** 用户信息 */
  userInfo?: PlatformUserInfo;
  /** 是否需要重新授权（refresh token 也过期时） */
  requiresReauth?: boolean;
}

export interface PlatformUserInfo {
  /** 用户ID */
  id: string;
  /** 用户名 */
  name: string;
  /** 邮箱 */
  email?: string;
  /** 头像URL */
  avatar?: string;
  /** 工作区或组织信息 */
  workspace?: {
    id: string;
    name: string;
    domain?: string;
  };
}

/**
 * 平台适配器抽象接口
 * 所有平台适配器都必须实现此接口
 */
export abstract class PlatformAdapter {
  protected config: PlatformConfig;

  constructor(config: PlatformConfig) {
    this.config = config;
  }

  /** 获取平台类型 */
  abstract getPlatformType(): PlatformType;

  /** 进行平台认证 */
  abstract authenticate(): Promise<AuthResult>;

  /** 刷新访问令牌 */
  abstract refreshToken(): Promise<AuthResult>;

  /** 验证连接状态 */
  abstract validateConnection(): Promise<boolean>;

  /** 执行搜索 */
  abstract search(request: SearchRequest): Promise<MessageResult[]>;

  /** 生成深度链接 */
  abstract getDeepLink(messageId: string, additionalParams?: Record<string, string>): string;

  /** 获取用户信息 */
  abstract getUserInfo(): Promise<PlatformUserInfo>;

  /** 断开连接并清理资源 */
  abstract disconnect(): Promise<void>;

  /** 测试API连接 */
  abstract testConnection(): Promise<boolean>;
}

// Slack 平台特定类型
export interface SlackConfig extends PlatformSettings {
  workspaceId?: string;
  botToken?: string;
  userToken?: string;
  signingSecret?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

// Gmail 平台特定类型
export interface GmailConfig extends PlatformSettings {
  labels?: string[];
  includeSpam?: boolean;
  includeTrash?: boolean;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
}

// Lark 平台特定类型
export interface LarkConfig extends PlatformSettings {
  appId?: string;
  appSecret?: string;
  tenantKey?: string;
}

/**
 * Lark 搜索配置选项
 * 用于控制搜索范围和性能
 */
export interface LarkSearchConfig {
  /** 最多搜索多少个会话（默认 50） */
  maxChatsToSearch: number;
  /** 每个会话最多获取多少页消息（默认 10） */
  maxPagesPerChat: number;
  /** 只搜索最近 N 天活跃的会话（默认 30 天，0 表示不限制） */
  recentDaysOnly: number;
  /** 最大搜索结果数（默认 500） */
  maxSearchResults: number;
  /** 是否启用会话过滤（默认 true） */
  enableChatFilter: boolean;
  /** 重试次数（默认 3） */
  maxRetries: number;
  /** 重试基础延迟毫秒（默认 1000） */
  retryBaseDelay: number;
}

/**
 * Lark 搜索进度信息
 * 用于实时通知搜索进度
 */
export interface LarkSearchProgress {
  /** 当前阶段 */
  stage: 'fetching_chats' | 'searching' | 'completed' | 'error';
  /** 总会话数 */
  totalChats: number;
  /** 已处理会话数 */
  processedChats: number;
  /** 已找到的消息数 */
  foundMessages: number;
  /** 当前正在搜索的会话名称 */
  currentChat?: string;
  /** 当前账户标识 */
  currentAccount?: string;
  /** 进度百分比 (0-100) */
  percentage: number;
  /** 错误信息（如果有） */
  error?: string;
}

export interface LarkChat {
  chatId: string;
  name: string;
  chatType: 'p2p' | 'group';
  memberCount?: number;
}