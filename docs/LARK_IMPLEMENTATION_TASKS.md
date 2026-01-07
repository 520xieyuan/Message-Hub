# Lark 搜索功能实施任务清单

**实施方案**: 方案 B - 快速实施（完整功能）
**预计总工期**: 7-10 天
**创建日期**: 2025-12-18
**负责人**: 开发团队

---

## 📋 任务概览

本文档列出实施 Lark（飞书）消息搜索功能的完整任务清单，按优先级和依赖关系组织。

### 进度追踪

```
总任务数: 38
已完成: 38 (全部完成)
进行中: 0
待开始: 0
完成度: 100%
```

**最新更新**: 2025-12-19
- ✅ 任务 1.1-1.12 (第一阶段 P0) 已完成
- ✅ 任务 2.1-2.5 (第二阶段 P1) 已完成
- ✅ 任务 3.1-3.8 (第三阶段 P2 测试) 已完成 - 109 个测试全部通过
- ✅ 任务 4.1-4.7 (第四阶段 P3 优化) 已完成
  - 可配置的搜索范围限制
  - 指数退避重试机制
  - 详细错误码处理
  - 实时搜索进度通知
- ✅ 任务 5.1-5.6 (第五阶段 P3 文档) 已完成
  - README.md 更新
  - CLAUDE.md 更新
  - 适配器 README 更新
  - LARK_DEPLOYMENT.md 部署指南
  - JSDoc 注释完善
  - CHANGELOG.md 发布说明

---

## 🎯 第一阶段：核心功能实现（P0）

预计工期：3-5 天

### 任务 1.1：实现 Lark SDK 集成

**优先级**: P0
**预计时间**: 4 小时
**依赖**: 无

**任务描述**:
- [x] 安装飞书 Node.js SDK：`npm install @larksuiteoapi/node-sdk`
- [x] 在 LarkAdapter 中初始化 Lark Client
- [x] 配置 SDK 日志级别
- [x] 验证 SDK 能正常导入和初始化

**状态**: ✅ 已完成

**验收标准**:
```typescript
import * as lark from '@larksuiteoapi/node-sdk';

// 能成功创建客户端实例
const client = new lark.Client({
  appId: 'xxx',
  appSecret: 'xxx'
});
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts`
- `package.json`

---

### 任务 1.2：实现 OAuth 认证流程

**优先级**: P0
**预计时间**: 1 天
**依赖**: 任务 1.1

**任务描述**:
- [x] 实现 `authenticate()` 方法
  - 生成 OAuth 授权 URL
  - 设置正确的 scope 权限
  - 返回 AuthResult 对象
- [x] 实现 `completeOAuth(code)` 方法
  - 使用授权码交换 access_token
  - 保存 refresh_token
  - 获取用户信息
- [x] 实现错误处理（无效授权码、过期等）

**状态**: ✅ 已完成

**验收标准**:
```typescript
// 1. 能生成授权 URL
const authResult = await larkAdapter.authenticate();
expect(authResult.authUrl).toContain('open.feishu.cn');

// 2. 能用授权码完成认证
const result = await larkAdapter.completeOAuth('auth_code_xxx');
expect(result.success).toBe(true);
expect(result.credentials.accessToken).toBeDefined();
```

**所需权限**:
- `im:chat:readonly` - 获取会话列表
- `im:message:readonly` - 读取消息内容

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 24-28, 106-111 行)

**参考文档**:
- https://open.feishu.cn/document/common-capabilities/sso/api/get-access_token

---

### 任务 1.3：实现令牌刷新逻辑

**优先级**: P0
**预计时间**: 4 小时
**依赖**: 任务 1.2

**任务描述**:
- [x] 实现 `refreshToken()` 方法
  - 使用 refresh_token 获取新的 access_token
  - 更新令牌到 OAuth Server
  - 处理 refresh_token 过期情况
- [x] 实现 `isTokenExpired()` 检查（继承自 BaseAdapter）
- [x] 添加自动刷新逻辑（提前 5 分钟刷新）

**状态**: ✅ 已完成

**验收标准**:
```typescript
// 能成功刷新令牌
const result = await larkAdapter.refreshToken('token_id_xxx');
expect(result.success).toBe(true);
expect(result.credentials.accessToken).not.toBe(oldToken);

// refresh_token 过期时返回需要重新授权
const expiredResult = await larkAdapter.refreshToken('expired_token_id');
expect(expiredResult.requiresReauth).toBe(true);
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 31-36 行)

---

### 任务 1.4：实现获取所有会话列表

**优先级**: P0
**预计时间**: 4 小时
**依赖**: 任务 1.3

**任务描述**:
- [x] 实现 `getAllChats()` 私有方法
  - 调用 `im/v1/chats` API
  - 使用 `page_token` 循环获取所有页
  - 处理 `has_more` 标志
  - 返回完整的会话列表
- [x] 添加会话过滤逻辑（可选）
  - 过滤掉已归档的会话
  - 只保留近期活跃的会话
- [x] 添加缓存机制（5 分钟 TTL）

**状态**: ✅ 已完成

**验收标准**:
```typescript
const chats = await larkAdapter['getAllChats']();
expect(chats.length).toBeGreaterThan(0);
expect(chats[0]).toHaveProperty('chat_id');
expect(chats[0]).toHaveProperty('name');
```

**API 端点**:
- `GET https://open.feishu.cn/open-apis/im/v1/chats`

**请求参数**:
```typescript
{
  page_size: 100,      // 每页最多 100 个
  page_token: string   // 空字符串表示第一页
}
```

**响应格式**:
```typescript
{
  has_more: boolean,
  page_token: string,
  items: [
    {
      chat_id: string,
      name: string,
      chat_type: 'p2p' | 'group',
      avatar: string,
      ...
    }
  ]
}
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (新增私有方法)

**参考文档**:
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/chat/list

---

### 任务 1.5：实现单个会话的消息搜索

**优先级**: P0
**预计时间**: 6 小时
**依赖**: 任务 1.4

**任务描述**:
- [x] 实现 `searchInChat(chatId, request)` 私有方法
  - 调用 `im/v1/messages` API
  - 传递时间范围参数（`start_time`, `end_time`）
  - 使用 `page_token` 循环获取所有页
  - 本地过滤包含关键词的消息
  - 返回匹配的消息列表
- [x] 实现消息匹配逻辑 `messageMatchesQuery()`
  - 关键词匹配（大小写不敏感）
  - 发送者过滤
  - 消息类型过滤
- [x] 添加早停机制（达到最大结果数时停止）

**状态**: ✅ 已完成

**验收标准**:
```typescript
const messages = await larkAdapter['searchInChat']('chat_xxx', {
  query: 'test',
  filters: {
    dateRange: {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31')
    }
  }
});
expect(messages.length).toBeGreaterThanOrEqual(0);
expect(messages.every(m => m.content.toLowerCase().includes('test'))).toBe(true);
```

**API 端点**:
- `GET https://open.feishu.cn/open-apis/im/v1/messages`

**请求参数**:
```typescript
{
  container_id: string,        // 会话 ID
  container_id_type: 'chat',   // 容器类型
  start_time: string,          // 毫秒时间戳（可选）
  end_time: string,            // 毫秒时间戳（可选）
  page_size: 50,               // 每页数量
  page_token: string           // 分页标记
}
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (新增私有方法)

**参考文档**:
- https://open.feishu.cn/document/server-docs/im-v1/message/list

---

### 任务 1.6：实现消息内容提取

**优先级**: P0
**预计时间**: 4 小时
**依赖**: 任务 1.5

**任务描述**:
- [x] 实现 `extractMessageContent(message)` 私有方法
  - 解析 `message.body` JSON
  - 根据 `msg_type` 提取不同类型的内容
    - `text`: 提取 `body.text`
    - `post`: 递归提取富文本中的所有文本
    - `image`: 返回 `body.image_key`
    - `file`: 返回 `body.file_name`
    - `audio/video`: 返回文件名或标题
  - 处理解析错误

**状态**: ✅ 已完成

**验收标准**:
```typescript
// 文本消息
const textMsg = { msg_type: 'text', body: '{"text":"hello"}' };
expect(extractMessageContent(textMsg)).toBe('hello');

// 富文本消息
const postMsg = { msg_type: 'post', body: '{"title":"标题","content":[{"text":"内容"}]}' };
expect(extractMessageContent(postMsg)).toContain('标题');
expect(extractMessageContent(postMsg)).toContain('内容');

// 文件消息
const fileMsg = { msg_type: 'file', body: '{"file_name":"report.pdf"}' };
expect(extractMessageContent(fileMsg)).toBe('report.pdf');
```

**消息类型参考**:
```typescript
type LarkMessageType =
  | 'text'     // 纯文本
  | 'post'     // 富文本
  | 'image'    // 图片
  | 'file'     // 文件
  | 'audio'    // 音频
  | 'video'    // 视频
  | 'sticker'  // 表情
  | 'media'    // 媒体
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (新增私有方法)

**参考文档**:
- https://open.feishu.cn/document/server-docs/im-v1/message-content-description/message_content

---

### 任务 1.7：实现消息格式转换

**优先级**: P0
**预计时间**: 4 小时
**依赖**: 任务 1.6

**任务描述**:
- [x] 实现 `convertLarkMessage(message, chatId)` 私有方法
  - 提取发送者信息
  - 转换时间戳（毫秒 → Date）
  - 生成消息摘要（最多 200 字符）
  - 映射消息类型（Lark 类型 → 统一类型）
  - 生成深度链接
  - 返回 `MessageResult` 对象
- [x] 实现 `mapLarkMessageType()` 辅助方法
  - text/post → 'text'
  - image → 'image'
  - file/audio/video → 'file'
  - 其他 → 'other'

**状态**: ✅ 已完成

**验收标准**:
```typescript
const larkMsg = {
  message_id: 'msg_xxx',
  msg_type: 'text',
  body: '{"text":"test message"}',
  create_time: '1704067200000',
  sender: {
    sender_id: { user_id: 'user_xxx', open_id: 'open_xxx' }
  }
};

const result = await convertLarkMessage(larkMsg, 'chat_xxx');
expect(result.platform).toBe('lark');
expect(result.content).toBe('test message');
expect(result.messageType).toBe('text');
expect(result.timestamp).toBeInstanceOf(Date);
expect(result.deepLink).toContain('message_id=msg_xxx');
```

**MessageResult 格式**:
```typescript
interface MessageResult {
  id: string;
  platform: 'lark';
  sender: MessageSender;
  content: string;
  snippet: string;
  timestamp: Date;
  deepLink: string;
  messageType: 'text' | 'file' | 'image' | 'other';
  channel?: string;
  metadata?: Record<string, any>;
  accountId?: string;
}
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (新增私有方法)

---

### 任务 1.8：实现主搜索方法

**优先级**: P0
**预计时间**: 6 小时
**依赖**: 任务 1.5, 1.7

**任务描述**:
- [x] 实现 `search(request)` 方法
  - 获取所有会话列表
  - 并发搜索多个会话（控制并发数为 5）
  - 合并所有搜索结果
  - 按时间倒序排序
  - 返回结果数组
- [x] 实现 `chunkArray()` 工具方法（数组分块）
- [x] 添加搜索进度日志
- [x] 添加错误处理（单个会话失败不影响整体）

**状态**: ✅ 已完成

**验收标准**:
```typescript
const results = await larkAdapter.search({
  query: 'order-12345',
  filters: {
    dateRange: {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31')
    }
  },
  pagination: { page: 1, limit: 50 }
});

expect(results).toBeInstanceOf(Array);
expect(results.every(r => r.platform === 'lark')).toBe(true);
expect(results.every(r => r.content.includes('order-12345'))).toBe(true);
// 验证时间倒序
expect(results[0].timestamp.getTime()).toBeGreaterThanOrEqual(results[1].timestamp.getTime());
```

**实现要点**:
```typescript
async search(request: SearchRequest): Promise<MessageResult[]> {
  // 1. 获取会话列表
  const chats = await this.getAllChats();

  // 2. 分批并发搜索
  const MAX_CONCURRENT = 5;
  const chatBatches = this.chunkArray(chats, MAX_CONCURRENT);

  const allResults = [];
  for (const batch of chatBatches) {
    const promises = batch.map(chat =>
      this.searchInChat(chat.chat_id, request)
        .catch(err => {
          console.error(`Failed to search chat ${chat.chat_id}:`, err);
          return [];
        })
    );
    const batchResults = await Promise.all(promises);
    allResults.push(...batchResults.flat());
  }

  // 3. 排序
  allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return allResults;
}
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 55-59 行)

---

### 任务 1.9：实现深度链接生成

**优先级**: P0
**预计时间**: 2 小时
**依赖**: 任务 1.8

**任务描述**:
- [x] 实现 `getDeepLink(messageId, params)` 方法
  - 生成飞书深度链接格式
  - 支持跳转到指定消息
  - 支持跳转到指定会话
- [x] 添加备用的网页版链接

**状态**: ✅ 已完成

**验收标准**:
```typescript
const deepLink = larkAdapter.getDeepLink('msg_xxx', {
  chat_id: 'chat_xxx'
});

expect(deepLink).toMatch(/^https:\/\/.*feishu\.cn/);
expect(deepLink).toContain('msg_xxx');
```

**深度链接格式参考**:
```
飞书客户端: larksr://client/chat/open?openChatId=xxx&messageId=xxx
网页版: https://open.feishu.cn/open-apis/im/v1/chats/xxx/messages/xxx
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 64-68 行)

---

### 任务 1.10：实现用户信息获取

**优先级**: P1
**预计时间**: 2 小时
**依赖**: 任务 1.3

**任务描述**:
- [x] 实现 `getUserInfo()` 方法
  - 调用飞书 API 获取当前用户信息
  - 返回 `PlatformUserInfo` 对象
- [x] 添加用户信息缓存

**状态**: ✅ 已完成

**验收标准**:
```typescript
const userInfo = await larkAdapter.getUserInfo();
expect(userInfo.id).toBeDefined();
expect(userInfo.email).toBeDefined();
expect(userInfo.name).toBeDefined();
```

**API 端点**:
- `GET https://open.feishu.cn/open-apis/authen/v1/user_info`

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 73-76 行)

---

### 任务 1.11：实现连接验证

**优先级**: P1
**预计时间**: 2 小时
**依赖**: 任务 1.3

**任务描述**:
- [x] 实现 `validateConnection()` 方法
  - 检查 access_token 是否有效
  - 尝试调用简单的 API（如获取用户信息）
  - 返回连接状态
- [x] 实现 `testConnection()` 方法
  - 测试 API 连接是否正常
  - 返回测试结果

**状态**: ✅ 已完成

**验收标准**:
```typescript
// 有效令牌
const isValid = await larkAdapter.validateConnection();
expect(isValid).toBe(true);

// 无效令牌
larkAdapter.config.credentials.accessToken = 'invalid_token';
const isInvalid = await larkAdapter.validateConnection();
expect(isInvalid).toBe(false);
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 39-50, 89-98 行)

---

### 任务 1.12：实现资源清理

**优先级**: P2
**预计时间**: 1 小时
**依赖**: 无

**任务描述**:
- [x] 实现 `disconnect()` 方法
  - 清理缓存（会话列表、消息缓存）
  - 关闭连接
  - 重置状态
- [x] 添加清理日志

**状态**: ✅ 已完成

**验收标准**:
```typescript
await larkAdapter.disconnect();
// 验证缓存已清空
expect(larkAdapter['chatListCache']).toBeNull();
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 81-84 行)

---

## 🔧 第二阶段：集成与配置（P1）

预计工期：1-2 天

### 任务 2.1：验证 PlatformAdapterFactory

**优先级**: P1
**预计时间**: 1 小时
**依赖**: 任务 1.8

**任务描述**:
- [x] 检查 `PlatformAdapterFactory.createAdapter()` 方法
- [x] 验证 Lark 分支是否正确（第 56-58 行）
- [x] 测试能否成功创建 LarkAdapter 实例

**状态**: ✅ 已完成

**验收标准**:
```typescript
const adapter = PlatformAdapterFactory.createAdapter({
  platform: 'lark',
  ...config
});
expect(adapter).toBeInstanceOf(LarkAdapter);
```

**文件位置**:
- `electron/services/PlatformAdapterFactory.ts` (第 56-58 行)

---

### 任务 2.2：检查 PlatformAdapterManager 初始化

**优先级**: P1
**预计时间**: 2 小时
**依赖**: 任务 2.1

**任务描述**:
- [x] 检查 `PlatformAdapterManager.initialize()` 方法（第 28-114 行）
- [x] 确认是否需要添加 Lark 初始化逻辑
- [x] 如需要，添加 Lark 配置初始化
- [x] 确保初始化失败不影响应用启动

**状态**: ✅ 已完成

**验收标准**:
```typescript
// 初始化成功
await platformAdapterManager.initialize();
const larkAdapter = platformAdapterManager.getAdapter('lark');
expect(larkAdapter).toBeDefined();

// 即使 Lark 初始化失败，其他平台仍正常
// Gmail 和 Slack 适配器应该仍然可用
```

**实现要点**:
```typescript
// 使用 try-catch 包装，避免单个平台失败影响整体
try {
  const larkConfig = await this.createLarkConfig();
  await this.loadAdapter(larkConfig);
} catch (error) {
  console.error('Failed to initialize Lark adapter:', error);
  // 不抛出错误，继续初始化其他平台
}
```

**文件位置**:
- `electron/services/PlatformAdapterManager.ts` (第 28-86 行)

---

### 任务 2.3：验证 SearchService 集成

**优先级**: P1
**预计时间**: 2 小时
**依赖**: 任务 2.2

**任务描述**:
- [x] 验证 `SearchService.search()` 能正确调用 LarkAdapter
- [x] 测试多平台并发搜索（Gmail + Slack + Lark）
- [x] 确认结果合并逻辑正确
- [x] 测试错误处理（Lark 搜索失败不影响其他平台）

**状态**: ✅ 已完成（SearchService 是平台无关的，通过 PlatformAdapterManager 调用）

**验收标准**:
```typescript
// 多平台搜索
const response = await searchService.search({
  query: 'test',
  platforms: ['gmail', 'slack', 'lark']
});

expect(response.results.length).toBeGreaterThan(0);
expect(response.platformStatus['lark'].success).toBe(true);

// Lark 失败不影响其他平台
// 模拟 Lark API 失败
const response2 = await searchService.search({...});
expect(response2.platformStatus['gmail'].success).toBe(true);
expect(response2.platformStatus['slack'].success).toBe(true);
```

**文件位置**:
- `electron/services/SearchService.ts`

---

### 任务 2.4：更新前端 AccountsPage

**优先级**: P1
**预计时间**: 3 小时
**依赖**: 任务 2.2

**任务描述**:
- [x] 在 `AccountsPage.tsx` 中添加 Lark 平台分支
- [x] 添加 Lark OAuth 应用选择逻辑
- [x] 添加 Lark 账户管理 UI
- [x] 更新平台统计显示（第 463 行）
- [x] 测试 Lark 账户添加流程

**状态**: ✅ 已完成

**实现要点**:
```typescript
// 在添加账户时处理 Lark 平台
if (app.platform === 'gmail') {
  // Gmail 处理
} else if (app.platform === 'slack') {
  // Slack 处理
} else if (app.platform === 'lark') {
  // Lark 处理
  setShowLarkForm(true);
  // 显示 Lark 特定的配置选项
}
```

**验收标准**:
- [x] 能在 UI 上看到 Lark 平台选项
- [x] 能选择 Lark OAuth 应用
- [x] 能触发 Lark OAuth 认证流程
- [x] 认证成功后能看到 Lark 账户

**文件位置**:
- `src/pages/AccountsPage.tsx` (第 48, 60+, 100+ 行)

---

### 任务 2.5：验证 OAuth 流程集成

**优先级**: P1
**预计时间**: 2 小时
**依赖**: 任务 1.2, 2.4

**任务描述**:
- [x] 测试完整的 Lark OAuth 流程
  - 用户点击"添加 Lark 账户"
  - 跳转到飞书授权页面
  - 用户授权后回调到 OAuth Server
  - OAuth Server 推送令牌到 Electron 客户端
  - IntegratedAuthService 保存令牌
  - 创建 Chrome Profile（如需要）
- [x] 验证 OAuthIPCHandlers 正确处理 Lark
- [x] 验证 RemoteOAuthService 正确处理 Lark

**状态**: ✅ 已完成（OAuthIPCHandlers.ts:32 已支持 'lark' 平台）

**验收标准**:
- [x] 完整流程无错误
- [x] 令牌正确保存到 OAuth Server
- [x] Electron 客户端能获取到令牌
- [x] 账户状态显示为"已连接"

**文件位置**:
- `electron/services/OAuthIPCHandlers.ts`
- `electron/services/IntegratedAuthService.ts`
- `electron/services/RemoteOAuthService.ts`

---

## 🧪 第三阶段：测试与验证（P2）

预计工期：2-3 天

### 任务 3.1：编写单元测试 - 消息提取

**优先级**: P2
**预计时间**: 3 小时
**依赖**: 任务 1.6

**任务描述**:
- [x] 创建测试文件 `LarkAdapter.test.ts`
- [x] 测试 `extractMessageContent()` 方法
  - 测试文本消息
  - 测试富文本消息
  - 测试文件消息
  - 测试图片消息
  - 测试无效消息格式
- [x] 添加边界情况测试

**状态**: ✅ 已完成（12 个测试用例通过）

**测试用例**:
```typescript
describe('LarkAdapter - extractMessageContent', () => {
  it('should extract text from text message', () => {
    const message = {
      msg_type: 'text',
      body: JSON.stringify({ text: 'Hello World' })
    };
    expect(extractMessageContent(message)).toBe('Hello World');
  });

  it('should extract text from post message', () => {
    const message = {
      msg_type: 'post',
      body: JSON.stringify({
        title: 'Title',
        content: [{ text: 'Content' }]
      })
    };
    const content = extractMessageContent(message);
    expect(content).toContain('Title');
    expect(content).toContain('Content');
  });

  it('should handle invalid JSON gracefully', () => {
    const message = {
      msg_type: 'text',
      body: 'invalid json'
    };
    expect(extractMessageContent(message)).toBe('');
  });
});
```

**文件位置**:
- `electron/services/adapters/__tests__/LarkAdapter.test.ts`

---

### 任务 3.2：编写单元测试 - 消息匹配

**优先级**: P2
**预计时间**: 2 小时
**依赖**: 任务 1.5

**任务描述**:
- [x] 测试 `messageMatchesQuery()` 方法
  - 测试关键词匹配（大小写不敏感）
  - 测试发送者过滤
  - 测试消息类型过滤
  - 测试组合过滤条件

**状态**: ✅ 已完成（8 个测试用例通过）

**测试用例**:
```typescript
describe('LarkAdapter - messageMatchesQuery', () => {
  it('should match message by keyword (case insensitive)', () => {
    const message = {
      body: JSON.stringify({ text: 'Order-12345 completed' }),
      msg_type: 'text'
    };
    const request = { query: 'order-12345' };
    expect(messageMatchesQuery(message, request)).toBe(true);
  });

  it('should filter by sender', () => {
    const message = {
      body: JSON.stringify({ text: 'test' }),
      sender: { sender_id: { user_id: 'user_123' } }
    };
    const request = {
      query: 'test',
      filters: { sender: 'user_123' }
    };
    expect(messageMatchesQuery(message, request)).toBe(true);
  });
});
```

**文件位置**:
- `electron/services/adapters/__tests__/LarkAdapter.test.ts`

---

### 任务 3.3：编写单元测试 - 消息转换

**优先级**: P2
**预计时间**: 2 小时
**依赖**: 任务 1.7

**任务描述**:
- [x] 测试 `convertLarkMessage()` 方法
  - 测试所有字段正确转换
  - 测试时间戳转换
  - 测试消息类型映射
  - 测试深度链接生成

**状态**: ✅ 已完成（6 个测试用例通过）

**测试用例**:
```typescript
describe('LarkAdapter - convertLarkMessage', () => {
  it('should convert Lark message to MessageResult', async () => {
    const larkMsg = {
      message_id: 'msg_xxx',
      msg_type: 'text',
      body: JSON.stringify({ text: 'test message' }),
      create_time: '1704067200000',
      sender: {
        sender_id: { user_id: 'user_xxx', open_id: 'open_xxx' }
      }
    };

    const result = await convertLarkMessage(larkMsg, 'chat_xxx');

    expect(result.id).toBe('msg_xxx');
    expect(result.platform).toBe('lark');
    expect(result.content).toBe('test message');
    expect(result.messageType).toBe('text');
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.deepLink).toBeDefined();
  });
});
```

**文件位置**:
- `electron/services/adapters/__tests__/LarkAdapter.test.ts`

---

### 任务 3.4：编写集成测试 - OAuth 流程

**优先级**: P2
**预计时间**: 4 小时
**依赖**: 任务 2.5

**任务描述**:
- [x] 创建集成测试文件 `LarkAdapter.integration.test.ts`
- [x] 测试完整的 OAuth 认证流程
- [x] 测试令牌刷新流程
- [x] 使用 Mock OAuth Server 或测试账户

**状态**: ✅ 已完成（9 个测试用例通过）

**文件位置**:
- `electron/services/adapters/__tests__/LarkAdapter.integration.test.ts`

---

### 任务 3.5：编写集成测试 - 搜索功能

**优先级**: P2
**预计时间**: 4 小时
**依赖**: 任务 1.8

**任务描述**:
- [x] 测试完整的搜索流程
  - 测试基本关键词搜索
  - 测试时间范围过滤
  - 测试发送者过滤
  - 测试多会话搜索
  - 测试大量消息场景
- [x] 测试错误处理
  - 网络错误
  - API 限流
  - 无权限访问
- [x] 测试性能
  - 搜索 10 个会话的耗时
  - 搜索 50 个会话的耗时

**状态**: ✅ 已完成（9 个测试用例通过）

**文件位置**:
- `electron/services/adapters/__tests__/LarkAdapter.integration.test.ts`

---

### 任务 3.6：端到端测试 - 多平台搜索

**优先级**: P2
**预计时间**: 4 小时
**依赖**: 任务 2.3, 2.4

**任务描述**:
- [x] 测试 Gmail + Slack + Lark 同时搜索
- [x] 验证结果正确合并
- [x] 验证结果排序正确
- [x] 验证平台状态正确显示
- [x] 测试单个平台失败不影响其他平台

**状态**: ✅ 已完成（11 个测试用例通过）

**测试场景**:
```typescript
// 场景 1: 三个平台都成功
const response1 = await searchService.search({
  query: 'test',
  platforms: ['gmail', 'slack', 'lark']
});
expect(response1.platformStatus['gmail'].success).toBe(true);
expect(response1.platformStatus['slack'].success).toBe(true);
expect(response1.platformStatus['lark'].success).toBe(true);

// 场景 2: Lark 失败，其他平台成功
// 模拟 Lark API 错误
const response2 = await searchService.search({...});
expect(response2.platformStatus['gmail'].success).toBe(true);
expect(response2.platformStatus['slack'].success).toBe(true);
expect(response2.platformStatus['lark'].success).toBe(false);
expect(response2.platformStatus['lark'].error).toBeDefined();
```

**文件位置**:
- `electron/services/__tests__/SearchService.e2e.test.ts`

---

### 任务 3.7：性能测试

**优先级**: P2
**预计时间**: 3 小时
**依赖**: 任务 3.5

**任务描述**:
- [x] 测试不同规模下的性能
  - 10 个会话，每个 100 条消息
  - 50 个会话，每个 500 条消息
  - 100 个会话，每个 1000 条消息
- [x] 记录各阶段耗时
  - 获取会话列表
  - 搜索单个会话
  - 总搜索时间
- [x] 验证并发控制是否有效
- [x] 验证缓存机制是否有效

**状态**: ✅ 已完成（7 个测试用例通过）

**性能指标**:
```
目标:
- 10 会话: < 5 秒
- 50 会话: < 20 秒
- 100 会话: < 60 秒
```

**文件位置**:
- `electron/services/adapters/__tests__/LarkAdapter.performance.test.ts`

---

### 任务 3.8：UI 测试 - 搜索结果显示

**优先级**: P2
**预计时间**: 2 小时
**依赖**: 任务 2.4

**任务描述**:
- [x] 测试 Lark 消息在 MessageCard 中的显示
  - 图标正确显示
  - 颜色正确应用
  - 内容正确显示
  - 时间正确格式化
- [x] 测试深度链接点击
  - 点击消息能正确跳转到飞书
  - Chrome Profile 正确加载
- [x] 测试平台过滤器
  - 能正确筛选 Lark 消息

**状态**: ✅ 已完成（21 个测试用例通过）

**文件位置**:
- `src/components/__tests__/MessageCard.test.tsx`
- `src/pages/__tests__/SearchPage.test.tsx`

---

## 📦 第四阶段：优化与完善（P3）

预计工期：1-2 天

**最新更新**: 2025-12-19
- ✅ 任务 4.1-4.7 全部完成
- ✅ 添加了可配置的搜索范围限制
- ✅ 实现了指数退避重试机制
- ✅ 完善了错误码处理
- ✅ 添加了实时搜索进度通知

### 任务 4.1：添加会话列表缓存

**优先级**: P3
**预计时间**: 2 小时
**依赖**: 任务 1.4

**任务描述**:
- [x] 实现会话列表缓存机制
  - 缓存有效期：5 分钟
  - 缓存失效后自动刷新
  - 提供手动刷新接口
- [x] 添加缓存命中日志

**状态**: ✅ 已完成（在第一阶段已实现）

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 132-145, 524-582 行)

---

### 任务 4.2：添加消息内容缓存

**优先级**: P3
**预计时间**: 2 小时
**依赖**: 任务 1.7

**任务描述**:
- [x] 实现消息内容缓存（避免重复转换）
- [x] 使用 Map 存储已转换的消息
- [x] 缓存键：`${chatId}_${messageId}`
- [x] 设置最大缓存数量（如 1000 条）

**状态**: ✅ 已完成（在第一阶段已实现）

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 134, 766-835 行)

---

### 任务 4.3：添加搜索范围限制

**优先级**: P3
**预计时间**: 2 小时
**依赖**: 任务 1.4

**任务描述**:
- [x] 添加配置选项限制搜索范围
  - `maxChatsToSearch`: 最多搜索多少个会话（默认 50）
  - `maxPagesPerChat`: 每个会话最多获取多少页消息（默认 10）
  - `recentDaysOnly`: 只搜索最近 N 天的会话（默认 30）
- [x] 在 `getAllChats()` 中应用过滤
- [x] 在 `searchInChat()` 中应用限制

**状态**: ✅ 已完成

**实现详情**:
```typescript
// src/types/platform.ts
export interface LarkSearchConfig {
  maxChatsToSearch: number;      // 默认 50
  maxPagesPerChat: number;       // 默认 10
  recentDaysOnly: number;        // 默认 30 天
  maxSearchResults: number;      // 默认 500
  enableChatFilter: boolean;     // 默认 true
  maxRetries: number;            // 默认 3
  retryBaseDelay: number;        // 默认 1000ms
}
```

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 46-54, 137-138, 163-177, 1299-1322 行)
- `src/types/platform.ts` (第 178-220 行)

---

### 任务 4.4：添加早停机制

**优先级**: P3
**预计时间**: 1 小时
**依赖**: 任务 1.8

**任务描述**:
- [x] 在 `search()` 方法中添加早停逻辑
  - 设置最大结果数（如 500 条）
  - 达到最大数量时停止搜索
  - 记录早停日志
- [x] 添加配置选项 `maxSearchResults`

**状态**: ✅ 已完成（在第一阶段已实现，现在通过配置控制）

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 999-1003 行)

---

### 任务 4.5：添加重试机制

**优先级**: P3
**预计时间**: 3 小时
**依赖**: 任务 1.8

**任务描述**:
- [x] 为 API 调用添加重试逻辑
  - 网络错误：重试 3 次
  - 429 限流错误：指数退避重试
  - 500 服务器错误：重试 2 次
- [x] 实现指数退避算法
- [x] 添加重试日志

**状态**: ✅ 已完成

**实现详情**:
- `retryWithBackoff<T>()` 方法：带指数退避的通用重试机制
- `shouldRetry()` 方法：判断错误是否应该重试
- `calculateBackoffDelay()` 方法：计算退避延迟时间
- 限流错误使用更长的延迟（2s, 4s, 8s）
- 其他错误使用标准延迟（1s, 2s, 4s）

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 1134-1169, 1187-1236 行)

---

### 任务 4.6：优化错误处理

**优先级**: P3
**预计时间**: 2 小时
**依赖**: 任务 4.5

**任务描述**:
- [x] 添加详细的错误码处理
  - `99991663`: 无权限访问会话（跳过）
  - `99991668`: 消息已被撤回（忽略）
  - `99002000`: Token 过期（刷新令牌）
  - `99991429`: 请求频率超限（重试）
  - `99991401`: 无效的 Token
  - `99991672`: 会话不存在
  - `99991671`: 用户不在会话中
- [x] 添加用户友好的错误消息
- [x] 记录详细的错误日志

**状态**: ✅ 已完成

**实现详情**:
- `LARK_ERROR_CODES` 常量：定义所有飞书 API 错误码
- `extractErrorCode()` 方法：从错误对象提取错误码
- `getErrorMessage()` 方法：获取用户友好的错误消息
- `handleApiError()` 方法：决定如何处理错误（跳过/重试/抛出）

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 25-42, 1171-1297 行)

---

### 任务 4.7：添加搜索进度通知

**优先级**: P3
**预计时间**: 3 小时
**依赖**: 任务 1.8

**任务描述**:
- [x] 在前端添加搜索进度显示
  - 显示当前搜索的会话数
  - 显示已找到的消息数
  - 显示进度百分比
- [x] 在后端添加进度回调
- [x] 使用 IPC 通信发送进度更新

**状态**: ✅ 已完成

**实现详情**:

后端:
- `LarkSearchProgress` 接口：定义进度信息结构
- `setProgressCallback()` 方法：设置进度回调
- `notifyProgress()` 方法：通过回调和 IPC 发送进度
- 搜索各阶段自动发送进度更新

前端:
- `LarkSearchProgress` 组件：实时显示搜索进度
- 浮动进度条，显示在页面右下角
- 显示当前阶段、会话进度、已找到消息数
- 搜索完成后自动隐藏

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts` (第 140-141, 179-205, 961-1065 行)
- `src/types/platform.ts` (第 199-220 行)
- `src/components/LarkSearchProgress.tsx` (新增)
- `src/pages/SearchPage.tsx` (第 7, 45, 130-133, 535-539 行)

---

## 📚 第五阶段：文档与部署（P3）

预计工期：1 天

### 任务 5.1：更新 README

**优先级**: P3
**预计时间**: 1 小时
**依赖**: 任务 3.5

**任务描述**:
- [x] 在 README.md 中添加 Lark 平台说明
- [x] 添加 Lark 配置步骤
- [x] 添加 Lark 功能特性说明
- [x] 更新功能列表（添加 Lark 支持）

**状态**: ✅ 已完成

**文件位置**:
- `README.md`

---

### 任务 5.2：更新 CLAUDE.md

**优先级**: P3
**预计时间**: 1 小时
**依赖**: 任务 5.1

**任务描述**:
- [x] 在 CLAUDE.md 中更新平台列表
- [x] 添加 Lark 适配器说明
- [x] 更新架构图（如有）
- [x] 添加 Lark 特性说明

**状态**: ✅ 已完成

**文件位置**:
- `CLAUDE.md`

---

### 任务 5.3：更新适配器 README

**优先级**: P3
**预计时间**: 1 小时
**依赖**: 任务 5.2

**任务描述**:
- [x] 在 `adapters/README.md` 中添加 LarkAdapter 章节
- [x] 参考 SlackAdapter 的文档格式
- [x] 包含以下内容：
  - 功能特性
  - 配置要求
  - 使用示例
  - API 限制说明
  - 权限要求
  - 错误处理

**状态**: ✅ 已完成

**文件位置**:
- `electron/services/adapters/README.md`

---

### 任务 5.4：编写部署指南

**优先级**: P3
**预计时间**: 2 小时
**依赖**: 任务 5.3

**任务描述**:
- [x] 创建 `LARK_DEPLOYMENT.md` 文档
- [x] 包含以下内容：
  - 飞书应用创建步骤
  - OAuth 配置步骤
  - 权限申请指南
  - OAuth Server 配置
  - 常见问题解答
  - 故障排查指南

**状态**: ✅ 已完成

**文件位置**:
- `docs/LARK_DEPLOYMENT.md`

---

### 任务 5.5：更新 API 文档

**优先级**: P3
**预计时间**: 1 小时
**依赖**: 任务 5.4

**任务描述**:
- [x] 更新 TypeScript 接口文档
- [x] 添加 JSDoc 注释
- [x] 生成 API 文档（如使用 TypeDoc）

**状态**: ✅ 已完成

**文件位置**:
- `electron/services/adapters/LarkAdapter.ts`

---

### 任务 5.6：准备发布说明

**优先级**: P3
**预计时间**: 1 小时
**依赖**: 任务 5.5

**任务描述**:
- [x] 编写 CHANGELOG 条目
- [x] 列出新增功能
- [x] 列出已知限制
- [x] 列出性能特性

**状态**: ✅ 已完成

**CHANGELOG 示例**:
```markdown
## [v1.x.0] - 2025-12-XX

### ✨ 新增功能
- 添加 Lark（飞书）平台支持
- 支持飞书消息搜索
- 支持飞书 OAuth 认证
- 支持多平台并发搜索（Gmail + Slack + Lark）

### 🔧 改进
- 优化搜索性能（添加缓存和并发控制）
- 改进错误处理和重试机制

### ⚠️ 已知限制
- Lark 搜索需要遍历所有会话，大量会话时可能较慢
- Lark 搜索不支持高级查询语法（由于 API 限制）
- 首次搜索可能需要 10-30 秒（取决于会话数量）

### 📊 性能指标
- 10 个会话: ~5 秒
- 50 个会话: ~20 秒
- 100 个会话: ~60 秒
```

**文件位置**:
- `CHANGELOG.md`

---

## 🔍 验收清单

完成所有任务后，使用以下清单验收：

### 功能验收

- [ ] **OAuth 认证**
  - [ ] 能成功跳转到飞书授权页面
  - [ ] 能完成授权并获取令牌
  - [ ] 能刷新过期的令牌
  - [ ] refresh_token 过期时提示重新授权

- [ ] **搜索功能**
  - [ ] 能搜索所有包含关键词的消息
  - [ ] 能按时间范围过滤
  - [ ] 能按发送者过滤
  - [ ] 能按消息类型过滤
  - [ ] 搜索结果按时间倒序排列
  - [ ] 支持大小写不敏感搜索

- [ ] **消息显示**
  - [ ] Lark 消息在 UI 上正确显示
  - [ ] 图标和颜色正确
  - [ ] 时间格式正确
  - [ ] 深度链接能正确跳转

- [ ] **多平台集成**
  - [ ] Gmail + Slack + Lark 能同时搜索
  - [ ] 结果正确合并
  - [ ] 单个平台失败不影响其他平台
  - [ ] 平台状态正确显示

- [ ] **错误处理**
  - [ ] 网络错误有提示
  - [ ] Token 过期自动刷新
  - [ ] API 限流自动重试
  - [ ] 无权限会话被跳过

### 性能验收

- [ ] 10 个会话搜索 < 5 秒
- [ ] 50 个会话搜索 < 20 秒
- [ ] 并发控制生效（最多 5 个并发）
- [ ] 缓存机制生效（第二次搜索更快）
- [ ] 早停机制生效（达到最大结果数停止）

### 代码质量验收

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 代码覆盖率 > 80%
- [ ] ESLint 检查通过
- [ ] TypeScript 类型检查通过
- [ ] 没有 console.error（除错误处理外）

### 文档验收

- [ ] README 已更新
- [ ] CLAUDE.md 已更新
- [ ] 适配器 README 已更新
- [ ] 部署指南已完成
- [ ] CHANGELOG 已更新
- [ ] JSDoc 注释完整

---

## 📊 项目跟踪

### 当前状态

```
阶段 1 (P0): 12/12 完成 (100%) ✅
阶段 2 (P1): 5/5 完成 (100%) ✅
阶段 3 (P2): 8/8 完成 (100%) ✅
阶段 4 (P3): 7/7 完成 (100%) ✅
阶段 5 (P3): 6/6 完成 (100%) ✅

总进度: 38/38 (100%) 🎉

测试统计:
- 单元测试: 52 个通过
- 集成测试: 18 个通过
- 端到端测试: 11 个通过
- 性能测试: 7 个通过
- UI 测试: 21 个通过
- 总计: 109 个测试全部通过 ✅
```

### 里程碑

| 里程碑 | 目标日期 | 状态 |
|-------|---------|------|
| **M1: 核心功能完成** | 第 3-5 天 | ✅ 已完成 (2025-12-18) |
| **M2: 集成完成** | 第 5-6 天 | ✅ 已完成 (2025-12-18) |
| **M3: 测试完成** | 第 7-8 天 | ✅ 已完成 (2025-12-18) |
| **M4: 优化完成** | 第 9 天 | ✅ 已完成 (2025-12-19) |
| **M5: 文档完成** | 第 10 天 | ✅ 已完成 (2025-12-19) |
| **M6: 发布就绪** | 第 10 天 | ✅ 已完成 (2025-12-19) |

---

## 🚨 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **Lark API 限流** | 高 | 中 | 添加并发控制、重试机制、限制搜索范围 |
| **搜索性能慢** | 中 | 高 | 添加缓存、早停机制、进度提示 |
| **OAuth 配置复杂** | 中 | 中 | 详细的部署文档、示例配置 |
| **多平台兼容性问题** | 高 | 低 | 充分的集成测试、错误隔离 |
| **消息格式多样** | 中 | 中 | 完善的内容提取逻辑、错误处理 |

---

## 📞 联系与支持

- **技术问题**: 查看 `docs/LARK_SEARCH_IMPLEMENTATION.md`
- **部署问题**: 查看 `docs/LARK_DEPLOYMENT.md`（完成后）
- **Bug 报告**: 提交 GitHub Issue

---

**文档版本**: 1.0
**最后更新**: 2025-12-18
**维护者**: 开发团队
