/**
 * 搜索相关的类型定义
 * 支持跨平台消息搜索的核心数据结构
 */

export interface SearchRequest {
  /** 搜索关键词 */
  query: string;
  /** 指定搜索的平台列表，如果为空则搜索所有已配置平台 */
  platforms?: string[];
  /** 指定搜索的账户列表（Token IDs，从 OAuth Server 的 user_tokens 表的 id 字段） */
  accounts?: string[];
  /** 按平台分组的账户列表，key 为平台名称，value 为该平台的 token IDs */
  accountsByPlatform?: Record<string, string[]>;
  /** 搜索筛选条件 */
  filters?: SearchFilters;
  /** 分页参数 */
  pagination?: SearchPagination;
}

export interface SearchFilters {
  /** 时间范围筛选 */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** 发送人筛选 */
  sender?: string;
  /** 消息类型筛选 */
  messageType?: 'text' | 'file' | 'all';
  /** 账户标识符（用于多账户场景） */
  accountIdentifier?: string;
  /** 平台特定的筛选条件 */
  platformSpecific?: Record<string, any>;
}

export interface SearchPagination {
  /** 页码，从1开始 */
  page: number;
  /** 每页结果数量 */
  limit: number;
}

export interface SearchResponse {
  /** 搜索结果列表 */
  results: MessageResult[];
  /** 总结果数量 */
  totalCount: number;
  /** 是否还有更多结果 */
  hasMore: boolean;
  /** 搜索耗时（毫秒） */
  searchTime: number;
  /** 各平台搜索状态 */
  platformStatus: Record<string, PlatformSearchStatus>;
}

export interface PlatformSearchStatus {
  /** 平台名称 */
  platform: string;
  /** 搜索是否成功 */
  success: boolean;
  /** 结果数量 */
  resultCount: number;
  /** 错误信息（如果搜索失败） */
  error?: string;
  /** 搜索耗时（毫秒） */
  searchTime: number;
}

export interface MessageResult {
  /** 消息唯一标识 */
  id: string;
  /** 消息来源平台 */
  platform: 'slack' | 'gmail' | 'lark';
  /** 发送人信息 */
  sender: MessageSender;
  /** 消息内容 */
  content: string;
  /** 发送时间 */
  timestamp: Date;
  /** 频道或会话信息 */
  channel?: string;
  /** 深度链接，用于跳转到原始消息 */
  deepLink: string;
  /** 消息摘要 */
  snippet: string;
  /** 消息类型 */
  messageType: 'text' | 'file' | 'image' | 'other';
  /** 附件信息 */
  attachments?: MessageAttachment[];
  /** 平台特定的元数据 */
  metadata?: Record<string, any>;
  /** 消息所属的账户标识（用于多账户场景） */
  accountId?: string;
}

export interface MessageSender {
  /** 发送人姓名 */
  name: string;
  /** 头像URL */
  avatar?: string;
  /** 邮箱地址 */
  email?: string;
  /** 用户ID */
  userId?: string;
  /** 显示名称 */
  displayName?: string;
}

export interface MessageAttachment {
  /** 附件ID */
  id: string;
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: string;
  /** 文件大小（字节） */
  size: number;
  /** 下载链接 */
  downloadUrl?: string;
  /** 预览链接 */
  previewUrl?: string;
}

export interface SearchHistory {
  /** 搜索历史ID */
  id: string;
  /** 搜索查询 */
  query: string;
  /** 搜索时间 */
  timestamp: Date;
  /** 结果数量 */
  resultCount: number;
  /** 搜索的平台 */
  platforms: string[];
  /** 使用的筛选条件 */
  filters?: SearchFilters;
}

export interface SearchCache {
  /** 缓存键（搜索查询的哈希值） */
  key: string;
  /** 缓存的搜索结果 */
  results: MessageResult[];
  /** 缓存时间 */
  timestamp: Date;
  /** 缓存生存时间（秒） */
  ttl: number;
  /** 搜索请求参数 */
  searchRequest: SearchRequest;
}