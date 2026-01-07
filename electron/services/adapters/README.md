# 平台适配器

本目录包含各个消息平台的适配器实现，用于统一不同平台的API接口。

## SlackAdapter - Slack平台集成

### 功能特性

SlackAdapter 实现了完整的Slack平台集成，包括：

- ✅ **OAuth 2.0认证流程** - 支持Slack应用的OAuth认证
- ✅ **消息搜索** - 使用Slack Search API进行跨频道消息搜索
- ✅ **用户信息获取** - 获取当前用户和工作区信息
- ✅ **深度链接生成** - 生成Slack应用和网页版的深度链接
- ✅ **连接管理** - 连接测试、验证和资源清理
- ✅ **令牌管理** - 访问令牌的验证和刷新

### 配置要求

使用SlackAdapter需要以下配置：

```typescript
const slackConfig: PlatformConfig = {
  id: 'my-slack-workspace',
  name: 'slack',
  displayName: 'My Slack Workspace',
  enabled: true,
  credentials: {
    accessToken: 'xoxb-your-bot-token',      // 必需：Bot User OAuth Token
    clientId: 'your-app-client-id',          // OAuth认证需要
    clientSecret: 'your-app-client-secret',  // OAuth认证需要
    additional: {
      teamId: 'T1234567890',                 // 工作区ID（用于深度链接）
      domain: 'myworkspace',                 // 工作区域名（用于网页链接）
    },
  },
  settings: {
    maxResults: 50,
    timeout: 10000,
    enableCache: true,
    cacheExpiry: 300,
  },
  connectionStatus: {
    connected: false,
    lastChecked: new Date(),
  },
  lastUpdated: new Date(),
};
```

### Slack应用设置

要使用SlackAdapter，需要创建一个Slack应用并配置以下权限：

#### Bot Token Scopes (必需)
- `search:read` - 搜索消息
- `users:read` - 读取用户信息
- `channels:read` - 读取频道信息
- `groups:read` - 读取私有频道信息
- `im:read` - 读取私信信息
- `mpim:read` - 读取多人私信信息

#### User Token Scopes (可选)
- `search:read` - 用户级别的搜索权限

### 使用示例

#### 基本搜索

```typescript
import { SlackAdapter } from './adapters/SlackAdapter';

const adapter = new SlackAdapter(slackConfig);

// 执行搜索
const results = await adapter.search({
  query: 'meeting notes',
  pagination: { page: 1, limit: 10 }
});

console.log(`找到 ${results.length} 条消息`);
```

#### 高级搜索

```typescript
// 带筛选条件的搜索
const results = await adapter.search({
  query: 'project update',
  filters: {
    dateRange: {
      start: new Date('2023-10-01'),
      end: new Date('2023-10-31'),
    },
    sender: 'john.doe',
  },
  pagination: { page: 1, limit: 20 }
});
```

#### OAuth认证流程

```typescript
// 开始OAuth认证
const authResult = await adapter.authenticate();

// 完成OAuth认证（需要用户提供授权码）
const completeResult = await adapter.completeOAuth(authorizationCode);

if (completeResult.success) {
  console.log('认证成功:', completeResult.userInfo);
}
```

### API限制和注意事项

1. **搜索限制**
   - Slack搜索API有速率限制（Tier 3: 50+ requests per minute）
   - 搜索结果最多返回100条消息
   - 搜索查询长度限制为500字符

2. **令牌管理**
   - Bot tokens通常不会过期，但可能被撤销
   - User tokens可能需要定期刷新
   - 建议定期测试连接状态

3. **深度链接**
   - 需要teamId和channelId才能生成完整的深度链接
   - 如果信息不完整，会降级为网页版链接
   - 深度链接格式：`slack://channel?team=TEAM_ID&id=CHANNEL_ID&message=MESSAGE_TS`

### 错误处理

SlackAdapter实现了完善的错误处理机制：

- **网络错误** - 自动重试和超时处理
- **认证错误** - 返回详细的错误信息和重新认证提示
- **API限流** - 检测并报告速率限制错误
- **权限错误** - 提示所需的权限范围

### 测试

运行SlackAdapter的测试：

```bash
# 单元测试
npm test -- --testPathPatterns=SlackAdapter.test.ts

# 集成测试
npm test -- --testPathPatterns=SlackAdapter.integration.test.ts

# 所有测试
npm test -- --testPathPatterns=SlackAdapter
```

### 依赖项

SlackAdapter依赖以下npm包：

- `@slack/web-api` - Slack Web API客户端
- `@slack/oauth` - Slack OAuth流程支持
- `axios` - HTTP请求客户端
- `electron` - 用于打开外部链接

## LarkAdapter - 飞书(Lark)平台集成

### 功能特性

LarkAdapter 实现了完整的飞书平台集成，包括：

- ✅ **OAuth 2.0认证流程** - 支持飞书企业应用的OAuth认证
- ✅ **消息搜索** - 通过获取消息列表+本地过滤实现搜索（飞书API不支持原生搜索）
- ✅ **用户信息获取** - 获取当前用户和企业信息
- ✅ **深度链接生成** - 生成飞书客户端和网页版的深度链接
- ✅ **连接管理** - 连接测试、验证和资源清理
- ✅ **令牌管理** - 访问令牌的验证和刷新
- ✅ **搜索进度通知** - 实时搜索进度推送到前端
- ✅ **可配置搜索范围** - 限制搜索的会话数、页数和时间范围
- ✅ **指数退避重试** - 智能处理API限流和临时错误
- ✅ **详细错误码处理** - 针对飞书特定错误码的处理策略

### 配置要求

使用LarkAdapter需要以下配置：

```typescript
const larkConfig: PlatformConfig = {
  id: 'my-lark-tenant',
  name: 'lark',
  displayName: 'My Lark Workspace',
  enabled: true,
  credentials: {
    accessToken: 'u-xxx',                  // 必需：用户访问令牌
    refreshToken: 'ur-xxx',                // 可选：刷新令牌
    clientId: 'cli_xxx',                   // OAuth认证需要：App ID
    clientSecret: 'xxx',                   // OAuth认证需要：App Secret
    additional: {
      tenantKey: 'xxx',                    // 企业标识（用于深度链接）
    },
  },
  settings: {
    maxResults: 500,
    timeout: 300000,                        // 5分钟超时
    enableCache: true,
    cacheExpiry: 300,
    platformSpecific: {
      larkSearchConfig: {
        maxChatsToSearch: 50,              // 最多搜索多少个会话
        maxPagesPerChat: 10,               // 每个会话最多获取多少页
        recentDaysOnly: 30,                // 只搜索最近N天的会话
        maxSearchResults: 500,             // 最大搜索结果数
        enableChatFilter: true,            // 启用会话过滤
        maxRetries: 3,                     // 最大重试次数
        retryBaseDelay: 1000,              // 重试基础延迟(ms)
      },
    },
  },
  connectionStatus: {
    connected: false,
    lastChecked: new Date(),
  },
  lastUpdated: new Date(),
};
```

### 飞书应用设置

要使用LarkAdapter，需要创建一个飞书企业自建应用并配置以下权限：

#### 必需权限 (Scopes)
- `im:chat:readonly` - 获取会话列表
- `im:message:readonly` - 读取消息内容

#### 可选权限
- `contact:user.base:readonly` - 读取用户基本信息（用于显示用户名）

### 使用示例

#### 基本搜索

```typescript
import { LarkAdapter } from './adapters/LarkAdapter';

const adapter = new LarkAdapter(larkConfig);

// 执行搜索
const results = await adapter.search({
  query: 'meeting notes',
  pagination: { page: 1, limit: 50 }
});

console.log(`找到 ${results.length} 条消息`);
```

#### 高级搜索

```typescript
// 带筛选条件的搜索
const results = await adapter.search({
  query: 'project update',
  filters: {
    dateRange: {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31'),
    },
    sender: 'john.doe',
    messageType: 'text',
  },
  pagination: { page: 1, limit: 100 }
});
```

#### 配置搜索范围

```typescript
// 动态更新搜索配置
adapter.updateSearchConfig({
  maxChatsToSearch: 100,    // 搜索更多会话
  maxPagesPerChat: 20,      // 获取更多历史消息
  recentDaysOnly: 90,       // 扩展到90天
});

// 获取当前配置
const config = adapter.getSearchConfig();
console.log('Current search config:', config);
```

#### 监听搜索进度

```typescript
// 设置进度回调
adapter.setProgressCallback((progress) => {
  console.log(`搜索进度: ${progress.currentChat}/${progress.totalChats}`);
  console.log(`已找到: ${progress.matchedMessages} 条消息`);
  console.log(`阶段: ${progress.stage}`);
});

// 执行搜索（进度会通过回调推送）
const results = await adapter.search({ query: 'test' });
```

#### OAuth认证流程

```typescript
// 开始OAuth认证
const authResult = await adapter.authenticate();
console.log('请访问:', authResult.authUrl);

// 完成OAuth认证（需要用户提供授权码）
const completeResult = await adapter.completeOAuth(authorizationCode);

if (completeResult.success) {
  console.log('认证成功:', completeResult.userInfo);
}
```

### 搜索实现原理

由于飞书 API 不提供原生的消息搜索接口，LarkAdapter 采用两阶段搜索策略：

```
用户输入搜索关键词: "order-12345"
        │
        ▼
步骤 1: 获取所有会话列表
  API: GET /im/v1/chats
  使用 page_token 循环获取所有页
  结果: [会话1, 会话2, ..., 会话N]
        │
        ▼
步骤 2: 并发搜索每个会话
  API: GET /im/v1/messages
  每批 5 个会话并发搜索
  本地过滤包含关键词的消息
        │
        ▼
步骤 3: 合并、排序、返回结果
  按时间倒序排序
  返回匹配的消息列表
```

### API限制和注意事项

1. **搜索限制**
   - 飞书 API 不支持原生搜索，需要遍历获取消息后本地过滤
   - 会话列表 API: Tier 2（约每分钟 50 次请求）
   - 消息列表 API: Tier 2（约每分钟 50 次请求）
   - 建议使用默认的并发控制（5个并发）避免限流

2. **性能预期**
   - 10 个会话: ~5 秒
   - 50 个会话: ~20 秒
   - 100 个会话: ~60 秒
   - 启用会话过滤（只搜索最近活跃的）可显著提升性能

3. **令牌管理**
   - 用户访问令牌有效期约 2 小时
   - 刷新令牌有效期约 30 天
   - 适配器会自动在令牌过期前 5 分钟刷新

4. **深度链接**
   - 客户端链接格式: `lark://client/chat/open?chatId=xxx&messageId=xxx`
   - 网页版链接格式: `https://www.larksuite.com/messenger/xxx`
   - 如果信息不完整，会降级为网页版链接

### 错误处理

LarkAdapter实现了完善的错误处理机制：

| 错误码 | 说明 | 处理方式 |
|-------|------|---------|
| `99991663` | 无权限访问会话 | 跳过该会话，继续搜索 |
| `99991668` | 消息已被撤回 | 忽略该消息 |
| `99002000` | Token 过期 | 自动刷新令牌 |
| `99991429` | 请求频率超限 | 指数退避重试 |
| `99991401` | 无效的 Token | 提示重新认证 |
| `99991672` | 会话不存在 | 跳过该会话 |
| `99991671` | 用户不在会话中 | 跳过该会话 |

### 缓存机制

- **会话列表缓存**: TTL 5 分钟，避免重复请求
- **消息内容缓存**: 最多 1000 条，避免重复转换
- **用户信息缓存**: 按需缓存，减少用户信息查询

### 测试

运行LarkAdapter的测试：

```bash
# 单元测试
npm test -- --testPathPatterns=LarkAdapter.test.ts

# 集成测试
npm test -- --testPathPatterns=LarkAdapter.integration.test.ts

# 性能测试
npm test -- --testPathPatterns=LarkAdapter.performance.test.ts

# 所有测试
npm test -- --testPathPatterns=LarkAdapter
```

### 依赖项

LarkAdapter依赖以下npm包：

- `@larksuiteoapi/node-sdk` - 飞书 Node.js SDK
- `axios` - HTTP 请求客户端
- `electron` - 用于 IPC 通信和打开外部链接

---

## GmailAdapter - Gmail平台集成

Gmail邮件搜索适配器，支持多账户搜索。

---

## 接口规范

每个适配器都实现了相同的`PlatformAdapter`接口，确保统一的使用体验：

```typescript
interface PlatformAdapter {
  // 认证
  authenticate(): Promise<AuthResult>;
  completeOAuth(code: string): Promise<OAuthCompleteResult>;
  refreshToken(tokenId: string): Promise<RefreshTokenResult>;

  // 搜索
  search(request: SearchRequest): Promise<MessageResult[]>;

  // 用户信息
  getUserInfo(): Promise<PlatformUserInfo>;

  // 连接管理
  validateConnection(): Promise<boolean>;
  testConnection(): Promise<ConnectionTestResult>;
  disconnect(): Promise<void>;

  // 工具方法
  getDeepLink(messageId: string, params?: Record<string, string>): string;
}
```