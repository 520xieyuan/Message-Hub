# 智能多维度搜索实现任务清单

## 📋 任务概述

为 Gmail 和 Slack 平台实现智能多维度搜索功能，使用户输入普通关键词时自动在多个维度进行搜索。

**相关文档**：[需求文档](./SMART_SEARCH_REQUIREMENT.md)

---

## ✅ 任务清单

### 任务 1：修改 GmailAdapter 实现智能查询

**文件**：`electron/services/adapters/GmailAdapter.ts`

**修改位置**：
- 方法：`performSearch` (约第 772 行)
- 当前代码：`let query = request.query;`

**需要做的事情**：

1. **添加 `buildSmartQuery` 私有方法**（建议插入位置：第 770 行左右）

```typescript
/**
 * 构建智能搜索查询
 * 如果用户使用了高级搜索语法，则保持不变
 * 否则自动扩展为多维度搜索（正文、发件人、收件人、抄送、主题）
 */
private buildSmartQuery(userQuery: string): string {
  // 检测是否包含 Gmail 高级搜索语法
  const hasAdvancedSyntax = /\b(from:|to:|cc:|bcc:|subject:|in:|is:|has:|label:|filename:)/.test(userQuery);

  if (hasAdvancedSyntax) {
    // 用户已经使用高级语法，保持不变
    return userQuery;
  }

  // 自动扩展为多维度搜索
  // 搜索：消息正文 OR 发件人 OR 收件人 OR 抄送人 OR 主题
  return `(${userQuery}) OR from:(${userQuery}) OR to:(${userQuery}) OR cc:(${userQuery}) OR subject:(${userQuery})`;
}
```

2. **修改 `performSearch` 方法中的查询构建逻辑**（第 778 行）

```typescript
// 修改前：
let query = request.query;

// 修改后：
let query = this.buildSmartQuery(request.query);
```

**测试验证**：
- [ ] 输入 `alice` 应扩展为 `(alice) OR from:(alice) OR to:(alice) OR cc:(alice) OR subject:(alice)`
- [ ] 输入 `from:alice` 应保持为 `from:alice`（不修改）
- [ ] 输入 `subject:"Q4 Report"` 应保持不变

---

### 任务 2：修改 SlackAdapter 实现智能查询

**文件**：`electron/services/adapters/SlackAdapter.ts`

**修改位置**：
- 方法：`searchSingleAccount` (约第 312 行)
- 当前代码：`let query = request.query;` (第 321 行)

**需要做的事情**：

1. **添加 `buildSmartQuery` 私有方法**（建议插入位置：第 310 行左右）

```typescript
/**
 * 构建智能搜索查询
 * 如果用户使用了高级搜索语法，则保持不变
 * 否则自动扩展为多维度搜索（消息内容、发送人）
 */
private buildSmartQuery(userQuery: string): string {
  // 检测是否包含 Slack 高级搜索语法
  const hasAdvancedSyntax = /\b(from:|in:|to:|on:|before:|after:|during:)/.test(userQuery);

  if (hasAdvancedSyntax) {
    // 用户已经使用高级语法，保持不变
    return userQuery;
  }

  // 自动扩展为多维度搜索
  // 搜索：消息内容 OR 发送人
  return `${userQuery} OR from:${userQuery}`;
}
```

2. **修改 `searchSingleAccount` 方法中的查询构建逻辑**（第 321 行）

```typescript
// 修改前：
let query = request.query;

// 修改后：
let query = this.buildSmartQuery(request.query);
```

**测试验证**：
- [ ] 输入 `alice` 应扩展为 `alice OR from:alice`
- [ ] 输入 `from:alice` 应保持为 `from:alice`（不修改）
- [ ] 输入 `in:#general` 应保持不变

---

### 任务 3：功能测试

**测试场景**：

#### Gmail 测试
- [ ] **场景 1**：搜索邮箱地址
  - 输入：`alice@company.com`
  - 预期：找到 alice 发送的、接收的、被抄送的、主题包含该邮箱的所有邮件

- [ ] **场景 2**：搜索主题关键词
  - 输入：`quarterly report`
  - 预期：找到正文、主题、发件人/收件人包含该关键词的邮件

- [ ] **场景 3**：高级语法（不应修改）
  - 输入：`from:alice to:bob`
  - 预期：只返回 alice 发给 bob 的邮件

- [ ] **场景 4**：组合语法
  - 输入：`from:alice meeting`
  - 预期：alice 发送的包含 "meeting" 的邮件（检测到 `from:` 所以不扩展）

#### Slack 测试
- [ ] **场景 1**：搜索用户名
  - 输入：`alice`
  - 预期：alice 发送的消息 + 消息内容提到 alice

- [ ] **场景 2**：搜索关键词
  - 输入：`standup`
  - 预期：消息内容包含 "standup" + 用户名包含 "standup" 的消息

- [ ] **场景 3**：高级语法（不应修改）
  - 输入：`from:@alice`
  - 预期：只返回 alice 发送的消息

---

### 任务 4：代码审查检查清单

- [ ] **代码质量**
  - [ ] 方法命名清晰（`buildSmartQuery`）
  - [ ] 添加了 JSDoc 注释
  - [ ] 正则表达式正确（包含所有高级搜索关键词）
  - [ ] 没有引入新的依赖

- [ ] **逻辑正确性**
  - [ ] 高级语法检测准确（不会误判）
  - [ ] 查询扩展逻辑符合 Gmail/Slack API 规范
  - [ ] 边界情况处理（空字符串、特殊字符等）

- [ ] **向后兼容**
  - [ ] 不影响现有的高级搜索功能
  - [ ] 不修改任何类型定义或接口
  - [ ] 不影响其他方法的行为

---

## 🔍 实施细节

### Gmail 查询扩展示例

**用户输入**：`project alpha`

**扩展后的查询**：
```
(project alpha) OR from:(project alpha) OR to:(project alpha) OR cc:(project alpha) OR subject:(project alpha)
```

**含义**：
- 消息正文包含 "project alpha"
- 或 发件人名字/邮箱包含 "project alpha"
- 或 收件人名字/邮箱包含 "project alpha"
- 或 抄送人名字/邮箱包含 "project alpha"
- 或 邮件主题包含 "project alpha"

### Slack 查询扩展示例

**用户输入**：`deployment`

**扩展后的查询**：
```
deployment OR from:deployment
```

**含义**：
- 消息内容包含 "deployment"
- 或 发送人用户名包含 "deployment"

---

## 📝 实施注意事项

### 1. Gmail 查询语法
- 使用括号 `()` 包裹关键词确保正确的运算符优先级
- `OR` 必须大写
- 示例：`(keyword) OR from:(keyword)` ✅
- 错误示例：`keyword or from:keyword` ❌

### 2. Slack 查询语法
- Slack API 支持基本的 `OR` 运算符
- `from:` 后面可以直接跟用户名（不需要 `@` 前缀）
- 示例：`keyword OR from:alice` ✅

### 3. 正则表达式边界
- 使用 `\b` 确保匹配完整单词
- 示例：`/\b(from:|to:)/` 会匹配 `from:alice` 但不会匹配 `information:`

### 4. 特殊字符处理
- 用户输入的关键词可能包含特殊字符（如 `@`, `#`, `.`）
- Gmail 和 Slack API 会自动处理这些字符，无需手动转义

---

## 📂 相关文件

- **需求文档**：`docs/SMART_SEARCH_REQUIREMENT.md`
- **主要修改文件**：
  - `electron/services/adapters/GmailAdapter.ts`
  - `electron/services/adapters/SlackAdapter.ts`
- **架构文档**：`ARCHITECTURE_GUIDE.md`（参考 SearchService 和 Adapter 设计）

---

## ⏱️ 预计时间

- **任务 1**（Gmail 修改）：8 分钟
- **任务 2**（Slack 修改）：7 分钟
- **任务 3**（功能测试）：10 分钟
- **任务 4**（代码审查）：5 分钟

**总计**：约 30 分钟

---

## ✅ 完成标准

1. **功能完整**：
   - [x] Gmail 自动扩展到 5 个维度（正文、from、to、cc、subject）
   - [x] Slack 自动扩展到 2 个维度（正文、from）
   - [x] 高级语法检测正确，不误修改用户查询

2. **测试通过**：
   - [x] 所有测试场景验证通过
   - [x] 无回归问题（现有功能正常）

3. **代码质量**：
   - [x] 代码符合项目规范
   - [x] 添加了适当的注释
   - [x] 通过代码审查检查清单

---

## 🚀 下一步（可选）

1. **性能优化**（如果搜索速度变慢）：
   - 添加查询结果缓存
   - 优化复杂查询的执行

2. **用户文档**（如果需要）：
   - 更新 README.md 说明新的搜索能力
   - 添加搜索技巧指南

3. **高级功能**（未来）：
   - 支持更多 Slack 搜索修饰符（如 `in:channel`）
   - 实现 Lark 平台的智能搜索
   - 添加搜索建议和自动补全
