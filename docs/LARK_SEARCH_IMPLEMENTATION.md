# Lark (飞书) 消息搜索实现方案

## 文档概述

本文档详细描述了如何在 Lark（飞书）平台上实现消息搜索功能。由于飞书官方 API 不提供直接的消息搜索接口，我们采用"获取消息列表 + 本地过滤"的方案。

**创建日期**: 2025-12-18
**目标**: 获取所有包含搜索关键词的飞书消息

---

## 目录

1. [背景与挑战](#背景与挑战)
2. [核心实现思路](#核心实现思路)
3. [API 对比分析](#api-对比分析)
4. [完整实现方案](#完整实现方案)
5. [性能优化策略](#性能优化策略)
6. [API 文档参考](#api-文档参考)

---

## 背景与挑战

### 问题描述

飞书官方 API **不提供专门的消息搜索接口**（类似 Gmail 的 `q` 参数或 Slack 的 `search.messages` API），因此无法直接通过 API 搜索消息内容。

### 现有 API 能力

飞书提供以下相关 API：

1. **获取会话列表** (`im/v1/chat/list`)
   - 获取用户参与的所有会话（群组、单聊）
   - 支持分页（`page_token`）

2. **获取会话历史消息** (`im/v1/message/list`)
   - 获取指定会话的历史消息
   - 支持时间过滤（`start_time`, `end_time`）
   - 支持分页（`page_token`）

### 解决方案

采用**两阶段搜索策略**：
1. 获取所有会话列表
2. 遍历会话获取消息，在本地进行关键词匹配

---

## 核心实现思路

```
┌─────────────────────────────────────────────────────────┐
│  用户输入搜索关键词: "order-12345"                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  步骤 1: 获取所有会话列表                                 │
│  API: GET /im/v1/chats                                   │
│  ├─ 使用 page_token 循环获取                             │
│  └─ 结果: [会话1, 会话2, ..., 会话N]                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  步骤 2: 并发搜索每个会话                                 │
│  API: GET /im/v1/messages                                │
│  ├─ 会话1: 循环获取所有消息页 → 本地过滤 → 找到 2 条    │
│  ├─ 会话2: 循环获取所有消息页 → 本地过滤 → 找到 5 条    │
│  └─ 会话N: 循环获取所有消息页 → 本地过滤 → 找到 1 条    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  步骤 3: 合并、排序、返回结果                             │
│  ├─ 合并所有会话的搜索结果                               │
│  ├─ 按时间倒序排序                                       │
│  └─ 返回: 47 条匹配的消息                                │
└─────────────────────────────────────────────────────────┘
```

---

## API 对比分析

### 分页机制对比

| 平台 | 分页方式 | 示例 | 特点 |
|------|---------|------|------|
| **Slack** | 传统页码 | `page: 2, count: 50` | ✅ 可直接跳转到任意页 |
| **Gmail** | 混合模式 | `maxResults: 500` | ⚠️ 获取大量数据后本地切片 |
| **Lark** | Token 分页 | `page_token: "xxx"` | ❌ 必须从第一页开始逐页获取 |

### 时间范围过滤

| 平台 | 参数格式 | 示例 |
|------|---------|------|
| **Gmail** | 查询语法 | `after:2025/01/01 before:2025/12/31` |
| **Slack** | Unix 时间戳（秒） | `after:1704067200 before:1735689599` |
| **Lark** | Unix 时间戳（毫秒） | `start_time:"1704067200000" end_time:"1735689599999"` |

### 搜索能力对比

| 平台 | 原生搜索 API | 本地过滤 | 性能 |
|------|-------------|---------|------|
| **Gmail** | ✅ `q` 参数 | ❌ 不需要 | ⭐⭐⭐ 快速 |
| **Slack** | ✅ `search.messages` | ❌ 不需要 | ⭐⭐⭐ 快速 |
| **Lark** | ❌ 不支持 | ✅ 必需 | ⭐⭐ 较慢（需多次请求） |

---

## 完整实现方案

### 主搜索方法

```typescript
/**
 * 搜索飞书消息（获取所有匹配的消息）
 * @param request 搜索请求参数
 * @returns 所有匹配的消息列表
 */
async search(request: SearchRequest): Promise<MessageResult[]> {
  const allResults: MessageResult[] = [];

  console.log(`🔍 [LarkAdapter] Starting search for: "${request.query}"`);

  // ========== 步骤 1: 获取所有会话列表 ==========
  const chats = await this.getAllChats();
  console.log(`📋 [LarkAdapter] Found ${chats.length} chats to search`);

  // ========== 步骤 2: 并发搜索每个会话 ==========
  const MAX_CONCURRENT = 5; // 限制并发数，避免 API 限流
  const chatBatches = this.chunkArray(chats, MAX_CONCURRENT);

  for (const batch of chatBatches) {
    const searchPromises = batch.map(chat =>
      this.searchInChat(chat.chat_id, request)
        .catch(error => {
          console.error(`❌ Failed to search in chat ${chat.chat_id}:`, error);
          return []; // 单个会话失败不影响整体搜索
        })
    );

    const batchResults = await Promise.all(searchPromises);
    allResults.push(...batchResults.flat());
  }

  // ========== 步骤 3: 排序并返回 ==========
  // 按时间倒序排序
  allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  console.log(`🎉 [LarkAdapter] Total found: ${allResults.length} messages`);

  return allResults;
}
```

### 辅助方法 1: 获取所有会话

```typescript
/**
 * 获取用户的所有会话列表（使用 page_token 循环）
 * @returns 所有会话列表
 */
private async getAllChats(): Promise<LarkChat[]> {
  const allChats: LarkChat[] = [];
  let pageToken = '';
  let pageCount = 0;

  do {
    pageCount++;
    console.log(`📄 [LarkAdapter] Fetching chats page ${pageCount}...`);

    const response = await larkClient.im.v1.chat.list({
      page_size: 100,  // 每页最多 100 个会话
      page_token: pageToken
    });

    if (response.items && response.items.length > 0) {
      allChats.push(...response.items);
    }

    // 检查是否还有更多数据
    if (!response.has_more) {
      break;
    }

    pageToken = response.page_token;
  } while (pageToken);

  console.log(`✅ [LarkAdapter] Retrieved ${allChats.length} chats in ${pageCount} pages`);

  return allChats;
}
```

### 辅助方法 2: 在单个会话中搜索

```typescript
/**
 * 在指定会话中搜索消息
 * @param chatId 会话 ID
 * @param request 搜索请求
 * @returns 该会话中匹配的消息列表
 */
private async searchInChat(
  chatId: string,
  request: SearchRequest
): Promise<MessageResult[]> {
  const matchedMessages: MessageResult[] = [];
  let pageToken = '';
  let pageCount = 0;

  // 转换时间参数（毫秒时间戳）
  const startTime = request.filters?.dateRange?.start
    ? request.filters.dateRange.start.getTime().toString()
    : undefined;

  const endTime = request.filters?.dateRange?.end
    ? request.filters.dateRange.end.getTime().toString()
    : undefined;

  // 循环获取该会话的所有消息页
  do {
    pageCount++;

    const response = await larkClient.im.v1.message.list({
      container_id: chatId,
      container_id_type: 'chat',
      start_time: startTime,  // 可选：起始时间
      end_time: endTime,      // 可选：结束时间
      page_size: 50,          // 每页 50 条消息
      page_token: pageToken
    });

    // 本地过滤匹配的消息
    for (const message of response.items) {
      if (this.messageMatchesQuery(message, request)) {
        const converted = await this.convertLarkMessage(message, chatId);
        matchedMessages.push(converted);
      }
    }

    // 检查是否还有更多消息
    if (!response.has_more) {
      break;
    }

    pageToken = response.page_token;
  } while (pageToken);

  if (matchedMessages.length > 0) {
    console.log(`  ✅ Chat ${chatId}: found ${matchedMessages.length} messages (searched ${pageCount} pages)`);
  }

  return matchedMessages;
}
```

### 辅助方法 3: 消息匹配逻辑

```typescript
/**
 * 检查消息是否匹配搜索条件
 * @param message 飞书消息对象
 * @param request 搜索请求
 * @returns true 表示匹配
 */
private messageMatchesQuery(
  message: LarkMessage,
  request: SearchRequest
): boolean {
  // 1. 关键词匹配（大小写不敏感）
  const content = this.extractMessageContent(message);
  const queryLower = request.query.toLowerCase();

  if (!content.toLowerCase().includes(queryLower)) {
    return false;
  }

  // 2. 发送者过滤（如果指定）
  if (request.filters?.sender) {
    const sender = request.filters.sender.toLowerCase();
    const senderId = message.sender?.sender_id?.user_id || '';
    const senderName = message.sender?.sender_id?.open_id || '';

    const senderMatch =
      senderId.toLowerCase().includes(sender) ||
      senderName.toLowerCase().includes(sender);

    if (!senderMatch) {
      return false;
    }
  }

  // 3. 消息类型过滤（如果指定）
  if (request.filters?.messageType && request.filters.messageType !== 'all') {
    const typeMap: Record<string, string[]> = {
      'text': ['text', 'post'],
      'file': ['file', 'media', 'audio', 'video'],
      'image': ['image']
    };

    const allowedTypes = typeMap[request.filters.messageType] || [];
    if (!allowedTypes.includes(message.msg_type)) {
      return false;
    }
  }

  return true;
}
```

### 辅助方法 4: 提取消息内容

```typescript
/**
 * 从飞书消息对象中提取可搜索的文本内容
 * @param message 飞书消息对象
 * @returns 消息文本内容
 */
private extractMessageContent(message: LarkMessage): string {
  try {
    // 解析消息体
    const body = typeof message.body === 'string'
      ? JSON.parse(message.body)
      : message.body;

    // 根据消息类型提取文本
    switch (message.msg_type) {
      case 'text':
        // 纯文本消息
        return body.text || '';

      case 'post':
        // 富文本消息（包含标题、内容等）
        const postContent: string[] = [];
        if (body.title) postContent.push(body.title);
        if (body.content) {
          // 递归提取富文本中的所有文本
          const extractText = (obj: any): string => {
            if (typeof obj === 'string') return obj;
            if (Array.isArray(obj)) return obj.map(extractText).join(' ');
            if (obj && typeof obj === 'object') {
              if (obj.text) return obj.text;
              return Object.values(obj).map(extractText).join(' ');
            }
            return '';
          };
          postContent.push(extractText(body.content));
        }
        return postContent.join(' ');

      case 'image':
        // 图片消息（返回图片 key 用于搜索）
        return body.image_key || '';

      case 'file':
        // 文件消息（返回文件名）
        return body.file_name || '';

      case 'audio':
      case 'video':
      case 'media':
        // 媒体消息（返回文件名或标题）
        return body.file_name || body.title || '';

      default:
        // 其他类型：返回 JSON 字符串供搜索
        return JSON.stringify(body);
    }
  } catch (error) {
    console.error('Failed to extract message content:', error);
    return '';
  }
}
```

### 辅助方法 5: 消息格式转换

```typescript
/**
 * 将飞书消息转换为统一的 MessageResult 格式
 * @param message 飞书消息对象
 * @param chatId 会话 ID
 * @returns 统一格式的消息对象
 */
private async convertLarkMessage(
  message: LarkMessage,
  chatId: string
): Promise<MessageResult> {
  // 提取发送者信息
  const sender: MessageSender = {
    name: message.sender?.sender_id?.open_id || 'Unknown',
    userId: message.sender?.sender_id?.user_id || '',
    avatar: undefined, // 可通过额外 API 获取头像
  };

  // 提取消息内容
  const content = this.extractMessageContent(message);

  // 生成摘要（最多 200 字符）
  const snippet = content.length > 200
    ? content.substring(0, 200) + '...'
    : content;

  // 消息时间（毫秒时间戳转 Date）
  const timestamp = new Date(parseInt(message.create_time));

  // 生成深度链接
  const deepLink = this.getDeepLink(message.message_id, {
    chat_id: chatId
  });

  return {
    id: message.message_id,
    platform: 'lark',
    sender,
    content,
    snippet,
    timestamp,
    deepLink,
    messageType: this.mapLarkMessageType(message.msg_type),
    channel: chatId,
    metadata: {
      msg_type: message.msg_type,
      chat_id: chatId,
      parent_id: message.parent_id,
      root_id: message.root_id,
    }
  };
}

/**
 * 映射飞书消息类型到统一类型
 */
private mapLarkMessageType(larkType: string): 'text' | 'file' | 'image' | 'other' {
  switch (larkType) {
    case 'text':
    case 'post':
      return 'text';
    case 'image':
      return 'image';
    case 'file':
    case 'audio':
    case 'video':
    case 'media':
      return 'file';
    default:
      return 'other';
  }
}
```

### 工具方法: 数组分块

```typescript
/**
 * 将数组分成指定大小的块
 * @param array 原数组
 * @param size 每块大小
 * @returns 分块后的二维数组
 */
private chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

---

## 性能优化策略

### 优化 1: 并发控制

```typescript
// 不要一次性搜索所有会话，使用批量并发
const MAX_CONCURRENT = 5;  // 同时最多搜索 5 个会话

const chatBatches = this.chunkArray(chats, MAX_CONCURRENT);
for (const batch of chatBatches) {
  const results = await Promise.all(
    batch.map(chat => this.searchInChat(chat.chat_id, request))
  );
  // 处理结果...
}
```

**原因**：
- ✅ 避免同时发起过多请求导致 API 限流
- ✅ 降低内存占用
- ✅ 提高成功率

### 优化 2: 限制搜索范围

```typescript
// 只搜索最近活跃的会话
const allChats = await this.getAllChats();

const recentChats = allChats
  .filter(chat => {
    const lastMsgTime = parseInt(chat.last_message?.create_time || '0');
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return lastMsgTime > thirtyDaysAgo;
  })
  .slice(0, 50);  // 最多搜索 50 个会话

console.log(`Filtered ${allChats.length} → ${recentChats.length} active chats`);
```

**原因**：
- ✅ 减少不必要的 API 调用
- ✅ 提高搜索速度
- ✅ 符合用户习惯（通常搜索近期消息）

### 优化 3: 早停机制

```typescript
// 如果已经找到足够多的结果，提前停止搜索
const MAX_RESULTS = 500;

for (const chat of chats) {
  if (allResults.length >= MAX_RESULTS) {
    console.log(`Reached max results (${MAX_RESULTS}), stopping search`);
    break;
  }

  const chatResults = await this.searchInChat(chat.chat_id, request);
  allResults.push(...chatResults);
}
```

**原因**：
- ✅ 避免无限搜索
- ✅ 提升响应速度
- ✅ 节省 API 配额

### 优化 4: 缓存会话列表

```typescript
private chatListCache: {
  data: LarkChat[];
  timestamp: number;
} | null = null;

private readonly CHAT_LIST_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

async getAllChats(): Promise<LarkChat[]> {
  const now = Date.now();

  // 检查缓存是否有效
  if (this.chatListCache &&
      (now - this.chatListCache.timestamp) < this.CHAT_LIST_CACHE_TTL) {
    console.log('Using cached chat list');
    return this.chatListCache.data;
  }

  // 获取新数据
  const chats = await this.fetchAllChatsFromAPI();

  // 更新缓存
  this.chatListCache = {
    data: chats,
    timestamp: now
  };

  return chats;
}
```

**原因**：
- ✅ 减少重复请求
- ✅ 提高响应速度
- ✅ 降低 API 压力

### 优化 5: 消息内容缓存

```typescript
// 对于已经获取过的消息，不重复处理
private messageCache = new Map<string, MessageResult>();

private async convertLarkMessage(
  message: LarkMessage,
  chatId: string
): Promise<MessageResult> {
  const cacheKey = `${chatId}_${message.message_id}`;

  if (this.messageCache.has(cacheKey)) {
    return this.messageCache.get(cacheKey)!;
  }

  const result = {
    // ... 转换逻辑
  };

  this.messageCache.set(cacheKey, result);
  return result;
}
```

---

## 时间参数处理

### 默认行为

```typescript
// 如果用户不指定时间范围，搜索所有历史消息
const startTime = request.filters?.dateRange?.start
  ? request.filters.dateRange.start.getTime().toString()
  : undefined;  // ✅ undefined = 不限制起始时间

const endTime = request.filters?.dateRange?.end
  ? request.filters.dateRange.end.getTime().toString()
  : undefined;  // ✅ undefined = 不限制结束时间
```

### 时间格式转换

```typescript
// Date → 毫秒时间戳字符串
const date = new Date('2025-01-01');
const timestamp = date.getTime().toString();  // "1704067200000"
```

---

## 分页处理说明

### 飞书的 Token 分页机制

```typescript
// 第一次请求
const response1 = await larkClient.im.v1.message.list({
  page_size: 50,
  page_token: ''  // 空字符串表示第一页
});

// 响应
{
  has_more: true,
  page_token: "token_for_page_2",
  items: [消息1, 消息2, ..., 消息50]
}

// 第二次请求
const response2 = await larkClient.im.v1.message.list({
  page_size: 50,
  page_token: "token_for_page_2"  // 使用上次返回的 token
});

// 响应
{
  has_more: false,  // 没有更多数据
  page_token: "",
  items: [消息51, 消息52, ..., 消息73]
}
```

### 与前端分页的协调

由于飞书 API 不支持直接跳页，我们需要：

1. **后端**：获取所有匹配的消息
2. **前端**：使用本地分页显示

```typescript
// 前端显示逻辑
const displayMessages = (allMessages: MessageResult[], page: number, limit: number) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  return allMessages.slice(startIndex, endIndex);
};
```

---

## API 文档参考

### 官方文档链接

1. **获取会话列表**
   - URL: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/chat/list
   - 方法: GET
   - 端点: `/open-apis/im/v1/chats`

2. **获取会话历史消息**
   - URL: https://open.feishu.cn/document/server-docs/im-v1/message/list
   - 方法: GET
   - 端点: `/open-apis/im/v1/messages`

3. **消息类型说明**
   - URL: https://open.feishu.cn/document/server-docs/im-v1/message-content-description/message_content
   - 支持类型: text, post, image, file, audio, video, 等

### 权限要求

应用需要申请以下权限：

| 权限 Scope | 说明 | 必需程度 |
|-----------|------|---------|
| `im:chat:readonly` | 获取会话列表 | ✅ 必需 |
| `im:message:readonly` | 读取消息内容 | ✅ 必需 |
| `contact:user.base:readonly` | 读取用户基本信息 | ⚠️ 可选（用于获取用户名） |

### API 限流

- **会话列表**: Tier 2（每分钟约 50 次请求）
- **消息列表**: Tier 2（每分钟约 50 次请求）

**建议**：
- 使用批量并发控制（`MAX_CONCURRENT = 5`）
- 添加重试机制（遇到 429 错误时指数退避）

---

## 错误处理

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|-------|------|---------|
| `99991663` | 应用无权限访问该会话 | 跳过该会话，继续搜索其他会话 |
| `99991668` | 消息已被撤回 | 忽略该消息 |
| `99002000` | Token 过期 | 重新获取 access_token |
| `99991429` | 请求频率超限 | 指数退避重试 |

### 错误处理示例

```typescript
private async searchInChat(chatId: string, request: SearchRequest): Promise<MessageResult[]> {
  try {
    // 搜索逻辑...
  } catch (error: any) {
    const errorCode = error.code || error.error?.code;

    switch (errorCode) {
      case 99991663:
        console.warn(`No permission to access chat ${chatId}, skipping`);
        return [];

      case 99991429:
        console.warn('Rate limit exceeded, retrying after delay...');
        await this.sleep(2000);
        return this.searchInChat(chatId, request); // 重试

      default:
        console.error(`Failed to search in chat ${chatId}:`, error);
        throw error;
    }
  }
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 与现有适配器的对比

| 特性 | Gmail | Slack | Lark |
|------|-------|-------|------|
| **搜索方式** | 原生 API | 原生 API | 本地过滤 |
| **API 调用次数** | 1 次 | 1 次 | N×M 次（N=会话数, M=平均消息页数） |
| **时间复杂度** | O(1) | O(1) | O(N×M) |
| **实现复杂度** | 简单 | 简单 | 复杂 |
| **性能** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

### 关键差异

1. **Gmail/Slack**: 服务器端搜索，一次请求返回结果
2. **Lark**: 客户端搜索，需要多次请求 + 本地过滤

---

## 实施检查清单

实施 Lark 搜索功能前，请确认以下事项：

- [ ] 已创建飞书企业应用
- [ ] 已申请必需的 API 权限（`im:chat:readonly`, `im:message:readonly`）
- [ ] 已实现 OAuth 认证流程
- [ ] 已安装飞书 Node.js SDK（`@larksuiteoapi/node-sdk`）
- [ ] 已实现并发控制逻辑
- [ ] 已实现错误处理和重试机制
- [ ] 已添加会话列表缓存
- [ ] 已测试大量会话场景（>100 个会话）
- [ ] 已测试大量消息场景（>10000 条消息）
- [ ] 已测试 API 限流场景

---

## 预期性能指标

基于典型使用场景的性能预估：

| 场景 | 会话数 | 平均每会话消息页数 | API 调用次数 | 预计耗时 |
|------|-------|------------------|-------------|---------|
| **轻量级** | 10 | 2 | ~20 | 2-5 秒 |
| **中等** | 50 | 5 | ~250 | 15-30 秒 |
| **重度** | 100 | 10 | ~1000 | 1-2 分钟 |

**优化后**（限制搜索范围）：

| 场景 | 会话数限制 | 消息页数限制 | API 调用次数 | 预计耗时 |
|------|-----------|-------------|-------------|---------|
| **优化后** | 50 | 3 | ~150 | 10-20 秒 |

---

## 后续优化方向

1. **本地数据库缓存**
   - 将搜索过的消息存储到本地 SQLite
   - 下次搜索时优先查询本地缓存
   - 只获取增量消息

2. **增量同步**
   - 使用飞书的 Event API 订阅消息事件
   - 实时更新本地缓存
   - 搜索时直接查询本地数据

3. **全文索引**
   - 使用 FTS5（SQLite 全文搜索）
   - 支持更复杂的搜索语法
   - 大幅提升搜索速度

4. **后台预加载**
   - 应用启动时后台预加载会话列表
   - 减少首次搜索的等待时间

---

## 总结

### 核心要点

1. ✅ 飞书不提供原生搜索 API，需要"获取 + 过滤"
2. ✅ 使用 Token 分页机制逐页获取消息
3. ✅ 支持时间范围过滤（`start_time`, `end_time`）
4. ✅ 并发搜索多个会话提高效率
5. ⚠️ 性能受会话数和消息量影响，需要优化策略

### 最佳实践

- 限制搜索范围（最近活跃的会话）
- 控制并发数（避免 API 限流）
- 添加缓存机制（会话列表、消息内容）
- 实现早停策略（达到足够结果即停止）
- 完善错误处理（跳过无权限会话、重试失败请求）

---

**文档版本**: 1.0
**最后更新**: 2025-12-18
**维护者**: Claude Code
**相关文档**:
- [CLAUDE.md](../CLAUDE.md) - 项目总览
- [ARCHITECTURE_GUIDE.md](../ARCHITECTURE_GUIDE.md) - 架构设计
- [adapters/README.md](../electron/services/adapters/README.md) - 适配器说明
