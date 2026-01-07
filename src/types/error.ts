/**
 * 错误处理相关的类型定义
 * 定义应用中各种错误类型和处理机制
 */

export enum ErrorType {
  // 网络相关错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  
  // 认证相关错误
  AUTH_ERROR = 'AUTH_ERROR',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // API相关错误
  API_ERROR = 'API_ERROR',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_QUOTA_EXCEEDED = 'API_QUOTA_EXCEEDED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  
  // 平台相关错误
  PLATFORM_UNAVAILABLE = 'PLATFORM_UNAVAILABLE',
  PLATFORM_NOT_CONFIGURED = 'PLATFORM_NOT_CONFIGURED',
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  
  // 搜索相关错误
  SEARCH_ERROR = 'SEARCH_ERROR',
  INVALID_QUERY = 'INVALID_QUERY',
  SEARCH_TIMEOUT = 'SEARCH_TIMEOUT',
  NO_RESULTS = 'NO_RESULTS',
  
  // 配置相关错误
  CONFIG_ERROR = 'CONFIG_ERROR',
  INVALID_CONFIG = 'INVALID_CONFIG',
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  
  // 存储相关错误
  STORAGE_ERROR = 'STORAGE_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  DECRYPTION_ERROR = 'DECRYPTION_ERROR',
  
  // 应用相关错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR'
}

export interface AppError {
  /** 错误类型 */
  type: ErrorType;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
  /** 相关平台 */
  platform?: string;
  /** 是否可重试 */
  retryable: boolean;
  /** 错误详情 */
  details?: any;
  /** 错误发生时间 */
  timestamp: Date;
  /** 错误堆栈 */
  stack?: string;
  /** 用户友好的错误消息 */
  userMessage?: string;
  /** 建议的解决方案 */
  suggestions?: string[];
}

export interface ErrorContext {
  /** 操作类型 */
  operation: string;
  /** 相关平台 */
  platform?: string;
  /** 用户ID */
  userId?: string;
  /** 请求ID */
  requestId?: string;
  /** 额外的上下文信息 */
  metadata?: Record<string, any>;
}

export interface ErrorHandler {
  /** 处理错误 */
  handle(error: AppError, context?: ErrorContext): Promise<void>;
  /** 是否可以处理该类型的错误 */
  canHandle(errorType: ErrorType): boolean;
}

export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 重试延迟（毫秒） */
  delay: number;
  /** 延迟倍数（指数退避） */
  backoffMultiplier: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 可重试的错误类型 */
  retryableErrors: ErrorType[];
}

export interface ErrorRecoveryStrategy {
  /** 策略名称 */
  name: string;
  /** 适用的错误类型 */
  applicableErrors: ErrorType[];
  /** 执行恢复策略 */
  execute(error: AppError, context?: ErrorContext): Promise<boolean>;
  /** 策略优先级 */
  priority: number;
}

// 预定义的错误恢复策略
export const ERROR_RECOVERY_STRATEGIES = {
  /** 自动重试策略 */
  AUTO_RETRY: 'auto_retry',
  /** 令牌刷新策略 */
  TOKEN_REFRESH: 'token_refresh',
  /** 重新认证策略 */
  RE_AUTHENTICATE: 're_authenticate',
  /** 降级服务策略 */
  GRACEFUL_DEGRADATION: 'graceful_degradation',
  /** 用户干预策略 */
  USER_INTERVENTION: 'user_intervention'
} as const;

export type ErrorRecoveryStrategyType = typeof ERROR_RECOVERY_STRATEGIES[keyof typeof ERROR_RECOVERY_STRATEGIES];

// 错误严重程度
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorReport {
  /** 错误ID */
  id: string;
  /** 错误信息 */
  error: AppError;
  /** 错误上下文 */
  context?: ErrorContext;
  /** 错误严重程度 */
  severity: ErrorSeverity;
  /** 是否已解决 */
  resolved: boolean;
  /** 解决方案 */
  resolution?: string;
  /** 报告时间 */
  reportedAt: Date;
  /** 解决时间 */
  resolvedAt?: Date;
}