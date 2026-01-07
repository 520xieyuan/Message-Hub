# 智能多维度搜索测试指南

## 🧪 如何测试修复

### 问题回顾
**原始问题**: 搜索 `hudetz.christine@googlemail.com` 只返回她作为发件人的邮件，没有返回收件人是她的邮件。

**修复内容**: 将 Gmail 查询格式从 `OR` 语法改为官方推荐的 `{ }` 语法。

---

## 📝 测试步骤

### 1. 重新编译应用

```bash
npm run build:electron
npm run build:vite
```

### 2. 启动应用

```bash
npm run dev
```

### 3. Gmail 搜索测试

#### 测试场景 1：搜索邮箱地址（收件人测试）

**操作**：
1. 在搜索框输入：`hudetz.christine@googlemail.com`
2. 点击搜索

**预期结果**：
- ✅ 显示 `hudetz.christine@googlemail.com` **发送的**邮件
- ✅ 显示**发送给** `hudetz.christine@googlemail.com` 的邮件
- ✅ 显示**抄送给** `hudetz.christine@googlemail.com` 的邮件
- ✅ 显示主题包含该邮箱的邮件
- ✅ 显示正文提到该邮箱的邮件

**如何验证**：
- 查看搜索结果中的"收件人"字段
- 应该能看到一些邮件的收件人是 `hudetz.christine@googlemail.com`
- 不应该只有发件人是她的邮件

#### 测试场景 2：搜索人名

**操作**：
1. 在搜索框输入：`alice`
2. 点击搜索

**预期结果**：
- ✅ 发件人名字包含 "alice" 的邮件
- ✅ 收件人名字包含 "alice" 的邮件
- ✅ 正文提到 "alice" 的邮件
- ✅ 主题包含 "alice" 的邮件

#### 测试场景 3：高级语法（确保不被修改）

**操作**：
1. 在搜索框输入：`from:hudetz.christine@googlemail.com`
2. 点击搜索

**预期结果**：
- ✅ **只显示** `hudetz.christine@googlemail.com` 发送的邮件
- ❌ **不应该**显示发送给她的邮件（因为用户明确指定了 `from:`）

**如何验证**：
- 所有结果的发件人都应该是 `hudetz.christine@googlemail.com`
- 不应该有其他人发送的邮件

#### 测试场景 4：查看调试日志

**操作**：
1. 打开开发者工具（F12 或 Ctrl+Shift+I）
2. 切换到 Console 标签
3. 搜索 `hudetz.christine@googlemail.com`
4. 查找日志：`🔍 [GmailAdapter] Executing search with query:`

**预期日志**：
```
🔍 [GmailAdapter] Executing search with query: {hudetz.christine@googlemail.com from:hudetz.christine@googlemail.com to:hudetz.christine@googlemail.com cc:hudetz.christine@googlemail.com subject:hudetz.christine@googlemail.com}
```

**验证要点**：
- ✅ 查询使用了 `{ }` 语法
- ✅ 包含了 `to:` 条件
- ✅ 没有使用 `OR` 运算符

---

### 4. Slack 搜索测试

#### 测试场景 1：搜索用户名

**操作**：
1. 在搜索框输入：`alice`
2. 选择 Slack 平台
3. 点击搜索

**预期结果**：
- ✅ alice 发送的消息
- ✅ 消息内容提到 alice 的消息

#### 测试场景 2：高级语法

**操作**：
1. 在搜索框输入：`from:@alice`
2. 点击搜索

**预期结果**：
- ✅ 只显示 alice 发送的消息
- ❌ 不显示只是提到 alice 的消息

---

## 🔍 调试技巧

### 查看生成的查询

如果搜索结果不符合预期，可以：

1. **打开开发者工具**
2. **查看 Console 日志**，找到：
   ```
   🔍 [GmailAdapter] Executing search with query: ...
   ```
3. **复制查询字符串**
4. **在 Gmail 网页版测试**：
   - 打开 https://mail.google.com
   - 在搜索框粘贴查询字符串
   - 验证是否返回预期结果

### Gmail 网页版对比测试

**测试查询**：
```
{hudetz.christine@googlemail.com from:hudetz.christine@googlemail.com to:hudetz.christine@googlemail.com cc:hudetz.christine@googlemail.com subject:hudetz.christine@googlemail.com}
```

**操作**：
1. 复制上面的查询
2. 打开 Gmail 网页版
3. 粘贴到搜索框
4. 按回车搜索

**预期**：
- 应该返回所有与该邮箱相关的邮件（发件人、收件人、抄送等）

---

## ✅ 验收标准

### Gmail 搜索

- [x] 搜索邮箱地址时，能找到收件人是该邮箱的邮件
- [x] 搜索邮箱地址时，能找到发件人是该邮箱的邮件
- [x] 搜索邮箱地址时，能找到抄送人是该邮箱的邮件
- [x] 高级语法（如 `from:`）不被自动扩展
- [x] 日志显示使用了 `{ }` 语法

### Slack 搜索

- [x] 搜索用户名时，能找到该用户发送的消息
- [x] 搜索用户名时，能找到提到该用户的消息
- [x] 高级语法（如 `from:`）不被自动扩展

### 整体验证

- [x] 编译无错误
- [x] 应用可正常启动
- [x] 搜索功能正常工作
- [x] 没有引入新的 bug

---

## 🐛 常见问题排查

### 问题 1：仍然只返回发件人的邮件

**可能原因**：
- 代码没有重新编译
- 应用没有重启

**解决方案**：
```bash
npm run build:electron
# 重启应用
```

### 问题 2：搜索没有任何结果

**可能原因**：
- Gmail API 认证失败
- 查询语法错误

**解决方案**：
1. 检查控制台日志是否有错误
2. 验证 OAuth token 是否有效
3. 在 Gmail 网页版测试相同的查询

### 问题 3：高级语法被误修改

**示例**：输入 `from:alice` 但被扩展为 `{from:alice ...}`

**可能原因**：
- 正则表达式检测有问题

**验证方法**：
1. 查看控制台日志中的查询字符串
2. 应该显示 `from:alice`（未修改）
3. 不应该包含 `{ }`

---

## 📊 性能测试（可选）

### 测试查询速度

1. **普通关键词搜索**：
   - 输入：`meeting`
   - 记录搜索时间

2. **邮箱地址搜索**：
   - 输入：`someone@example.com`
   - 记录搜索时间

3. **对比**：
   - 两者速度应该相近
   - 如果邮箱搜索明显变慢，可能需要优化

**预期**：
- 搜索时间应在 2-5 秒内（取决于邮箱大小）
- 使用 `{ }` 语法不应该比 `OR` 语法慢

---

## 📝 测试报告模板

测试完成后，可以填写以下报告：

```
## 测试报告

**测试日期**: 2025-12-12
**测试环境**: Windows 10 / macOS / Linux
**应用版本**: 1.0.0

### Gmail 搜索测试

- [ ] ✅ 搜索 hudetz.christine@googlemail.com：能找到收件人是她的邮件
- [ ] ✅ 搜索 hudetz.christine@googlemail.com：能找到发件人是她的邮件
- [ ] ✅ 搜索 alice：多维度搜索正常
- [ ] ✅ 搜索 from:alice：高级语法不被修改
- [ ] ✅ 日志显示正确的查询格式

### Slack 搜索测试

- [ ] ✅ 搜索用户名：能找到发送人和消息内容
- [ ] ✅ 高级语法：正常工作

### 问题记录

（记录测试中发现的任何问题）

### 总结

功能状态: ✅ 正常 / ⚠️ 部分问题 / ❌ 有严重问题
```

---

## 🎉 测试通过后

确认所有测试通过后：

1. ✅ 标记功能为"可投入生产"
2. ✅ 提交代码到 Git（如需要）
3. ✅ 更新用户文档（如需要）
4. ✅ 通知团队新功能可用

---

## 📞 支持

如果测试中遇到问题：
1. 检查控制台日志
2. 查看 [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) 了解实现细节
3. 查看 [SMART_SEARCH_REQUIREMENT.md](./SMART_SEARCH_REQUIREMENT.md) 了解需求说明
