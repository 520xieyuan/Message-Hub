/**
 * 搜索集成服务层
 * 负责管理多平台并发搜索、结果聚合、缓存和错误处理
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { SearchRequest, SearchResponse, MessageResult, SearchCache, PlatformSearchStatus } from '../../src/types/search';
import { AppError, ErrorType, ErrorSeverity, RetryConfig } from '../../src/types/error';
import { PlatformAdapterManager } from './PlatformAdapterManager';
import { ConfigurationService } from './ConfigurationService';

export interface SearchServiceOptions {
  /** 搜索超时时间（毫秒） */
  searchTimeout: number;
  /** 缓存TTL（秒） */
  cacheTTL: number;
  /** 最大缓存条目数 */
  maxCacheEntries: number;
  /** 重试配置 */
  retryConfig: RetryConfig;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 是否启用并发搜索 */
  enableConcurrentSearch: boolean;
}

export interface SearchMetrics {
  /** 总搜索次数 */
  totalSearches: number;
  /** 成功搜索次数 */
  successfulSearches: number;
  /** 失败搜索次数 */
  failedSearches: number;
  /** 缓存命中次数 */
  cacheHits: number;
  /** 缓存未命中次数 */
  cacheMisses: number;
  /** 平均搜索时间（毫秒） */
  averageSearchTime: number;
  /** 平台搜索统计 */
  platformStats: Record<string, {
    searches: number;
    successes: number;
    failures: number;
    averageTime: number;
  }>;
}

export class SearchService extends EventEmitter {
  private platformManager: PlatformAdapterManager;
  private configService: ConfigurationService;
  private options: SearchServiceOptions;
  private searchCache: Map<string, SearchCache> = new Map();
  private metrics: SearchMetrics;
  private activeSearches: Map<string, AbortController> = new Map();

  constructor(
    platformManager: PlatformAdapterManager,
    configService: ConfigurationService,
    options?: Partial<SearchServiceOptions>
  ) {
    super();
    this.platformManager = platformManager;
    this.configService = configService;

    // 设置默认选项
    this.options = {
      searchTimeout: 300000, // 300秒（5分钟，适应多账户搜索和大量消息获取）
      cacheTTL: 0, // 禁用缓存，每次都获取最新结果
      maxCacheEntries: 1000,
      enableCache: false, // 禁用缓存功能
      enableConcurrentSearch: true,
      retryConfig: {
        maxAttempts: 3,
        delay: 1000,
        backoffMultiplier: 2,
        maxDelay: 10000,
        retryableErrors: [
          ErrorType.NETWORK_ERROR,
          ErrorType.TIMEOUT_ERROR,
          ErrorType.API_RATE_LIMIT,
          ErrorType.CONNECTION_ERROR
        ]
      },
      ...options
    };

    // 初始化指标
    this.metrics = {
      totalSearches: 0,
      successfulSearches: 0,
      failedSearches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageSearchTime: 0,
      platformStats: {}
    };

    // 定期清理过期缓存
    this.startCacheCleanup();
  }

  /**
   * 执行跨平台搜索
   * @param request 搜索请求
   * @returns 搜索响应
   */
  public async search(request: SearchRequest): Promise<SearchResponse> {
    const searchId = this.generateSearchId(request);
    const startTime = Date.now();

    console.log('🔍 [SearchService] search START', {
      timestamp: new Date().toISOString(),
      searchId,
      query: request.query,
      platforms: request.platforms,
      accounts: request.accounts,
      pagination: request.pagination
    });

    try {
      this.metrics.totalSearches++;
      this.emit('searchStarted', { searchId, request });

      // 检查缓存
      if (this.options.enableCache) {
        console.log('💾 [SearchService] Checking cache...');
        const cachedResult = this.getCachedResult(request);
        if (cachedResult) {
          console.log('✅ [SearchService] Cache hit!');
          this.metrics.cacheHits++;
          this.emit('cacheHit', { searchId, request });
          return this.createSearchResponse(cachedResult.results, startTime, {});
        }
        console.log('ℹ️  [SearchService] Cache miss');
        this.metrics.cacheMisses++;
      }

      // 创建搜索控制器
      const abortController = new AbortController();
      this.activeSearches.set(searchId, abortController);

      let searchResponse: SearchResponse;

      try {
        console.log('🚀 [SearchService] Starting performSearch...');
        const performSearchStartTime = Date.now();

        // 执行搜索（带超时）
        searchResponse = await Promise.race([
          this.performSearch(request, abortController.signal),
          this.createTimeoutPromise(this.options.searchTimeout)
        ]);

        console.log(`⏱️  [SearchService] performSearch took ${Date.now() - performSearchStartTime}ms`);
      } finally {
        // 清理搜索控制器
        this.activeSearches.delete(searchId);
      }

      // 缓存结果
      if (this.options.enableCache && searchResponse.results.length > 0) {
        this.cacheSearchResult(request, searchResponse.results);
      }

      // 更新指标
      this.updateMetrics(searchResponse, Date.now() - startTime);
      this.metrics.successfulSearches++;

      console.log(`✅ [SearchService] search SUCCESS in ${Date.now() - startTime}ms`, {
        resultCount: searchResponse.results.length,
        platformStatus: Object.keys(searchResponse.platformStatus).map(p => ({
          platform: p,
          success: searchResponse.platformStatus[p].success,
          count: searchResponse.platformStatus[p].resultCount
        }))
      });

      this.emit('searchCompleted', { searchId, request, response: searchResponse });
      return searchResponse;

    } catch (error) {
      this.metrics.failedSearches++;
      const appError = this.createAppError(error, request);

      console.error(`❌ [SearchService] search FAILED after ${Date.now() - startTime}ms:`, {
        error: appError.message,
        type: appError.type,
        retryable: appError.retryable
      });

      this.emit('searchFailed', { searchId, request, error: appError });

      // 尝试错误恢复
      const recoveredResponse = await this.attemptErrorRecovery(request, appError);
      if (recoveredResponse) {
        console.log('✅ [SearchService] Error recovery successful');
        return recoveredResponse;
      }

      throw appError;
    }
  }

  /**
   * 执行实际的搜索操作
   * @param request 搜索请求
   * @param signal 中止信号
   * @returns 搜索响应
   */
  private async performSearch(request: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
    const startTime = Date.now();
    const platformStatus: Record<string, PlatformSearchStatus> = {};
    const allResults: MessageResult[] = [];

    console.log('🔍 [SearchService] performSearch START');

    // 获取活跃的平台适配器
    const activeAdapters = this.platformManager.getActiveAdapters();
    const targetPlatforms = request.platforms || activeAdapters;

    console.log('📋 [SearchService] Target platforms:', targetPlatforms);
    console.log('👥 [SearchService] Request accounts:', request.accounts);

    if (targetPlatforms.length === 0) {
      throw new Error('No active platforms available for search');
    }

    if (this.options.enableConcurrentSearch) {
      console.log('🔀 [SearchService] Using concurrent search mode');
      // 并发搜索所有平台
      await this.performConcurrentSearch(request, targetPlatforms, platformStatus, allResults, signal);
    } else {
      console.log('➡️  [SearchService] Using sequential search mode');
      // 顺序搜索各平台
      await this.performSequentialSearch(request, targetPlatforms, platformStatus, allResults, signal);
    }

    // 聚合和排序结果
    const aggregatedResults = this.aggregateResults(allResults, request);

    const totalTime = Date.now() - startTime;

    return {
      results: aggregatedResults,
      totalCount: aggregatedResults.length,
      hasMore: false,
      searchTime: totalTime,
      platformStatus
    };
  }

  /**
   * 并发搜索多个平台
   */
  private async performConcurrentSearch(
    request: SearchRequest,
    platforms: string[],
    platformStatus: Record<string, PlatformSearchStatus>,
    allResults: MessageResult[],
    signal: AbortSignal
  ): Promise<void> {
    console.log(`🔀 [SearchService] Starting concurrent search for ${platforms.length} platforms`);

    const searchPromises = platforms.map(async (platformId) => {
      const platformStartTime = Date.now();
      console.log(`🚀 [SearchService] Starting search for platform: ${platformId}`);

      try {
        if (signal.aborted) {
          throw new Error('Search aborted');
        }

        const adapter = this.platformManager.getAdapter(platformId);
        if (!adapter) {
          throw new Error(`Platform adapter not found: ${platformId}`);
        }

        // ✅ 从 accountsByPlatform 中提取该平台的账户
        const platformAccounts = request.accountsByPlatform?.[platformId] || [];

        const platformRequest: SearchRequest = {
          ...request,
          accounts: platformAccounts  // 只传递该平台的账户
        };

        console.log(`🔍 [SearchService] Calling adapter.search for ${platformId} with ${platformAccounts.length} accounts...`);
        // 执行平台搜索（带重试）
        const results = await this.searchWithRetry(adapter.search.bind(adapter), platformRequest, platformId);

        const searchTime = Date.now() - platformStartTime;
        console.log(`✅ [SearchService] Platform ${platformId} search completed in ${searchTime}ms, found ${results.length} results`);

        platformStatus[platformId] = {
          platform: platformId,
          success: true,
          resultCount: results.length,
          searchTime
        };

        allResults.push(...results);

        // 更新平台统计
        this.updatePlatformStats(platformId, true, searchTime);

      } catch (error) {
        const searchTime = Date.now() - platformStartTime;

        console.error(`❌ [SearchService] Platform ${platformId} search failed after ${searchTime}ms:`, error);

        platformStatus[platformId] = {
          platform: platformId,
          success: false,
          resultCount: 0,
          error: error instanceof Error ? error.message : String(error),
          searchTime
        };

        // 更新平台统计
        this.updatePlatformStats(platformId, false, searchTime);

        console.warn(`Search failed for platform ${platformId}:`, error);
      }
    });

    console.log('⏳ [SearchService] Waiting for all platform searches to complete...');
    await Promise.allSettled(searchPromises);
    console.log('✅ [SearchService] All platform searches completed');
  }

  /**
   * 顺序搜索多个平台
   */
  private async performSequentialSearch(
    request: SearchRequest,
    platforms: string[],
    platformStatus: Record<string, PlatformSearchStatus>,
    allResults: MessageResult[],
    signal: AbortSignal
  ): Promise<void> {
    for (const platformId of platforms) {
      if (signal.aborted) {
        throw new Error('Search aborted');
      }

      const platformStartTime = Date.now();

      try {
        const adapter = this.platformManager.getAdapter(platformId);
        if (!adapter) {
          throw new Error(`Platform adapter not found: ${platformId}`);
        }

        // ✅ 从 accountsByPlatform 中提取该平台的账户
        const platformAccounts = request.accountsByPlatform?.[platformId] || [];

        const platformRequest: SearchRequest = {
          ...request,
          accounts: platformAccounts  // 只传递该平台的账户
        };

        console.log(`🔍 [SearchService] Calling adapter.search for ${platformId} with ${platformAccounts.length} accounts...`);
        const results = await this.searchWithRetry(adapter.search.bind(adapter), platformRequest, platformId);

        const searchTime = Date.now() - platformStartTime;

        platformStatus[platformId] = {
          platform: platformId,
          success: true,
          resultCount: results.length,
          searchTime
        };

        allResults.push(...results);
        this.updatePlatformStats(platformId, true, searchTime);

      } catch (error) {
        const searchTime = Date.now() - platformStartTime;

        platformStatus[platformId] = {
          platform: platformId,
          success: false,
          resultCount: 0,
          error: error instanceof Error ? error.message : String(error),
          searchTime
        };

        this.updatePlatformStats(platformId, false, searchTime);
        console.warn(`Search failed for platform ${platformId}:`, error);
      }
    }
  }

  /**
   * 带重试机制的搜索
   */
  private async searchWithRetry(
    searchFn: (request: SearchRequest) => Promise<MessageResult[]>,
    request: SearchRequest,
    platformId: string
  ): Promise<MessageResult[]> {
    const { maxAttempts, delay, backoffMultiplier, maxDelay, retryableErrors } = this.options.retryConfig;

    let lastError: Error | null = null;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await searchFn(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 检查是否为可重试的错误
        const errorType = this.getErrorType(lastError);
        if (!retryableErrors.includes(errorType) || attempt === maxAttempts) {
          throw lastError;
        }

        // 等待后重试
        await this.delay(Math.min(currentDelay, maxDelay));
        currentDelay *= backoffMultiplier;

        console.log(`Retrying search for platform ${platformId}, attempt ${attempt + 1}/${maxAttempts}`);
      }
    }

    throw lastError;
  }

  /**
   * 聚合搜索结果
   */
  private aggregateResults(results: MessageResult[], request: SearchRequest): MessageResult[] {
    // 去重（基于消息ID和平台）
    const uniqueResults = new Map<string, MessageResult>();

    for (const result of results) {
      const key = `${result.platform}-${result.id}`;
      if (!uniqueResults.has(key)) {
        uniqueResults.set(key, result);
      }
    }

    // 转换为数组并排序
    const aggregatedResults = Array.from(uniqueResults.values());

    // 按时间戳降序排序（最新的在前）
    aggregatedResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return aggregatedResults;
  }

  /**
   * 应用分页
   */
  private applyPagination(results: MessageResult[], pagination?: { page: number; limit: number }): MessageResult[] {
    if (!pagination) {
      return results.slice(0, 100); // 默认返回前100条
    }

    const { page = 1, limit = 100 } = pagination;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return results.slice(startIndex, endIndex);
  }

  /**
   * 检查是否有更多结果
   */
  private hasMoreResults(results: MessageResult[], pagination?: { page: number; limit: number }): boolean {
    if (!pagination) {
      return results.length > 100;
    }

    const { page = 1, limit = 100 } = pagination;
    const endIndex = page * limit;

    return endIndex < results.length;
  }

  /**
   * 生成搜索缓存键
   */
  private generateCacheKey(request: SearchRequest): string {
    const cacheData = {
      query: request.query,
      platforms: request.platforms?.sort() || [],
      accounts: request.accounts?.sort() || [], // 包含账户信息以区分不同账户的搜索结果
      filters: request.filters || {},
      pagination: request.pagination || {}
    };

    return crypto.createHash('md5').update(JSON.stringify(cacheData)).digest('hex');
  }

  /**
   * 获取缓存的搜索结果
   */
  private getCachedResult(request: SearchRequest): SearchCache | null {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.searchCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // 检查缓存是否过期
    const now = Date.now();
    const cacheAge = (now - cached.timestamp.getTime()) / 1000;

    if (cacheAge > cached.ttl) {
      this.searchCache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * 缓存搜索结果
   */
  private cacheSearchResult(request: SearchRequest, results: MessageResult[]): void {
    const cacheKey = this.generateCacheKey(request);

    // 检查缓存大小限制
    if (this.searchCache.size >= this.options.maxCacheEntries) {
      // 删除最旧的缓存条目
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey) {
        this.searchCache.delete(oldestKey);
      }
    }

    const cacheEntry: SearchCache = {
      key: cacheKey,
      results: results.slice(), // 创建副本
      timestamp: new Date(),
      ttl: this.options.cacheTTL,
      searchRequest: { ...request }
    };

    this.searchCache.set(cacheKey, cacheEntry);
  }

  /**
   * 创建搜索响应
   */
  private createSearchResponse(
    results: MessageResult[],
    startTime: number,
    platformStatus: Record<string, PlatformSearchStatus>
  ): SearchResponse {
    return {
      results,
      totalCount: results.length,
      hasMore: false,
      searchTime: Date.now() - startTime,
      platformStatus
    };
  }

  /**
   * 创建超时Promise
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Search timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * 生成搜索ID
   */
  private generateSearchId(request: SearchRequest): string {
    return crypto.createHash('sha256')
      .update(`${Date.now()}-${JSON.stringify(request)}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * 创建应用错误
   */
  private createAppError(error: any, request: SearchRequest): AppError {
    const errorType = this.getErrorType(error);

    return {
      type: errorType,
      message: error instanceof Error ? error.message : String(error),
      retryable: this.options.retryConfig.retryableErrors.includes(errorType),
      timestamp: new Date(),
      details: {
        request,
        originalError: error
      },
      userMessage: this.getUserFriendlyMessage(errorType),
      suggestions: this.getErrorSuggestions(errorType)
    };
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
      if (message.includes('rate limit')) {
        return ErrorType.API_RATE_LIMIT;
      }
      if (message.includes('platform') && message.includes('not found')) {
        return ErrorType.PLATFORM_NOT_CONFIGURED;
      }
    }

    return ErrorType.SEARCH_ERROR;
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(errorType: ErrorType): string {
    const messages: Partial<Record<ErrorType, string>> = {
      [ErrorType.TIMEOUT_ERROR]: '搜索超时，请稍后重试',
      [ErrorType.NETWORK_ERROR]: '网络连接错误，请检查网络设置',
      [ErrorType.CONNECTION_ERROR]: '连接失败，请检查网络连接',
      [ErrorType.AUTH_ERROR]: '认证失败，请重新登录',
      [ErrorType.TOKEN_EXPIRED]: '登录已过期，请重新登录',
      [ErrorType.API_RATE_LIMIT]: '请求过于频繁，请稍后重试',
      [ErrorType.PLATFORM_NOT_CONFIGURED]: '平台未配置，请先配置相关平台',
      [ErrorType.SEARCH_ERROR]: '搜索失败，请重试'
    };

    return messages[errorType] || '发生未知错误';
  }

  /**
   * 获取错误建议
   */
  private getErrorSuggestions(errorType: ErrorType): string[] {
    const suggestions: Partial<Record<ErrorType, string[]>> = {
      [ErrorType.TIMEOUT_ERROR]: ['检查网络连接', '减少搜索范围', '稍后重试'],
      [ErrorType.NETWORK_ERROR]: ['检查网络连接', '检查防火墙设置', '联系网络管理员'],
      [ErrorType.CONNECTION_ERROR]: ['检查网络连接', '重启应用', '联系技术支持'],
      [ErrorType.AUTH_ERROR]: ['重新登录', '检查账户权限', '联系管理员'],
      [ErrorType.TOKEN_EXPIRED]: ['重新登录', '刷新页面', '联系管理员'],
      [ErrorType.API_RATE_LIMIT]: ['等待一段时间后重试', '减少搜索频率'],
      [ErrorType.PLATFORM_NOT_CONFIGURED]: ['配置相关平台', '检查平台设置'],
      [ErrorType.SEARCH_ERROR]: ['检查搜索关键词', '重试搜索', '联系技术支持']
    };

    return suggestions[errorType] || ['重试操作', '联系技术支持'];
  }

  /**
   * 尝试错误恢复
   */
  private async attemptErrorRecovery(request: SearchRequest, error: AppError): Promise<SearchResponse | null> {
    // 如果是认证错误，尝试刷新令牌
    if (error.type === ErrorType.AUTH_ERROR || error.type === ErrorType.TOKEN_EXPIRED) {
      try {
        // 刷新所有平台的令牌
        const activeAdapters = this.platformManager.getActiveAdapters();
        for (const adapterId of activeAdapters) {
          await this.platformManager.refreshPlatformToken(adapterId);
        }

        // 重新尝试搜索
        return await this.search(request);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }
    }

    // 如果是平台不可用错误，尝试使用其他平台
    if (error.type === ErrorType.PLATFORM_UNAVAILABLE && request.platforms) {
      const availablePlatforms = this.platformManager.getActiveAdapters()
        .filter(id => !request.platforms!.includes(id));

      if (availablePlatforms.length > 0) {
        const fallbackRequest = {
          ...request,
          platforms: availablePlatforms
        };

        try {
          return await this.search(fallbackRequest);
        } catch (fallbackError) {
          console.error('Fallback search failed:', fallbackError);
        }
      }
    }

    return null;
  }

  /**
   * 更新搜索指标
   */
  private updateMetrics(response: SearchResponse, searchTime: number): void {
    // 更新平均搜索时间
    const totalTime = this.metrics.averageSearchTime * this.metrics.totalSearches + searchTime;
    this.metrics.averageSearchTime = totalTime / (this.metrics.totalSearches + 1);
  }

  /**
   * 更新平台统计
   */
  private updatePlatformStats(platformId: string, success: boolean, searchTime: number): void {
    if (!this.metrics.platformStats[platformId]) {
      this.metrics.platformStats[platformId] = {
        searches: 0,
        successes: 0,
        failures: 0,
        averageTime: 0
      };
    }

    const stats = this.metrics.platformStats[platformId];
    stats.searches++;

    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    // 更新平均时间
    const totalTime = stats.averageTime * (stats.searches - 1) + searchTime;
    stats.averageTime = totalTime / stats.searches;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 启动缓存清理
   */
  private startCacheCleanup(): void {
    // 每5分钟清理一次过期缓存
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 5 * 60 * 1000);
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cache] of this.searchCache) {
      const cacheAge = (now - cache.timestamp.getTime()) / 1000;
      if (cacheAge > cache.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.searchCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * 取消搜索
   */
  public cancelSearch(searchId: string): boolean {
    const controller = this.activeSearches.get(searchId);
    if (controller) {
      controller.abort();
      this.activeSearches.delete(searchId);
      return true;
    }
    return false;
  }

  /**
   * 取消所有活跃搜索
   */
  public cancelAllSearches(): void {
    for (const [searchId, controller] of this.activeSearches) {
      controller.abort();
    }
    this.activeSearches.clear();
  }

  /**
   * 清空搜索缓存
   */
  public clearCache(): void {
    this.searchCache.clear();
    console.log('Search cache cleared');
  }

  /**
   * 获取搜索指标
   */
  public getMetrics(): SearchMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取缓存统计
   */
  public getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; timestamp: Date; ttl: number; resultCount: number }>;
  } {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = totalRequests > 0 ? this.metrics.cacheHits / totalRequests : 0;

    const entries = Array.from(this.searchCache.values()).map(cache => ({
      key: cache.key,
      timestamp: cache.timestamp,
      ttl: cache.ttl,
      resultCount: cache.results.length
    }));

    return {
      size: this.searchCache.size,
      maxSize: this.options.maxCacheEntries,
      hitRate,
      entries
    };
  }

  /**
   * 重置搜索指标
   */
  public resetMetrics(): void {
    this.metrics = {
      totalSearches: 0,
      successfulSearches: 0,
      failedSearches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageSearchTime: 0,
      platformStats: {}
    };
  }

  /**
   * 更新搜索服务选项
   */
  public updateOptions(newOptions: Partial<SearchServiceOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * 获取当前选项
   */
  public getOptions(): SearchServiceOptions {
    return { ...this.options };
  }

  /**
   * 清理资源
   */
  public async cleanup(): Promise<void> {
    // 取消所有活跃搜索
    this.cancelAllSearches();

    // 清空缓存
    this.clearCache();

    // 移除所有事件监听器
    this.removeAllListeners();

    console.log('Search service cleaned up');
  }
}