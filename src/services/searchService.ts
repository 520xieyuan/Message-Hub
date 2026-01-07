/**
 * 前端搜索服务
 * 通过IPC与主进程的搜索服务通信
 */

import { SearchRequest, SearchResponse } from '../types/search';

export interface SearchServiceAPI {
  execute: (request: SearchRequest) => Promise<SearchResponse>;
  cancel: (searchId: string) => Promise<{ success: boolean; message?: string }>;
  cancelAll: () => Promise<{ success: boolean; message?: string }>;
  clearCache: () => Promise<{ success: boolean; message?: string }>;
  getCacheStats: () => Promise<{
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; timestamp: Date; ttl: number; resultCount: number }>;
  }>;
  getMetrics: () => Promise<any>;
  resetMetrics: () => Promise<{ success: boolean; message?: string }>;
  getOptions: () => Promise<any>;
  updateOptions: (options: any) => Promise<{ success: boolean; message?: string }>;
}

class SearchService {
  private api: SearchServiceAPI;

  constructor() {
    // 获取Electron IPC API
    this.api = (window as any).electronAPI?.search;

    if (!this.api) {
      throw new Error('Search API not available. Make sure you are running in Electron environment.');
    }
  }

  /**
   * 执行搜索
   * @param request 搜索请求
   * @returns 搜索响应
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    try {
      const result = await this.api.execute(request);

      // 检查是否返回错误
      if ('error' in result) {
        const error = result.error as any;
        throw new Error(error?.message || '搜索失败');
      }

      return result as SearchResponse;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * 取消搜索
   * @param searchId 搜索ID
   */
  async cancelSearch(searchId: string): Promise<void> {
    try {
      const result = await this.api.cancel(searchId);

      if (!result.success) {
        throw new Error(result.message || '取消搜索失败');
      }
    } catch (error) {
      console.error('Cancel search failed:', error);
      throw error;
    }
  }

  /**
   * 取消所有搜索
   */
  async cancelAllSearches(): Promise<void> {
    try {
      const result = await this.api.cancelAll();

      if (!result.success) {
        throw new Error(result.message || '取消所有搜索失败');
      }
    } catch (error) {
      console.error('Cancel all searches failed:', error);
      throw error;
    }
  }

  /**
   * 清空搜索缓存
   */
  async clearCache(): Promise<void> {
    try {
      const result = await this.api.clearCache();

      if (!result.success) {
        throw new Error(result.message || '清空缓存失败');
      }
    } catch (error) {
      console.error('Clear cache failed:', error);
      throw error;
    }
  }

  /**
   * 获取缓存统计
   */
  async getCacheStats(): Promise<{
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; timestamp: Date; ttl: number; resultCount: number }>;
  }> {
    try {
      const result = await this.api.getCacheStats();

      if ('error' in result) {
        throw new Error(String(result.error));
      }

      return result;
    } catch (error) {
      console.error('Get cache stats failed:', error);
      throw error;
    }
  }

  /**
   * 获取搜索指标
   */
  async getMetrics(): Promise<any> {
    try {
      const result = await this.api.getMetrics();

      if ('error' in result) {
        throw new Error(String(result.error));
      }

      return result;
    } catch (error) {
      console.error('Get metrics failed:', error);
      throw error;
    }
  }

  /**
   * 重置搜索指标
   */
  async resetMetrics(): Promise<void> {
    try {
      const result = await this.api.resetMetrics();

      if (!result.success) {
        throw new Error(result.message || '重置指标失败');
      }
    } catch (error) {
      console.error('Reset metrics failed:', error);
      throw error;
    }
  }

  /**
   * 获取搜索选项
   */
  async getOptions(): Promise<any> {
    try {
      const result = await this.api.getOptions();

      if ('error' in result) {
        throw new Error(String(result.error));
      }

      return result;
    } catch (error) {
      console.error('Get options failed:', error);
      throw error;
    }
  }

  /**
   * 更新搜索选项
   * @param options 新的选项
   */
  async updateOptions(options: any): Promise<void> {
    try {
      const result = await this.api.updateOptions(options);

      if (!result.success) {
        throw new Error(result.message || '更新选项失败');
      }
    } catch (error) {
      console.error('Update options failed:', error);
      throw error;
    }
  }

  /**
   * 创建搜索请求
   * @param query 搜索关键词
   * @param options 搜索选项
   */
  createSearchRequest(
    query: string,
    options?: {
      platforms?: string[];
      accounts?: string[];
      accountsByPlatform?: Record<string, string[]>;  // ✅ 添加此字段
      filters?: {
        dateRange?: { start: Date; end: Date };
        sender?: string;
        messageType?: 'text' | 'file' | 'all';
      };
      pagination?: { page: number; limit: number };
    }
  ): SearchRequest {
    // 解析智能搜索语法
    const parsedQuery = this.parseSmartQuery(query.trim())

    return {
      query: parsedQuery.query,
      platforms: options?.platforms,
      accounts: options?.accounts,
      accountsByPlatform: options?.accountsByPlatform,  // ✅ 添加此字段
      filters: {
        ...options?.filters,
        ...parsedQuery.filters
      },
      pagination: options?.pagination || { page: 1, limit: 20 }
    };
  }

  /**
   * 解析智能搜索语法
   * @param query 原始查询
   */
  private parseSmartQuery(query: string): {
    query: string;
    filters: {
      sender?: string;
      dateRange?: { start: Date; end: Date };
      messageType?: 'text' | 'file' | 'all';
    };
  } {
    let parsedQuery = query
    const filters: any = {}

    // 解析发送人搜索 (from:user，注意：不解析 @ 以避免与邮箱地址冲突)
    // 只匹配以 "from:" 开头的语法，不再匹配单独的 @
    const fromMatch = parsedQuery.match(/\bfrom:([^\s]+)/i)
    if (fromMatch) {
      filters.sender = fromMatch[1]
      parsedQuery = parsedQuery.replace(fromMatch[0], '').trim()
    }

    // 解析日期搜索 (after:date, before:date)
    const afterMatch = parsedQuery.match(/after:(\d{4}-\d{2}-\d{2})/i)
    const beforeMatch = parsedQuery.match(/before:(\d{4}-\d{2}-\d{2})/i)

    if (afterMatch || beforeMatch) {
      filters.dateRange = {}
      if (afterMatch) {
        filters.dateRange.start = new Date(afterMatch[1])
        parsedQuery = parsedQuery.replace(afterMatch[0], '').trim()
      }
      if (beforeMatch) {
        filters.dateRange.end = new Date(beforeMatch[1])
        parsedQuery = parsedQuery.replace(beforeMatch[0], '').trim()
      }
    }

    // 解析文件类型搜索 (type:file, type:text)
    const typeMatch = parsedQuery.match(/type:(text|file|image)/i)
    if (typeMatch) {
      filters.messageType = typeMatch[1].toLowerCase()
      parsedQuery = parsedQuery.replace(typeMatch[0], '').trim()
    }

    // 清理多余空格
    parsedQuery = parsedQuery.replace(/\s+/g, ' ').trim()

    return {
      query: parsedQuery,
      filters
    }
  }

  /**
   * 验证搜索查询
   * @param query 搜索查询
   */
  validateQuery(query: string): { valid: boolean; error?: string } {
    if (!query || typeof query !== 'string') {
      return { valid: false, error: '搜索关键词不能为空' };
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      return { valid: false, error: '搜索关键词不能为空白字符' };
    }

    if (trimmedQuery.length > 1000) {
      return { valid: false, error: '搜索关键词过长，最多1000个字符' };
    }

    // 检查是否包含特殊字符
    const invalidChars = /[<>]/;
    if (invalidChars.test(trimmedQuery)) {
      return { valid: false, error: '搜索关键词包含无效字符' };
    }

    return { valid: true };
  }

  /**
   * 优化搜索查询
   * @param query 原始查询
   */
  optimizeQuery(query: string): string {
    let optimizedQuery = query.trim();

    // 移除多余的空格
    optimizedQuery = optimizedQuery.replace(/\s+/g, ' ');

    // 处理引号匹配
    const quoteCount = (optimizedQuery.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      optimizedQuery += '"'; // 补全未闭合的引号
    }

    // 处理常见的搜索模式
    optimizedQuery = optimizedQuery
      .replace(/\bAND\b/gi, ' AND ')
      .replace(/\bOR\b/gi, ' OR ')
      .replace(/\bNOT\b/gi, ' NOT ');

    return optimizedQuery;
  }

  /**
   * 生成搜索建议
   * @param query 当前查询
   * @param recentQueries 最近查询
   */
  generateSearchSuggestions(query: string, recentQueries: string[]): string[] {
    const suggestions: string[] = [];
    const lowerQuery = query.toLowerCase();

    // 基于最近查询的建议
    const recentSuggestions = recentQueries
      .filter(q => q.toLowerCase().includes(lowerQuery) && q !== query)
      .slice(0, 3);

    suggestions.push(...recentSuggestions);

    // 智能搜索模式建议
    if (query.length >= 2) {
      const patterns = [
        `"${query}"`, // 精确匹配
        `${query} AND `, // 组合搜索
        `from:${query}`, // 发送人搜索
        `type:text ${query}`, // 类型搜索
      ];

      patterns.forEach(pattern => {
        if (!suggestions.includes(pattern)) {
          suggestions.push(pattern);
        }
      });
    }

    return suggestions.slice(0, 8);
  }

  /**
   * 格式化搜索结果
   * @param response 搜索响应
   */
  formatSearchResponse(response: SearchResponse): {
    results: any[];
    summary: {
      totalCount: number;
      searchTime: string;
      platformCount: number;
      successfulPlatforms: number;
      failedPlatforms: number;
    };
  } {
    const platformStatuses = Object.values(response.platformStatus);
    const successfulPlatforms = platformStatuses.filter(status => status.success).length;
    const failedPlatforms = platformStatuses.filter(status => !status.success).length;

    return {
      results: response.results.map(result => ({
        ...result,
        formattedTimestamp: this.formatTimestamp(result.timestamp),
        platformIcon: this.getPlatformIcon(result.platform),
        shortContent: this.truncateContent(result.content, 200)
      })),
      summary: {
        totalCount: response.totalCount,
        searchTime: this.formatSearchTime(response.searchTime),
        platformCount: platformStatuses.length,
        successfulPlatforms,
        failedPlatforms
      }
    };
  }

  /**
   * 格式化时间戳
   */
  private formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) {
      return '刚刚';
    } else if (minutes < 60) {
      return `${minutes}分钟前`;
    } else if (hours < 24) {
      return `${hours}小时前`;
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return new Date(timestamp).toLocaleDateString('zh-CN');
    }
  }

  /**
   * 获取平台图标
   */
  private getPlatformIcon(platform: string): string {
    const icons = {
      slack: '💬',
      gmail: '📧',
      lark: '🚀'
    };

    return icons[platform as keyof typeof icons] || '📄';
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * 格式化搜索时间
   */
  private formatSearchTime(timeMs: number): string {
    if (timeMs < 1000) {
      return `${timeMs}ms`;
    } else {
      return `${(timeMs / 1000).toFixed(1)}s`;
    }
  }

  /**
   * 创建错误处理器
   */
  createErrorHandler(): (error: any) => { message: string; type: string; retryable: boolean } {
    return (error: any) => {
      let message = '发生未知错误';
      let type = 'unknown';
      let retryable = false;

      if (error instanceof Error) {
        message = error.message;

        if (message.includes('timeout')) {
          type = 'timeout';
          retryable = true;
        } else if (message.includes('network') || message.includes('connection')) {
          type = 'network';
          retryable = true;
        } else if (message.includes('auth') || message.includes('unauthorized')) {
          type = 'auth';
          retryable = false;
        } else if (message.includes('validation') || message.includes('invalid')) {
          type = 'validation';
          retryable = false;
        } else if (message.includes('rate limit')) {
          type = 'rate_limit';
          retryable = true;
        }
      }

      return { message, type, retryable };
    };
  }
}

// 创建单例实例
let searchServiceInstance: SearchService | null = null;

export const getSearchService = (): SearchService => {
  if (!searchServiceInstance) {
    searchServiceInstance = new SearchService();
  }
  return searchServiceInstance;
};

export default SearchService;