/**
 * 搜索服务使用示例
 * 演示如何使用搜索集成服务层进行跨平台搜索
 */

import { SearchService } from '../SearchService';
import { PlatformAdapterManager } from '../PlatformAdapterManager';
import { ConfigurationService } from '../ConfigurationService';
import { SecureStorageService } from '../SecureStorageService';
import { SearchRequest } from '../../../src/types/search';

async function searchServiceExample() {
  console.log('=== 搜索服务使用示例 ===');

  try {
    // 1. 初始化依赖服务
    console.log('\n1. 初始化服务...');
    
    const secureStorage = new SecureStorageService({
      serviceName: 'search-example',
      encryptionAlgorithm: 'aes256',
      enableEncryption: false // 示例中禁用加密
    });

    const configService = new ConfigurationService({
      secureStorage,
      defaultConfig: {
        userId: 'example-user',
        version: '1.0.0'
      }
    });

    await configService.initialize();

    const platformManager = new PlatformAdapterManager(configService);
    await platformManager.initialize();

    // 2. 创建搜索服务
    console.log('\n2. 创建搜索服务...');
    
    const searchService = new SearchService(platformManager, configService, {
      searchTimeout: 10000, // 10秒超时
      cacheTTL: 300, // 5分钟缓存
      maxCacheEntries: 100,
      enableCache: true,
      enableConcurrentSearch: true,
      retryConfig: {
        maxAttempts: 2,
        delay: 1000,
        backoffMultiplier: 2,
        maxDelay: 5000,
        retryableErrors: []
      }
    });

    // 3. 执行基本搜索
    console.log('\n3. 执行基本搜索...');
    
    const basicSearchRequest: SearchRequest = {
      query: 'meeting',
      pagination: { page: 1, limit: 10 }
    };

    try {
      const basicResults = await searchService.search(basicSearchRequest);
      console.log(`基本搜索完成: 找到 ${basicResults.totalCount} 条结果`);
      console.log(`搜索耗时: ${basicResults.searchTime}ms`);
      console.log('平台状态:', basicResults.platformStatus);
    } catch (error) {
      console.log('基本搜索失败:', error instanceof Error ? error.message : String(error));
    }

    // 4. 执行高级搜索
    console.log('\n4. 执行高级搜索...');
    
    const advancedSearchRequest: SearchRequest = {
      query: 'project update',
      platforms: ['slack', 'gmail'], // 只搜索特定平台
      filters: {
        dateRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 过去7天
          end: new Date()
        },
        messageType: 'text'
      },
      pagination: { page: 1, limit: 20 }
    };

    try {
      const advancedResults = await searchService.search(advancedSearchRequest);
      console.log(`高级搜索完成: 找到 ${advancedResults.totalCount} 条结果`);
      console.log(`搜索耗时: ${advancedResults.searchTime}ms`);
      
      // 显示前几条结果
      if (advancedResults.results.length > 0) {
        console.log('\n前3条搜索结果:');
        advancedResults.results.slice(0, 3).forEach((result, index) => {
          console.log(`${index + 1}. [${result.platform}] ${result.sender.name}: ${result.snippet}`);
        });
      }
    } catch (error) {
      console.log('高级搜索失败:', error instanceof Error ? error.message : String(error));
    }

    // 5. 获取搜索指标
    console.log('\n5. 获取搜索指标...');
    
    const metrics = searchService.getMetrics();
    console.log('搜索指标:');
    console.log(`- 总搜索次数: ${metrics.totalSearches}`);
    console.log(`- 成功搜索: ${metrics.successfulSearches}`);
    console.log(`- 失败搜索: ${metrics.failedSearches}`);
    console.log(`- 缓存命中: ${metrics.cacheHits}`);
    console.log(`- 缓存未命中: ${metrics.cacheMisses}`);
    console.log(`- 平均搜索时间: ${metrics.averageSearchTime}ms`);

    // 6. 获取缓存统计
    console.log('\n6. 获取缓存统计...');
    
    const cacheStats = searchService.getCacheStats();
    console.log('缓存统计:');
    console.log(`- 缓存大小: ${cacheStats.size}/${cacheStats.maxSize}`);
    console.log(`- 命中率: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
    console.log(`- 缓存条目: ${cacheStats.entries.length}`);

    // 7. 测试搜索选项更新
    console.log('\n7. 更新搜索选项...');
    
    searchService.updateOptions({
      searchTimeout: 15000, // 增加超时时间
      enableConcurrentSearch: false // 禁用并发搜索
    });

    const updatedOptions = searchService.getOptions();
    console.log('更新后的选项:');
    console.log(`- 搜索超时: ${updatedOptions.searchTimeout}ms`);
    console.log(`- 并发搜索: ${updatedOptions.enableConcurrentSearch}`);

    // 8. 测试缓存功能
    console.log('\n8. 测试缓存功能...');
    
    // 重复相同的搜索请求，应该命中缓存
    try {
      const cachedResults = await searchService.search(basicSearchRequest);
      console.log(`缓存搜索完成: 找到 ${cachedResults.totalCount} 条结果`);
      console.log(`搜索耗时: ${cachedResults.searchTime}ms (应该很快，因为使用了缓存)`);
    } catch (error) {
      console.log('缓存搜索失败:', error instanceof Error ? error.message : String(error));
    }

    // 9. 清理缓存
    console.log('\n9. 清理缓存...');
    
    searchService.clearCache();
    const clearedCacheStats = searchService.getCacheStats();
    console.log(`缓存已清理，当前大小: ${clearedCacheStats.size}`);

    // 10. 重置指标
    console.log('\n10. 重置指标...');
    
    searchService.resetMetrics();
    const resetMetrics = searchService.getMetrics();
    console.log('指标已重置:');
    console.log(`- 总搜索次数: ${resetMetrics.totalSearches}`);
    console.log(`- 成功搜索: ${resetMetrics.successfulSearches}`);

    // 11. 清理资源
    console.log('\n11. 清理资源...');
    
    await searchService.cleanup();
    await platformManager.cleanup();
    
    console.log('\n=== 搜索服务示例完成 ===');

  } catch (error) {
    console.error('搜索服务示例失败:', error);
  }
}

// 演示错误处理
async function errorHandlingExample() {
  console.log('\n=== 错误处理示例 ===');

  try {
    // 创建一个简单的搜索服务用于演示错误处理
    const secureStorage = new SecureStorageService({
      serviceName: 'error-example',
      encryptionAlgorithm: 'aes256',
      enableEncryption: false
    });

    const configService = new ConfigurationService({
      secureStorage,
      defaultConfig: { userId: 'error-user', version: '1.0.0' }
    });

    await configService.initialize();

    const platformManager = new PlatformAdapterManager(configService);
    await platformManager.initialize();

    const searchService = new SearchService(platformManager, configService, {
      searchTimeout: 1000, // 很短的超时时间，容易触发超时错误
      enableCache: false,
      retryConfig: {
        maxAttempts: 1, // 不重试
        delay: 100,
        backoffMultiplier: 1,
        maxDelay: 1000,
        retryableErrors: []
      }
    });

    // 1. 测试无效查询
    console.log('\n1. 测试无效查询...');
    
    try {
      await searchService.search({ query: '' } as SearchRequest);
    } catch (error) {
      console.log('捕获到无效查询错误:', error instanceof Error ? error.message : String(error));
    }

    // 2. 测试超时错误
    console.log('\n2. 测试超时场景...');
    
    try {
      // 这个搜索可能会超时，因为我们设置了很短的超时时间
      await searchService.search({
        query: 'test timeout',
        pagination: { page: 1, limit: 10 }
      });
    } catch (error) {
      console.log('捕获到超时错误:', error instanceof Error ? error.message : String(error));
    }

    // 3. 测试搜索取消
    console.log('\n3. 测试搜索取消...');
    
    // 启动一个搜索然后立即取消
    const searchPromise = searchService.search({
      query: 'test cancel',
      pagination: { page: 1, limit: 10 }
    });

    // 模拟取消操作（实际中searchId会由搜索服务生成）
    setTimeout(() => {
      searchService.cancelAllSearches();
      console.log('已取消所有搜索');
    }, 100);

    try {
      await searchPromise;
    } catch (error) {
      console.log('搜索被取消:', error instanceof Error ? error.message : String(error));
    }

    await searchService.cleanup();
    console.log('\n=== 错误处理示例完成 ===');

  } catch (error) {
    console.error('错误处理示例失败:', error);
  }
}

// 演示并发搜索
async function concurrentSearchExample() {
  console.log('\n=== 并发搜索示例 ===');

  try {
    const secureStorage = new SecureStorageService({
      serviceName: 'concurrent-example',
      encryptionAlgorithm: 'aes256',
      enableEncryption: false
    });

    const configService = new ConfigurationService({
      secureStorage,
      defaultConfig: { userId: 'concurrent-user', version: '1.0.0' }
    });

    await configService.initialize();

    const platformManager = new PlatformAdapterManager(configService);
    await platformManager.initialize();

    const searchService = new SearchService(platformManager, configService, {
      enableConcurrentSearch: true,
      searchTimeout: 30000
    });

    // 同时执行多个搜索
    console.log('\n启动多个并发搜索...');
    
    const searches = [
      { query: 'meeting notes', tag: '会议记录' },
      { query: 'project status', tag: '项目状态' },
      { query: 'team update', tag: '团队更新' }
    ];

    const searchPromises = searches.map(async (search, index) => {
      try {
        console.log(`启动搜索 ${index + 1}: ${search.tag}`);
        const startTime = Date.now();
        
        const result = await searchService.search({
          query: search.query,
          pagination: { page: 1, limit: 5 }
        });
        
        const duration = Date.now() - startTime;
        console.log(`搜索 ${index + 1} 完成: ${search.tag} - ${result.totalCount} 条结果 (${duration}ms)`);
        
        return { search, result, duration };
      } catch (error) {
        console.log(`搜索 ${index + 1} 失败: ${search.tag} - ${error instanceof Error ? error.message : String(error)}`);
        return { search, error, duration: 0 };
      }
    });

    const results = await Promise.allSettled(searchPromises);
    
    console.log('\n并发搜索结果汇总:');
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.result) {
        console.log(`- ${searches[index].tag}: 成功，${result.value.result.totalCount} 条结果`);
      } else {
        console.log(`- ${searches[index].tag}: 失败`);
      }
    });

    await searchService.cleanup();
    console.log('\n=== 并发搜索示例完成 ===');

  } catch (error) {
    console.error('并发搜索示例失败:', error);
  }
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  (async () => {
    await searchServiceExample();
    await errorHandlingExample();
    await concurrentSearchExample();
  })();
}

export {
  searchServiceExample,
  errorHandlingExample,
  concurrentSearchExample
};