/**
 * 应用配置常量
 */

// OAuth 服务器配置
export const OAUTH_SERVER_URL = process.env.OAUTH_SERVER_URL || 'http://localhost:3000';

// 其他配置常量可以在这里添加
export const DEFAULT_SEARCH_TIMEOUT = 300000; // 5分钟
export const DEFAULT_PAGE_SIZE = 100;
export const GMAIL_BATCH_SIZE = 10; // Gmail 并发批处理大小
