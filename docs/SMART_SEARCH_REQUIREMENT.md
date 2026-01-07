# 智能多维度搜索需求文档

## 📋 需求概述

增强 Gmail 和 Slack 平台的搜索功能，使其自动在多个维度（消息正文、发件人、收件人、主题等）进行搜索，提升用户搜索体验。

## 🎯 目标

当用户搜索关键词时（如 `alice` 或 `quarterly report`），系统应自动搜索：

### Gmail 平台
- ✅ 消息正文内容
- ✅ 发件人 (from)
- ✅ 收件人 (to)
- ✅ 抄送人 (cc)
- ✅ 邮件主题 (subject)
- ❌ 密送人 (bcc) - 不包括

### Slack 平台
- ✅ 消息内容
- ✅ 发送人 (from)
- ❌ 频道 (in:channel) - 不包括

### Lark 平台
- ❌ 暂不实施

## 💡 核心设计原则

### 1. 智能检测用户意图
- **普通关键词**：自动扩展为多维度搜索
  - 用户输入：`alice`
  - 自动扩展为：`(alice) OR from:(alice) OR to:(alice) OR cc:(alice) OR subject:(alice)`

- **高级搜索语法**：保留用户精确控制
  - 用户输入：`from:alice to:bob`
  - 不做修改，严格按用户指定的条件搜索

### 2. 检测规则

#### Gmail 高级语法关键词
```
from:, to:, cc:, bcc:, subject:, in:, is:, has:, label:, filename:, after:, before:
```

#### Slack 高级语法关键词
```
from:, in:, to:, on:, before:, after:, during:
```

### 3. 查询扩展公式

#### Gmail
```typescript
// 检测到高级语法
if (/\b(from:|to:|cc:|bcc:|subject:|in:|is:|has:|label:|filename:)/.test(userQuery)) {
  return userQuery; // 不修改
}

// 普通关键词 - 自动扩展
// 使用 Gmail 官方 { } 语法（表示 OR 关系）
return `{${userQuery} from:${userQuery} to:${userQuery} cc:${userQuery} subject:${userQuery}}`;
```

**注意**: 使用 `{ }` 语法代替 `OR` 运算符，这是 Gmail 官方推荐的语法，可以避免括号嵌套和运算符优先级问题。

#### Slack
```typescript
// 检测到高级语法
if (/\b(from:|in:|to:|on:|before:|after:|during:)/.test(userQuery)) {
  return userQuery; // 不修改
}

// 普通关键词 - 自动扩展
return `${userQuery} OR from:${userQuery}`;
```

## 📁 修改范围

### 需要修改的文件
1. `electron/services/adapters/GmailAdapter.ts`
   - 在 `performSearch` 方法中添加智能查询构建
   - 新增 `buildSmartQuery` 私有方法

2. `electron/services/adapters/SlackAdapter.ts`
   - 在 `searchSingleAccount` 方法中添加智能查询构建
   - 新增 `buildSmartQuery` 私有方法

### 无需修改的部分
- ❌ 前端 UI (src/)
- ❌ 类型定义 (src/types/search.ts)
- ❌ IPC 通信层
- ❌ SearchService

## 🧪 测试场景

### 场景 1：搜索人名/邮箱
**输入**：`alice@company.com`

**Gmail 预期查询**：
```
{alice@company.com from:alice@company.com to:alice@company.com cc:alice@company.com subject:alice@company.com}
```

**预期结果**：
- alice 发送的邮件
- 发送给 alice 的邮件
- 抄送给 alice 的邮件
- 主题包含 alice 邮箱的邮件
- 正文提到 alice 邮箱的邮件

**Slack 预期查询**：
```
alice@company.com OR from:alice@company.com
```

**预期结果**：
- alice 发送的消息
- 消息内容提到 alice 邮箱

### 场景 2：搜索主题关键词
**输入**：`quarterly report`

**Gmail 预期查询**：
```
{quarterly report from:quarterly report to:quarterly report cc:quarterly report subject:quarterly report}
```

**预期结果**：
- 正文包含 "quarterly report"
- 主题包含 "quarterly report"
- 发件人/收件人名字包含该关键词（罕见但会匹配）

### 场景 3：用户使用高级语法（精确搜索）
**输入**：`from:alice to:bob subject:"Q4 Report"`

**预期查询**：不修改，原样传递
```
from:alice to:bob subject:"Q4 Report"
```

**预期结果**：
严格匹配用户指定的条件：alice 发给 bob 且主题为 "Q4 Report" 的邮件

### 场景 4：组合高级语法和普通关键词
**输入**：`from:alice meeting`

**预期查询**：不修改（检测到 `from:` 关键词）
```
from:alice meeting
```

**预期结果**：
alice 发送的、包含 "meeting" 的邮件

## ⚠️ 注意事项

### 1. 性能考虑
- Gmail API 原生支持复杂 OR 查询，性能影响较小
- Slack API 的 `search.messages` 支持基本的 OR 运算符
- 自动扩展可能增加查询复杂度，但提升了召回率（找到更多相关结果）

### 2. 用户体验
- **优点**：用户无需记忆搜索语法，直接输入关键词即可找到所有相关消息
- **缺点**：结果可能比预期多（但这通常是好事）
- **解决方案**：保留高级语法支持，高级用户可以精确控制

### 3. 向后兼容
- 现有搜索行为保持不变（用户已经使用高级语法的情况）
- 新增的自动扩展功能不会破坏现有功能

## 📊 成功指标

1. **功能完整性**：
   - ✅ Gmail 自动扩展到 5 个维度（正文、from、to、cc、subject）
   - ✅ Slack 自动扩展到 2 个维度（正文、from）
   - ✅ 高级语法检测正确，不误修改用户精确查询

2. **测试覆盖**：
   - ✅ 单元测试：`buildSmartQuery` 方法
   - ✅ 集成测试：端到端搜索流程

3. **用户体验**：
   - ✅ 搜索结果更全面（召回率提升）
   - ✅ 保留用户精确控制能力

## 🚀 实施计划

### 阶段 1：核心功能实现
1. 修改 `GmailAdapter.ts` - 添加 `buildSmartQuery` 方法
2. 修改 `SlackAdapter.ts` - 添加 `buildSmartQuery` 方法
3. 单元测试（可选）

### 阶段 2：测试验证
1. 手动测试各种搜索场景
2. 验证高级语法不被误修改
3. 性能测试（确保查询速度可接受）

### 阶段 3：文档更新
1. 更新 README.md（可选）
2. 添加用户指南（可选）

## 📅 时间估算

- **开发时间**：15-20 分钟
  - GmailAdapter 修改：8 分钟
  - SlackAdapter 修改：7 分钟

- **测试时间**：10 分钟
  - 手动测试 3 个主要场景

- **总计**：约 30 分钟

## 📝 附录

### Gmail 搜索运算符参考
- `from:` - 发件人
- `to:` - 收件人
- `cc:` - 抄送
- `bcc:` - 密送
- `subject:` - 主题
- `in:` - 位置（收件箱、垃圾邮件等）
- `is:` - 状态（未读、已加星标等）
- `has:` - 包含（附件、视频等）
- 参考：https://support.google.com/mail/answer/7190

### Slack 搜索修饰符参考
- `from:@username` - 特定用户的消息
- `in:#channel` - 特定频道的消息
- `to:@username` - 提到特定用户
- `on:YYYY-MM-DD` - 特定日期
- `before:/after:` - 日期范围
- 参考：https://slack.com/help/articles/202528808
