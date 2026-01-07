# 搜索集成服务层 (SearchService)

搜索集成服务层是跨平台消息搜索应用的核心组件，负责管理多平台并发搜索、结果聚合、缓存机制和错误处理。

## 功能特性

### 🔍 多平台并发搜索
- 同时搜索多个消息平台（Slack、Gmail、Lark等）
- 支持并发和顺序搜索模式
- 智能错误处理，部分平台失败不影响其他平台

### ⚡ 智能缓存机制
- 基于搜索请求的MD5哈希缓存
- 可配置的缓存TTL和最大条目数
- 自动清理过期缓存
- 缓存命中率统计

### 🔄 重试和错误恢复
- 可配置的重试策略（指数退避）
- 自动令牌刷新
- 平台降级处理
- 详细的错误分类和用户友好提示

### 📊 搜索指标和监控
- 实时搜索性能指标
- 平台级别的成功率统计
- 缓存使用情况分析
- 搜索时间分析

### ⏱️ 超时和取消控制
- 可配置的搜索超时
- 支持单个搜索取消
- 批量取消所有活跃搜索

## 架构设计

```
SearchService
├── 搜索执行引擎
│   ├── 并发搜索管理
│   ├── 结果聚合排序
│   └── 分页处理
├── 缓存管理器
│   ├── 缓存键生成
│   ├── 过期清理
│   └── 统计收集
├── 错误处理器
│   ├── 重试机制
│   ├── 错误恢复
│   └── 用户提示
└── 指标收集器
    ├── 性能统计
    ├── 平台状态
    └── 缓存分析
```

## 使用方法

### 基本搜索

```typescript
import { SearchService } from './SearchService';

// 创建搜索服务
const searchService = new SearchService(
  platformManager,
  configService,
  {
    searchTimeout: 30000,
    enableCache: true,
    enableConcurrentSearch: true
  }
);

// 执行搜索
const request = {
  query: 'meeting notes',
  pagination: { page: 1, limit: 20 }
};

const response = await searchService.search(request);
console.log(`找到 ${response.totalCount} 条结果`);
```

### 高级搜索

```typescript
// 带筛选条件的搜索
const advancedRequest = {
  query: 'project update',
  platforms: ['slack', 'gmail'], // 指定平台
  filters: {
    dateRange: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31')
    },
    sender: 'john@example.com',
    messageType: 'text'
  },
  pagination: { page: 1, limit: 50 }
};

const results = await searchService.search(advancedRequest);
```

### 搜索管理

```typescript
// 取消搜索
searchService.cancelSearch(searchId);

// 取消所有搜索
searchService.cancelAllSearches();

// 清空缓存
searchService.clearCache();

// 获取指标
const metrics = searchService.getMetrics();
console.log(`成功率: ${metrics.successfulSearches / metrics.totalSearches * 100}%`);
```

## 配置选项

### SearchServiceOptions

```typescript
interface SearchServiceOptions {
  /** 搜索超时时间（毫秒），默认30000 */
  searchTimeout: number;
  
  /** 缓存TTL（秒），默认300 */
  cacheTTL: number;
  
  /** 最大缓存条目数，默认1000 */
  maxCacheEntries: number;
  
  /** 是否启用缓存，默认true */
  enableCache: boolean;
  
  /** 是否启用并发搜索，默认true */
  enableConcurrentSearch: boolean;
  
  /** 重试配置 */
  retryConfig: {
    maxAttempts: number;      // 最大重试次数
    delay: number;            // 初始延迟（毫秒）
    backoffMultiplier: number; // 延迟倍数
    maxDelay: number;         // 最大延迟
    retryableErrors: ErrorType[]; // 可重试的错误类型
  };
}
```

## 搜索响应格式

### SearchResponse

```typescript
interface SearchResponse {
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
```

### MessageResult

```typescript
interface MessageResult {
  id: string;                    // 消息ID
  platform: 'slack' | 'gmail' | 'lark'; // 平台类型
  sender: MessageSender;         // 发送人信息
  content: string;               // 消息内容
  timestamp: Date;               // 发送时间
  channel?: string;              // 频道/会话
  deepLink: string;              // 深度链接
  snippet: string;               // 消息摘要
  messageType: 'text' | 'file' | 'image' | 'other';
  attachments?: MessageAttachment[]; // 附件
  metadata?: Record<string, any>; // 平台特定元数据
}
```

## 错误处理

### 错误类型

- `TIMEOUT_ERROR`: 搜索超时
- `NETWORK_ERROR`: 网络连接错误
- `AUTH_ERROR`: 认证失败
- `API_RATE_LIMIT`: API限流
- `PLATFORM_UNAVAILABLE`: 平台不可用
- `SEARCH_ERROR`: 通用搜索错误

### 错误恢复策略

1. **自动重试**: 对网络错误、超时等进行自动重试
2. **令牌刷新**: 认证错误时自动刷新访问令牌
3. **平台降级**: 部分平台失败时继续其他平台搜索
4. **用户提示**: 提供友好的错误信息和解决建议

## 性能优化

### 缓存策略
- 基于搜索参数的智能缓存键生成
- LRU缓存淘汰策略
- 定期清理过期缓存
- 缓存预热机制

### 搜索优化
- 并发搜索减少总体延迟
- 结果流式返回（未来版本）
- 搜索结果去重和排序
- 智能分页处理

### 内存管理
- 限制缓存大小防止内存泄漏
- 及时清理搜索控制器
- 事件监听器自动清理

## 监控和调试

### 搜索指标

```typescript
interface SearchMetrics {
  totalSearches: number;        // 总搜索次数
  successfulSearches: number;   // 成功搜索次数
  failedSearches: number;       // 失败搜索次数
  cacheHits: number;           // 缓存命中次数
  cacheMisses: number;         // 缓存未命中次数
  averageSearchTime: number;   // 平均搜索时间
  platformStats: Record<string, PlatformStats>; // 平台统计
}
```

### 缓存统计

```typescript
interface CacheStats {
  size: number;                // 当前缓存大小
  maxSize: number;            // 最大缓存大小
  hitRate: number;            // 命中率
  entries: CacheEntry[];      // 缓存条目详情
}
```

## 事件系统

SearchService继承自EventEmitter，支持以下事件：

- `searchStarted`: 搜索开始
- `searchCompleted`: 搜索完成
- `searchFailed`: 搜索失败
- `cacheHit`: 缓存命中
- `platformError`: 平台错误

```typescript
searchService.on('searchCompleted', (data) => {
  console.log(`搜索完成: ${data.response.totalCount} 条结果`);
});

searchService.on('searchFailed', (data) => {
  console.error(`搜索失败: ${data.error.message}`);
});
```

## IPC通信

### 前端API

通过`window.electronAPI.search`访问搜索功能：

```typescript
// 执行搜索
const response = await window.electronAPI.search.execute(request);

// 获取指标
const metrics = await window.electronAPI.search.getMetrics();

// 清空缓存
await window.electronAPI.search.clearCache();
```

### 支持的IPC方法

- `search:execute` - 执行搜索
- `search:cancel` - 取消搜索
- `search:cancelAll` - 取消所有搜索
- `search:clearCache` - 清空缓存
- `search:getCacheStats` - 获取缓存统计
- `search:getMetrics` - 获取搜索指标
- `search:resetMetrics` - 重置指标
- `search:getOptions` - 获取配置选项
- `search:updateOptions` - 更新配置选项

## 最佳实践

### 1. 搜索请求优化
```typescript
// ✅ 好的做法
const request = {
  query: 'meeting notes',
  platforms: ['slack'], // 明确指定平台
  pagination: { page: 1, limit: 20 }, // 合理的分页大小
  filters: {
    dateRange: { 
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date() 
    }
  }
};

// ❌ 避免的做法
const badRequest = {
  query: '', // 空查询
  pagination: { page: 1, limit: 1000 } // 过大的分页
};
```

### 2. 错误处理
```typescript
try {
  const response = await searchService.search(request);
  // 处理成功结果
} catch (error) {
  if (error.retryable) {
    // 可重试的错误，显示重试按钮
    showRetryButton();
  } else {
    // 不可重试的错误，显示错误信息
    showErrorMessage(error.userMessage);
  }
}
```

### 3. 性能监控
```typescript
// 定期检查搜索性能
setInterval(() => {
  const metrics = searchService.getMetrics();
  if (metrics.averageSearchTime > 5000) {
    console.warn('搜索性能下降，平均时间超过5秒');
  }
}, 60000);
```

## 故障排除

### 常见问题

1. **搜索超时**
   - 检查网络连接
   - 增加超时时间
   - 减少搜索范围

2. **缓存未命中**
   - 检查搜索参数是否完全一致
   - 确认缓存未过期
   - 检查缓存配置

3. **平台搜索失败**
   - 验证平台认证状态
   - 检查API配额限制
   - 确认平台服务可用性

### 调试技巧

```typescript
// 启用详细日志
searchService.on('searchStarted', console.log);
searchService.on('searchCompleted', console.log);
searchService.on('searchFailed', console.error);

// 检查缓存状态
const cacheStats = searchService.getCacheStats();
console.log('缓存状态:', cacheStats);

// 检查平台连接
const platformManager = serviceManager.getPlatformAdapterManager();
const connections = await platformManager.validateAllConnections();
console.log('平台连接状态:', connections);
```

## 扩展开发

### 添加新的搜索筛选器

```typescript
// 扩展SearchFilters接口
interface ExtendedSearchFilters extends SearchFilters {
  priority?: 'high' | 'medium' | 'low';
  hasAttachments?: boolean;
}

// 在搜索逻辑中处理新筛选器
private applyFilters(results: MessageResult[], filters: ExtendedSearchFilters): MessageResult[] {
  let filtered = results;
  
  if (filters.priority) {
    filtered = filtered.filter(r => r.metadata?.priority === filters.priority);
  }
  
  if (filters.hasAttachments !== undefined) {
    filtered = filtered.filter(r => 
      filters.hasAttachments ? r.attachments?.length > 0 : !r.attachments?.length
    );
  }
  
  return filtered;
}
```

### 自定义错误恢复策略

```typescript
class CustomSearchService extends SearchService {
  protected async attemptErrorRecovery(request: SearchRequest, error: AppError): Promise<SearchResponse | null> {
    // 自定义错误恢复逻辑
    if (error.type === ErrorType.CUSTOM_ERROR) {
      // 执行自定义恢复策略
      return await this.customRecoveryStrategy(request, error);
    }
    
    // 调用父类的恢复策略
    return await super.attemptErrorRecovery(request, error);
  }
}
```

## 版本历史

- **v1.0.0**: 初始版本，支持基本搜索功能
- **v1.1.0**: 添加缓存机制和重试策略
- **v1.2.0**: 增加搜索指标和监控
- **v1.3.0**: 支持搜索取消和错误恢复

## 相关文档

- [平台适配器开发指南](./adapters/README.md)
- [配置管理服务](./ConfigurationService.ts)
- [错误处理机制](../../src/types/error.ts)
- [搜索类型定义](../../src/types/search.ts)