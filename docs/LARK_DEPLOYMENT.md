# Lark 平台部署指南

本文档详细说明如何配置 Lark 企业应用并集成到跨平台消息搜索应用中。

**创建日期**: 2025-12-19
**目标读者**: 系统管理员、开发人员

---

## 目录

1. [前置要求](#前置要求)
2. [创建 Lark 应用](#创建-lark-应用)
3. [配置 OAuth 权限](#配置-oauth-权限)
4. [OAuth Server 配置](#oauth-server-配置)
5. [测试认证流程](#测试认证流程)
6. [常见问题解答](#常见问题解答)
7. [故障排查指南](#故障排查指南)

---

## 前置要求

在开始之前，请确保您满足以下条件：

- [ ] 拥有 Lark 企业管理员权限（或能联系管理员审批应用）
- [ ] OAuth Server 已部署并运行
- [ ] 了解 Lark 开放平台的基本概念

### 环境要求

| 组件 | 版本要求 |
|------|---------|
| Node.js | 18+ |
| OAuth Server | 已运行 |
| Lark SDK | @larksuiteoapi/node-sdk |

---

## 创建 Lark 应用

### 步骤 1：登录 Lark 开放平台

1. 访问 [Lark 开放平台](https://open.larksuite.com/)
2. 使用企业管理员账号登录
3. 点击右上角「Developer Console」

### 步骤 2：创建企业自建应用

1. 点击「Create App」按钮
2. 选择「Enterprise Self-Built App」类型
3. 填写应用信息：
   - **App Name**: `Cross-Platform Message Search`（或自定义名称）
   - **App Description**: `Unified search for Lark, Gmail, Slack messages`
   - **App Icon**: 上传应用图标（可选）

4. 点击「Create」完成应用创建

### 步骤 3：获取应用凭证

创建完成后，进入应用详情页面：

1. 点击左侧菜单「Credentials & Basic Info」
2. 记录以下信息：
   - **App ID**: `cli_xxxxxxxxx`
   - **App Secret**: `xxxxxxxxxxxxxxxxxxxxxx`

> ⚠️ **安全提示**: App Secret 是敏感信息，请妥善保管，不要提交到代码仓库。

---

## 配置 OAuth 权限

### 步骤 1：添加应用能力

1. 进入应用详情页
2. 点击左侧菜单「Add Capabilities」
3. 选择「Web App」能力并启用

### 步骤 2：配置重定向 URL

1. 点击左侧菜单「Security Settings」
2. 在「Redirect URL」部分添加：
   ```
   http://localhost:3000/callback/lark
   ```

   > 生产环境请使用 HTTPS 地址，例如：
   > `https://your-oauth-server.com/callback/lark`

3. 点击「Save」

### 步骤 3：申请 API 权限

1. 点击左侧菜单「Permissions & Scopes」→「API Permissions」
2. 搜索并申请以下权限：

#### 必需权限

| 权限名称 | 权限标识 | 说明 |
|---------|---------|------|
| Get chat info | `im:chat:readonly` | 获取用户参与的会话列表 |
| Read and send messages | `im:message:readonly` | 读取会话中的消息内容 |

#### 可选权限（推荐）

| 权限名称 | 权限标识 | 说明 |
|---------|---------|------|
| Get user basic info | `contact:user.base:readonly` | 显示消息发送者名称 |

3. 点击「Batch Enable」

### 步骤 4：权限审批

根据企业配置，部分权限可能需要管理员审批：

1. 如果看到「Pending Approval」状态，联系企业管理员
2. 管理员在「Admin Console」→「App Review」中审批
3. 审批通过后，权限状态变为「Enabled」

### 步骤 5：发布应用

1. 点击左侧菜单「Version Management & Release」
2. 点击「Create Version」
3. 填写版本信息：
   - **Version**: `1.0.0`
   - **Release Notes**: `Initial version with message search support`
4. 选择可用范围：
   - **All Members**: 所有企业成员可用
   - **Specific Members**: 限定特定部门或人员
5. 点击「Submit for Release」

> 首次发布需要管理员审批，后续版本更新可能自动发布。

---

## OAuth Server 配置

### 步骤 1：添加 Lark OAuth 应用

1. 访问 OAuth Server 管理页面：`http://localhost:3000/admin.html`
2. 在「OAuth Apps」部分点击「Add App」
3. 填写应用信息：

| 字段 | 值 | 说明 |
|------|-----|------|
| Platform | `lark` | 平台类型 |
| App Name | `Lark Message Search` | 应用显示名称 |
| Client ID | `cli_xxxxxxxxx` | Lark App ID |
| Client Secret | `xxxxxx` | Lark App Secret |
| Redirect URI | `http://localhost:3000/callback/lark` | 回调地址 |
| Scopes | `im:chat:readonly im:message:readonly` | 权限范围 |

4. 点击「Save」保存

### 步骤 2：验证配置

1. 在 OAuth Apps 列表中找到刚创建的应用
2. 点击「Test」按钮
3. 应该能看到 Lark 授权页面
4. 授权成功后，Token 会保存到数据库

### 配置示例

```javascript
// oauth-server/config.js
module.exports = {
  lark: {
    clientId: process.env.LARK_CLIENT_ID || 'cli_xxxxxxxxx',
    clientSecret: process.env.LARK_CLIENT_SECRET || 'your-secret',
    redirectUri: process.env.LARK_REDIRECT_URI || 'http://localhost:3000/callback/lark',
    scopes: ['im:chat:readonly', 'im:message:readonly'],
    authUrl: 'https://open.larksuite.com/open-apis/authen/v1/authorize',
    tokenUrl: 'https://open.larksuite.com/open-apis/authen/v1/access_token',
  }
};
```

---

## 测试认证流程

### 步骤 1：启动服务

```bash
# 启动 OAuth Server
cd oauth-server
node server.js

# 启动 Electron 应用（新终端）
npm run dev
```

### 步骤 2：添加 Lark 账户

1. 在应用中打开「账户管理」页面
2. 点击「添加账户」
3. 选择「Lark」平台
4. 选择之前创建的 OAuth 应用
5. 点击「开始认证」

### 步骤 3：完成授权

1. 浏览器会打开 Lark 授权页面
2. 确认权限并点击「Authorize」
3. 页面会跳转回 OAuth Server
4. 应用自动接收授权结果

### 步骤 4：验证搜索

1. 返回应用主界面
2. 确保 Lark 账户显示为「已连接」
3. 在搜索框输入关键词
4. 勾选「Lark」平台
5. 点击搜索，验证结果

---

## 常见问题解答

### Q1: 授权页面显示「App not published」

**原因**: 应用处于开发状态，未发布或审批未通过。

**解决方案**:
1. 进入 Lark 开放平台
2. 发布应用并等待审批
3. 或在「Version Management」中添加测试用户

### Q2: 授权后提示「Insufficient permissions」

**原因**: 未申请或未开通必需的 API 权限。

**解决方案**:
1. 检查「Permissions & Scopes」页面
2. 确保 `im:chat:readonly` 和 `im:message:readonly` 已开通
3. 如显示「Pending Approval」，联系管理员审批

### Q3: 搜索返回空结果

**可能原因**:
1. Token 已过期
2. 用户不在任何群组中
3. 搜索关键词不存在

**排查步骤**:
1. 检查控制台日志
2. 尝试刷新 Token
3. 验证 Lark 中确实有包含关键词的消息

### Q4: OAuth 回调失败

**原因**: 重定向 URL 配置不匹配。

**解决方案**:
1. 确认 Lark 应用中的「Redirect URL」与 OAuth Server 配置完全一致
2. 注意 HTTP/HTTPS 协议、端口号、路径大小写
3. 不要在 URL 末尾添加 `/`

### Q5: 搜索速度很慢

**原因**: Lark API 不支持原生搜索，需要遍历获取消息。

**优化建议**:
1. 减少 `maxChatsToSearch`（默认 50）
2. 减少 `maxPagesPerChat`（默认 10）
3. 减少 `recentDaysOnly`（默认 30 天）
4. 启用会话过滤（`enableChatFilter: true`）

---

## 故障排查指南

### 日志查看

#### OAuth Server 日志

```bash
# 查看实时日志
cd oauth-server
node server.js 2>&1 | tee oauth-server.log

# 或使用 PM2
pm2 logs oauth-server
```

#### Electron 应用日志

日志位置：
- Windows: `%APPDATA%/cross-platform-message-search/logs/`
- macOS: `~/Library/Logs/cross-platform-message-search/`
- Linux: `~/.config/cross-platform-message-search/logs/`

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|-------|------|---------|
| `99991663` | 无权限访问会话 | 检查权限是否开通 |
| `99991668` | 消息已被撤回 | 正常现象，可忽略 |
| `99002000` | Token 过期 | 刷新 Token 或重新授权 |
| `99991429` | 请求频率超限 | 等待后重试，检查并发配置 |
| `99991401` | 无效的 Token | 重新授权 |
| `99991672` | 会话不存在 | 正常现象，会话可能被删除 |

### 网络问题排查

```bash
# 测试 Lark API 连通性
curl -I https://open.larksuite.com/open-apis/authen/v1/authorize

# 测试 OAuth Server
curl http://localhost:3000/health
```

### Token 手动刷新

如果自动刷新失败，可手动刷新：

1. 访问 OAuth Server 管理页面
2. 找到对应的 Token 记录
3. 点击「Refresh」按钮
4. 或删除 Token，重新授权

### 重置应用

如果问题无法解决，可以尝试重置：

1. 删除 OAuth Server 中的 Token
2. 在 Lark 开放平台重置 App Secret
3. 更新 OAuth Server 配置
4. 重新授权

---

## 生产环境部署

### HTTPS 配置

生产环境必须使用 HTTPS：

1. 获取 SSL 证书（Let's Encrypt 或商业证书）
2. 配置 nginx 反向代理
3. 更新 Lark 应用的重定向 URL
4. 更新 OAuth Server 配置

```nginx
# nginx 配置示例
server {
    listen 443 ssl;
    server_name oauth.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### 环境变量

使用环境变量管理敏感信息：

```bash
# .env 文件
LARK_CLIENT_ID=cli_xxxxxxxxx
LARK_CLIENT_SECRET=your-secret
LARK_REDIRECT_URI=https://oauth.yourdomain.com/callback/lark
```

### 监控建议

1. 监控 OAuth Server 健康状态
2. 监控 Token 刷新成功率
3. 设置 API 调用告警阈值
4. 定期检查权限状态

---

## 相关文档

- [Lark 开放平台文档](https://open.larksuite.com/document/)
- [OAuth 2.0 授权说明](https://open.larksuite.com/document/common-capabilities/sso/api/get-access_token)
- [IM API 文档](https://open.larksuite.com/document/server-docs/im-v1/message/list)
- [LARK_SEARCH_IMPLEMENTATION.md](./LARK_SEARCH_IMPLEMENTATION.md) - 搜索实现详情
- [LARK_IMPLEMENTATION_TASKS.md](./LARK_IMPLEMENTATION_TASKS.md) - 实施任务清单

---

**文档版本**: 1.1
**最后更新**: 2025-12-19
**维护者**: 开发团队
