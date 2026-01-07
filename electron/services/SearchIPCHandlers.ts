/**
 * 搜索服务IPC处理器
 * 处理渲染进程与主进程之间的搜索相关通信
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { SearchService, SearchMetrics } from './SearchService';
import { SearchRequest, SearchResponse } from '../../src/types/search';
import { AppError, ErrorType } from '../../src/types/error';

export class SearchIPCHandlers {
  private searchService: SearchService;

  constructor(searchService: SearchService) {
    this.searchService = searchService;
    this.registerHandlers();
  }

  /**
   * 注册所有IPC处理器
   */
  private registerHandlers(): void {
    // 先移除可能存在的处理器
    this.removeHandlers();
    
    // 搜索相关处理器
    ipcMain.handle('search:execute', this.handleSearch.bind(this));
    ipcMain.handle('search:cancel', this.handleCancelSearch.bind(this));
    ipcMain.handle('search:cancelAll', this.handleCancelAllSearches.bind(this));
    
    // 缓存相关处理器
    ipcMain.handle('search:clearCache', this.handleClearCache.bind(this));
    ipcMain.handle('search:getCacheStats', this.handleGetCacheStats.bind(this));
    
    // 指标相关处理器
    ipcMain.handle('search:getMetrics', this.handleGetMetrics.bind(this));
    ipcMain.handle('search:resetMetrics', this.handleResetMetrics.bind(this));
    
    // 配置相关处理器
    ipcMain.handle('search:getOptions', this.handleGetOptions.bind(this));
    ipcMain.handle('search:updateOptions', this.handleUpdateOptions.bind(this));

    console.log('Search IPC handlers registered');
  }

  /**
   * 处理搜索请求
   */
  private async handleSearch(
    event: IpcMainInvokeEvent,
    request: SearchRequest
  ): Promise<SearchResponse | { error: AppError }> {
    try {
      // 验证搜索请求
      this.validateSearchRequest(request);
      
      // 执行搜索
      const response = await this.searchService.search(request);
      
      return response;
    } catch (error) {
      console.error('Search execution failed:', error);
      
      // 创建错误响应
      const appError: AppError = {
        type: this.getErrorType(error),
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
        timestamp: new Date(),
        details: { request },
        userMessage: '搜索执行失败，请重试'
      };

      return { error: appError };
    }
  }

  /**
   * 处理取消搜索请求
   */
  private async handleCancelSearch(
    event: IpcMainInvokeEvent,
    searchId: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const success = this.searchService.cancelSearch(searchId);
      
      return {
        success,
        message: success ? '搜索已取消' : '未找到指定的搜索任务'
      };
    } catch (error) {
      console.error('Cancel search failed:', error);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : '取消搜索失败'
      };
    }
  }

  /**
   * 处理取消所有搜索请求
   */
  private async handleCancelAllSearches(
    event: IpcMainInvokeEvent
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.searchService.cancelAllSearches();
      
      return {
        success: true,
        message: '所有搜索任务已取消'
      };
    } catch (error) {
      console.error('Cancel all searches failed:', error);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : '取消所有搜索失败'
      };
    }
  }

  /**
   * 处理清空缓存请求
   */
  private async handleClearCache(
    event: IpcMainInvokeEvent
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.searchService.clearCache();
      
      return {
        success: true,
        message: '搜索缓存已清空'
      };
    } catch (error) {
      console.error('Clear cache failed:', error);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : '清空缓存失败'
      };
    }
  }

  /**
   * 处理获取缓存统计请求
   */
  private async handleGetCacheStats(
    event: IpcMainInvokeEvent
  ): Promise<{
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; timestamp: Date; ttl: number; resultCount: number }>;
  } | { error: string }> {
    try {
      const stats = this.searchService.getCacheStats();
      return stats;
    } catch (error) {
      console.error('Get cache stats failed:', error);
      
      return {
        error: error instanceof Error ? error.message : '获取缓存统计失败'
      };
    }
  }

  /**
   * 处理获取搜索指标请求
   */
  private async handleGetMetrics(
    event: IpcMainInvokeEvent
  ): Promise<SearchMetrics | { error: string }> {
    try {
      const metrics = this.searchService.getMetrics();
      return metrics;
    } catch (error) {
      console.error('Get metrics failed:', error);
      
      return {
        error: error instanceof Error ? error.message : '获取搜索指标失败'
      };
    }
  }

  /**
   * 处理重置搜索指标请求
   */
  private async handleResetMetrics(
    event: IpcMainInvokeEvent
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.searchService.resetMetrics();
      
      return {
        success: true,
        message: '搜索指标已重置'
      };
    } catch (error) {
      console.error('Reset metrics failed:', error);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : '重置搜索指标失败'
      };
    }
  }

  /**
   * 处理获取搜索选项请求
   */
  private async handleGetOptions(
    event: IpcMainInvokeEvent
  ): Promise<any | { error: string }> {
    try {
      const options = this.searchService.getOptions();
      return options;
    } catch (error) {
      console.error('Get options failed:', error);
      
      return {
        error: error instanceof Error ? error.message : '获取搜索选项失败'
      };
    }
  }

  /**
   * 处理更新搜索选项请求
   */
  private async handleUpdateOptions(
    event: IpcMainInvokeEvent,
    newOptions: any
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // 验证选项
      this.validateSearchOptions(newOptions);
      
      this.searchService.updateOptions(newOptions);
      
      return {
        success: true,
        message: '搜索选项已更新'
      };
    } catch (error) {
      console.error('Update options failed:', error);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : '更新搜索选项失败'
      };
    }
  }

  /**
   * 验证搜索请求
   */
  private validateSearchRequest(request: SearchRequest): void {
    if (!request) {
      throw new Error('搜索请求不能为空');
    }

    if (!request.query || typeof request.query !== 'string') {
      throw new Error('搜索关键词不能为空');
    }

    if (request.query.trim().length === 0) {
      throw new Error('搜索关键词不能为空白字符');
    }

    if (request.query.length > 1000) {
      throw new Error('搜索关键词过长，最多1000个字符');
    }

    // 验证平台列表
    if (request.platforms && !Array.isArray(request.platforms)) {
      throw new Error('平台列表必须是数组');
    }

    // 验证分页参数
    if (request.pagination) {
      const { page, limit } = request.pagination;
      
      if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
        throw new Error('页码必须是大于0的整数');
      }
      
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
        throw new Error('每页数量必须是1-100之间的整数');
      }
    }

    // 验证筛选条件
    if (request.filters) {
      const { dateRange, sender, messageType } = request.filters;
      
      if (dateRange) {
        if (!dateRange.start || !dateRange.end) {
          throw new Error('时间范围必须包含开始和结束时间');
        }
        
        if (dateRange.start >= dateRange.end) {
          throw new Error('开始时间必须早于结束时间');
        }
        
        // 检查时间范围是否合理（不超过1年）
        const timeDiff = dateRange.end.getTime() - dateRange.start.getTime();
        const oneYear = 365 * 24 * 60 * 60 * 1000;
        
        if (timeDiff > oneYear) {
          throw new Error('时间范围不能超过1年');
        }
      }
      
      if (sender && (typeof sender !== 'string' || sender.length > 100)) {
        throw new Error('发送人筛选条件格式错误');
      }
      
      if (messageType && !['text', 'file', 'all'].includes(messageType)) {
        throw new Error('消息类型筛选条件无效');
      }
    }
  }

  /**
   * 验证搜索选项
   */
  private validateSearchOptions(options: any): void {
    if (!options || typeof options !== 'object') {
      throw new Error('搜索选项必须是对象');
    }

    // 验证搜索超时
    if (options.searchTimeout !== undefined) {
      if (!Number.isInteger(options.searchTimeout) || options.searchTimeout < 1000 || options.searchTimeout > 300000) {
        throw new Error('搜索超时时间必须是1000-300000毫秒之间的整数');
      }
    }

    // 验证缓存TTL
    if (options.cacheTTL !== undefined) {
      if (!Number.isInteger(options.cacheTTL) || options.cacheTTL < 60 || options.cacheTTL > 86400) {
        throw new Error('缓存TTL必须是60-86400秒之间的整数');
      }
    }

    // 验证最大缓存条目数
    if (options.maxCacheEntries !== undefined) {
      if (!Number.isInteger(options.maxCacheEntries) || options.maxCacheEntries < 10 || options.maxCacheEntries > 10000) {
        throw new Error('最大缓存条目数必须是10-10000之间的整数');
      }
    }

    // 验证布尔选项
    const booleanOptions = ['enableCache', 'enableConcurrentSearch'];
    for (const option of booleanOptions) {
      if (options[option] !== undefined && typeof options[option] !== 'boolean') {
        throw new Error(`${option} 必须是布尔值`);
      }
    }

    // 验证重试配置
    if (options.retryConfig) {
      const { maxAttempts, delay, backoffMultiplier, maxDelay } = options.retryConfig;
      
      if (maxAttempts !== undefined && (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)) {
        throw new Error('最大重试次数必须是1-10之间的整数');
      }
      
      if (delay !== undefined && (!Number.isInteger(delay) || delay < 100 || delay > 10000)) {
        throw new Error('重试延迟必须是100-10000毫秒之间的整数');
      }
      
      if (backoffMultiplier !== undefined && (typeof backoffMultiplier !== 'number' || backoffMultiplier < 1 || backoffMultiplier > 10)) {
        throw new Error('延迟倍数必须是1-10之间的数字');
      }
      
      if (maxDelay !== undefined && (!Number.isInteger(maxDelay) || maxDelay < 1000 || maxDelay > 60000)) {
        throw new Error('最大延迟必须是1000-60000毫秒之间的整数');
      }
    }
  }

  /**
   * 获取错误类型
   */
  private getErrorType(error: any): ErrorType {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('timeout')) {
        return ErrorType.TIMEOUT_ERROR;
      }
      if (message.includes('network') || message.includes('connection')) {
        return ErrorType.NETWORK_ERROR;
      }
      if (message.includes('auth') || message.includes('unauthorized')) {
        return ErrorType.AUTH_ERROR;
      }
      if (message.includes('validation') || message.includes('invalid')) {
        return ErrorType.VALIDATION_ERROR;
      }
      if (message.includes('rate limit')) {
        return ErrorType.API_RATE_LIMIT;
      }
    }

    return ErrorType.SEARCH_ERROR;
  }

  /**
   * 移除所有IPC处理器
   */
  public removeHandlers(): void {
    const handlers = [
      'search:execute',
      'search:cancel',
      'search:cancelAll',
      'search:clearCache',
      'search:getCacheStats',
      'search:getMetrics',
      'search:resetMetrics',
      'search:getOptions',
      'search:updateOptions'
    ];

    for (const handler of handlers) {
      ipcMain.removeHandler(handler);
    }

    console.log('Search IPC handlers removed');
  }

  /**
   * 清理资源
   */
  public async cleanup(): Promise<void> {
    this.removeHandlers();
    console.log('Search IPC handlers cleaned up');
  }
}