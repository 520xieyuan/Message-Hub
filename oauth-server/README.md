# OAuth回调服务器

这是一个独立的OAuth回调服务器，用于处理Gmail、Slack等平台的OAuth认证流程，并通过WebSocket将结果推送给Electron客户端。提供Web管理界面，方便配置和管理OAuth应用及用户令牌。

## 🏗️ 架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Electron App  │    │  OAuth Server   │    │  OAuth Provider │
│                 │    │                 │    │  (Gmail/Slack)  │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ 1. 发起OAuth    │───▶│ 2. 生成授权URL   │    │                 │
│ 2. 建立WebSocket│◀───│ 3. 返回URL      │    │                 │
│ 3. 打开浏览器    │    │ 4. 等待回调     │◀───│ 5. 用户授权     │
│ 4. 接收结果     │◀───│ 5. 推送结果     │    │ 6. 重定向回调   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd oauth-server
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器将启动在 `http://localhost:3000`，数据库会自动初始化。

### 3. 访问管理界面

- 直接访问: http://localhost:3000/
- 或访问: http://localhost:3000/admin/admin.html

### 4. 局域网访问

服务器会自动检测局域网IP地址，你可以通过以下地址访问：

- 本地: `http://localhost:3000`
- 局域网: `http://192.168.1.100:3000` (替换为实际IP)

### 5. 配置环境变量（可选）

创建 `.env` 文件自定义配置：

```env
# 服务器配置
PORT=3000
HOST=0.0.0.0
```

## 📊 管理界面使用

### 统计概览
管理界面顶部显示实时统计信息：
- **OAuth应用数**: 已配置的OAuth应用总数
- **用户令牌数**: 已存储的用户令牌总数  
- **Gmail账户数**: Gmail平台的用户令牌数
- **Slack账户数**: Slack平台的用户令牌数

### OAuth应用管理

#### 添加OAuth应用
1. 选择平台（Gmail/Slack/Lark）
2. 输入OAuth客户端ID
3. 输入OAuth客户端密钥
4. 确认重定向URI（自动填充）
5. 点击"添加OAuth应用"

#### 查看和删除OAuth应用
- 查看所有已配置的OAuth应用
- 显示平台、客户端ID、重定向URI、状态等信息
- 点击"删除"按钮可删除不需要的应用

### 用户令牌管理

#### 搜索用户令牌
1. 在搜索框中输入用户标识符：
   - Gmail: `john@company.com`
   - Slack: `U1234567890@T1234567890`
   - Lark: `ou_xxx@cli_yyy`
2. 点击"搜索"按钮查看该用户的所有令牌

#### 查看和删除令牌
- 查看平台类型、用户标识符、显示名称、过期时间等信息
- 点击"删除"按钮可删除无效令牌

## 🗄️ 数据库设计

### 表结构

#### oauth_apps - OAuth应用配置表
```sql
CREATE TABLE oauth_apps (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,                -- gmail/slack/lark
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### user_tokens - 用户令牌表
```sql
CREATE TABLE user_tokens (
    id TEXT PRIMARY KEY,
    oauth_app_id TEXT NOT NULL,
    user_identifier TEXT NOT NULL,         -- 平台特定的用户标识
    display_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at DATETIME,
    user_info TEXT,                        -- JSON: 用户详细信息
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(oauth_app_id) REFERENCES oauth_apps(id)
);
```

### 用户标识符规则

- **Gmail**: `john@company.com` (邮箱)
- **Slack**: `U1234567890@T1234567890` (用户ID@工作区ID)
- **Lark**: `ou_xxx@cli_yyy` (用户ID@应用ID)

## 📡 API接口

### REST API

#### OAuth应用管理

```bash
# 创建OAuth应用
POST /api/oauth-apps
{
  "platform": "gmail",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "redirect_uri": "http://localhost:3000/oauth/callback/gmail"
}

# 获取OAuth应用列表
GET /api/oauth-apps?platform=gmail

# 获取统计信息
GET /api/stats
```

#### 用户令牌管理

```bash
# 获取用户令牌（不含敏感信息）
GET /api/tokens/:identifier?platform=gmail

# 获取用户令牌（含访问令牌）
GET /api/tokens/:identifier/full?platform=gmail

# 删除用户令牌
DELETE /api/tokens/:tokenId
```

### WebSocket连接

```javascript
const socket = io('http://192.168.1.100:3000')

// 注册客户端
socket.emit('register', {
  clientId: 'unique-client-id',
  appVersion: '1.0.0'
})

// 开始OAuth流程
socket.emit('start-oauth', {
  platform: 'gmail',
  sessionId: 'optional-session-id'
})

// 监听OAuth URL
socket.on('oauth-url', (data) => {
  console.log('授权URL:', data.authUrl)
  // 在浏览器中打开授权URL
})

// 监听OAuth结果
socket.on('oauth-success', (data) => {
  console.log('授权成功:', data.tokens)
})

socket.on('oauth-error', (data) => {
  console.error('授权失败:', data.error)
})
```

### HTTP接口

#### 健康检查
```
GET /health
```

响应：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "clients": 2,
  "sessions": 1,
  "uptime": 3600
}
```

#### 服务器信息
```
GET /info
```

响应：
```json
{
  "name": "OAuth Callback Server",
  "version": "1.0.0",
  "baseUrl": "http://192.168.1.100:3000",
  "supportedPlatforms": ["gmail", "slack"],
  "clients": 2,
  "sessions": 1
}
```

## 🔧 OAuth平台配置

### Gmail OAuth配置

1. **创建Google Cloud项目**
   - 访问 [Google Cloud Console](https://console.cloud.google.com/)
   - 创建新项目或选择现有项目

2. **启用Gmail API**
   - 在API库中搜索"Gmail API"
   - 点击启用

3. **创建OAuth凭据**
   - 转到"凭据"页面
   - 点击"创建凭据" > "OAuth客户端ID"
   - 选择"Web应用程序"
   - 添加重定向URI: `http://localhost:3000/oauth/callback/gmail`
   - 如需局域网访问，添加: `http://192.168.x.x:3000/oauth/callback/gmail`

4. **在管理界面中配置**
   - 平台: Gmail
   - 客户端ID: 从Google Cloud Console复制
   - 客户端密钥: 从Google Cloud Console复制
   - 重定向URI: `http://localhost:3000/oauth/callback/gmail`

### Slack OAuth配置

1. **创建Slack应用**
   - 访问 [Slack API](https://api.slack.com/apps)
   - 点击"Create New App"
   - 选择"From scratch"

2. **配置OAuth设置**
   - 转到"OAuth & Permissions"
   - 添加重定向URL: `http://localhost:3000/oauth/callback/slack`
   - 如需局域网访问，添加: `http://192.168.x.x:3000/oauth/callback/slack`
   - 添加所需的OAuth Scopes（如：`search:read`）

3. **在管理界面中配置**
   - 平台: Slack
   - 客户端ID: 从Slack应用设置复制
   - 客户端密钥: 从Slack应用设置复制
   - 重定向URI: `http://localhost:3000/oauth/callback/slack`

### Lark OAuth配置

1. **创建Lark应用**
   - 访问 [Lark开放平台](https://open.larksuite.com/)
   - 创建企业自建应用

2. **配置OAuth设置**
   - 设置重定向URL: `http://localhost:3000/oauth/callback/lark`
   - 如需局域网访问，添加: `http://192.168.x.x:3000/oauth/callback/lark`
   - 申请所需权限

3. **在管理界面中配置**
   - 平台: Lark
   - 客户端ID: 从Lark应用设置复制
   - 客户端密钥: 从Lark应用设置复制
   - 重定向URI: `http://localhost:3000/oauth/callback/lark`

## 🛡️ 安全考虑

### 开发环境
- 使用HTTP协议进行局域网测试
- 简化的CORS配置
- 基本的state参数验证

### 生产环境建议

#### 网络安全
- 使用HTTPS协议
- 严格的CORS配置
- 增强的state参数加密
- 客户端认证机制
- 请求频率限制
- 限制管理界面访问IP

#### OAuth安全
- 定期轮换客户端密钥
- 使用最小权限原则
- 监控异常访问

#### 数据管理
- 定期备份数据库
- 清理过期令牌
- 监控存储使用量

### 最佳实践

#### 配置管理
- 为不同环境创建不同的OAuth应用
- 使用描述性的应用名称
- 记录配置变更

#### 用户管理
- 定期审查用户令牌
- 及时删除无效账户
- 监控令牌使用情况

## 🔍 调试和监控

### 日志输出

服务器会输出详细的日志信息：

```
🚀 OAuth回调服务器启动成功
📍 服务器地址: http://192.168.1.100:3000
🔗 健康检查: http://192.168.1.100:3000/health
ℹ️  服务器信息: http://192.168.1.100:3000/info
📱 支持的平台: gmail, slack
⏰ 会话超时: 10 分钟
```

### 实时监控

访问 `/health` 端点可以获取实时状态：
- 连接的客户端数量
- 活跃的OAuth会话数量
- 服务器运行时间

## 🧪 开发和测试

### 启动开发服务器

```bash
npm run dev
```

### 运行测试脚本

```bash
# 在主项目目录下
node test-oauth-flow.js        # 基础OAuth测试
node test-integrated-auth.js   # 完整集成测试
```

### 测试API

```bash
npm run test-api
```

## 📝 故障排除

### 服务器问题

1. **端口被占用**
   ```bash
   Error: listen EADDRINUSE :::3000
   ```
   解决：更改PORT环境变量或停止占用端口的进程

2. **管理界面无法访问**
   - 确认服务器已启动
   - 检查端口3000是否被占用
   - 确认防火墙设置

### OAuth问题

3. **OAuth回调失败**
   ```
   invalid_request: redirect_uri_mismatch
   ```
   解决：检查OAuth应用配置中的重定向URI是否与平台配置完全一致

4. **Token交换失败**
   ```
   Token exchange failed: invalid_client
   ```
   解决：检查客户端ID和密钥配置是否正确

5. **OAuth应用创建失败**
   - 检查所有字段是否填写完整
   - 确认重定向URI格式正确
   - 检查数据库连接

### 连接问题

6. **WebSocket连接失败**
   ```
   Error: WebSocket connection failed
   ```
   解决：检查防火墙设置和网络连接

7. **用户令牌搜索无结果**
   - 确认用户标识符格式正确
   - 检查用户是否已完成OAuth认证
   - 确认令牌未被删除

### 网络配置

确保以下端口可访问：
- HTTP: 3000 (或自定义端口)
- WebSocket: 同HTTP端口

### 防火墙设置

Windows防火墙可能需要允许Node.js访问网络。

### 调试技巧

1. **查看浏览器控制台**
   - 按F12打开开发者工具
   - 查看Console标签页的错误信息
   - 查看Network标签页的请求状态

2. **查看服务器日志**
   - 服务器控制台会显示详细的操作日志
   - 包括API请求、数据库操作、错误信息等

3. **使用测试脚本**
   ```bash
   # 在主项目目录下
   node test-oauth-flow.js        # 基础OAuth测试
   node test-integrated-auth.js   # 完整集成测试
   ```

## 📚 相关文档

- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Slack OAuth](https://api.slack.com/authentication/oauth-v2)
- [Socket.io文档](https://socket.io/docs/)
- [Express.js文档](https://expressjs.com/)

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个OAuth服务器。

## 📄 许可证

MIT License