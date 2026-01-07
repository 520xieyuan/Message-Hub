# LLM 配置集中管理 - 实现计划

## 1. 方案概述

将 LLM 配置从 Electron 客户端移到 OAuth Server 集中管理，用户无需在桌面应用中配置 AI 服务。

```
OAuth Server (MariaDB)     →    Electron Client
    ↓                              ↓
存储 LLM 配置              启动时拉取配置
(provider, apiKey,         直接调用 LLM API
 model, baseUrl)           (Ollama/OpenAI/DeepSeek)
    ↓
admin.html 管理界面
```

### 1.1 核心优势

| 优势 | 说明 |
|------|------|
| 用户零配置 | Electron 用户无需关心 AI 服务配置 |
| 统一管理 | 管理员一处配置，所有客户端生效 |
| 灵活切换 | 换模型/服务商不用更新客户端 |
| API Key 集中 | 便于管理和轮换密钥 |

### 1.2 支持的 LLM 服务

OpenAI API 格式已成为行业标准，以下服务均兼容：

| 服务 | Base URL | 说明 |
|------|----------|------|
| Ollama | `http://localhost:11434` | 本地/远程部署 |
| OpenAI | `https://api.openai.com` | GPT-4o, GPT-4 等 |
| DeepSeek | `https://api.deepseek.com` | 国产，API 兼容 |
| Moonshot (Kimi) | `https://api.moonshot.cn` | 国产，API 兼容 |
| 智谱 GLM | `https://open.bigmodel.cn` | 国产，API 兼容 |
| Groq | `https://api.groq.com` | 超快推理 |
| Together AI | `https://api.together.xyz` | 多种开源模型 |

---

## 2. 阶段 1：OAuth Server 端

### 2.1 数据库 - 新增 `llm_config` 表

```sql
CREATE TABLE llm_config (
  id VARCHAR(36) PRIMARY KEY,
  provider ENUM('ollama', 'openai') NOT NULL DEFAULT 'ollama',
  base_url VARCHAR(255) NOT NULL,
  api_key VARCHAR(255),           -- OpenAI 等需要，Ollama 可为空
  model VARCHAR(100) NOT NULL,
  max_tokens INT DEFAULT 2048,
  temperature DECIMAL(2,1) DEFAULT 0.3,
  timeout INT DEFAULT 120000,     -- 毫秒
  is_enabled TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT INTO llm_config (id, provider, base_url, model) VALUES (
  'default',
  'ollama',
  'http://localhost:11434',
  'qwen2.5:7b'
);
```

### 2.2 API 接口

#### GET /api/llm/config

获取当前 LLM 配置（供 Electron 客户端调用）

**响应示例：**
```json
{
  "success": true,
  "data": {
    "provider": "ollama",
    "baseUrl": "http://192.168.1.100:11434",
    "model": "qwen2.5:7b",
    "maxTokens": 2048,
    "temperature": 0.3,
    "timeout": 120000,
    "isEnabled": true
  }
}
```

**注意：** API Key 不返回给客户端（仅在 Server 端使用）

#### POST /api/llm/config

保存 LLM 配置（供 admin 页面调用）

**请求示例：**
```json
{
  "provider": "openai",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-xxx",
  "model": "deepseek-chat",
  "maxTokens": 2048,
  "temperature": 0.3,
  "timeout": 120000,
  "isEnabled": true
}
```

#### POST /api/llm/test

测试 LLM 连接（供 admin 页面调用）

**请求示例：**
```json
{
  "provider": "openai",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-xxx",
  "model": "deepseek-chat"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "连接成功",
  "responseTime": 1234,
  "modelInfo": "deepseek-chat"
}
```

### 2.3 admin.html - 新增 LLM 配置 Tab

UI 设计：

```
┌─────────────────────────────────────────────────────────────┐
│  OAuth Apps  │  User Tokens  │  LLM Config  │  Stats        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LLM 服务配置                                                │
│  ─────────────                                              │
│                                                             │
│  Provider:  ○ Ollama (本地/远程)                             │
│             ● OpenAI 兼容 (OpenAI/DeepSeek/Moonshot等)       │
│                                                             │
│  Base URL:  [https://api.deepseek.com          ]           │
│                                                             │
│  API Key:   [sk-xxxxxxxxxxxxxxxxxxxxx          ] (已隐藏)   │
│                                                             │
│  Model:     [deepseek-chat                     ]           │
│                                                             │
│  ▼ 高级设置                                                  │
│  ┌─────────────────────────────────────────────┐           │
│  │ Max Tokens:   [2048    ]                    │           │
│  │ Temperature:  [0.3     ]                    │           │
│  │ Timeout (ms): [120000  ]                    │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  [🔗 测试连接]  [💾 保存配置]                                 │
│                                                             │
│  ✅ 连接成功 - 响应时间: 1.2s                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 阶段 2：Electron 端改造

### 3.1 LLMService 改造

#### 配置获取流程

```typescript
// 启动时从 OAuth Server 获取配置
async function fetchLLMConfig(): Promise<LLMConfig> {
  const response = await fetch(`${oauthServerUrl}/api/llm/config`);
  const data = await response.json();

  if (data.success && data.data.isEnabled) {
    return data.data;
  }

  throw new Error('LLM 服务未配置或未启用');
}
```

#### 支持两种 API 格式

```typescript
// Ollama API
POST http://localhost:11434/api/chat
{
  "model": "qwen2.5:7b",
  "messages": [...],
  "stream": true
}

// OpenAI 兼容 API
POST https://api.deepseek.com/v1/chat/completions
{
  "model": "deepseek-chat",
  "messages": [...],
  "stream": true
}
Headers: { "Authorization": "Bearer sk-xxx" }
```

### 3.2 类型定义更新

```typescript
// src/types/llm.ts

export type LLMProvider = 'ollama' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  apiKey?: string;      // OpenAI 模式需要
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  isEnabled: boolean;
}
```

### 3.3 简化本地设置

移除 `LLMSettings.tsx` 中的配置表单，改为：

```
┌─────────────────────────────────────────────────────────────┐
│  LLM 总结服务                                                │
│  ─────────────                                              │
│                                                             │
│  当前配置（由管理员在服务端统一配置）：                         │
│                                                             │
│  服务类型:  OpenAI 兼容                                      │
│  服务地址:  https://api.deepseek.com                        │
│  模型:      deepseek-chat                                   │
│  状态:      ✅ 已启用                                        │
│                                                             │
│  如需修改配置，请联系管理员。                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 任务清单

### 4.1 OAuth Server 端

- [x] **1.1 创建数据库迁移脚本** (`oauth-server/migrate-llm.js`) ✅
  - 创建 `llm_config` 表
  - 插入默认配置

- [x] **1.2 新增 GET /api/llm/config 接口** (`oauth-server/server.js`) ✅
  - 返回当前 LLM 配置
  - 不返回 API Key（安全考虑）

- [x] **1.3 新增 POST /api/llm/config 接口** (`oauth-server/server.js`) ✅
  - 保存 LLM 配置
  - API Key 加密存储（可选）

- [x] **1.4 新增 POST /api/llm/test 接口** (`oauth-server/server.js`) ✅
  - 测试 LLM 连接
  - 支持 Ollama 和 OpenAI 两种格式

- [x] **1.5 admin.html 新增 LLM 配置 Tab** (`oauth-server/public/admin.html`) ✅
  - Provider 选择
  - Base URL / API Key / Model 输入
  - 高级参数配置
  - 测试连接按钮
  - 保存配置按钮

### 4.2 Electron 端

- [x] **2.1 更新类型定义** (`src/types/llm.ts`) ✅
  - 添加 `LLMProvider` 类型
  - 更新 `LLMConfig` 接口

- [x] **2.2 LLMService 支持远程配置** (`electron/services/LLMService.ts`) ✅
  - 添加 `fetchRemoteConfig()` 方法
  - 启动时自动拉取配置
  - 配置缓存机制

- [x] **2.3 LLMService 支持 OpenAI API** (`electron/services/LLMService.ts`) ✅
  - 实现 `callOpenAIChat()` 方法
  - 实现 `callOpenAIChatStream()` 方法
  - 根据 provider 选择调用方式

- [x] **2.4 简化 LLMSettings 组件** (`src/components/LLMSettings.tsx`) ✅
  - 移除配置表单
  - 显示只读配置信息

- [x] **2.5 更新 IPC Handlers** (`electron/ipc/LLMIPCHandlers.ts`) ✅
  - 新增 `llm:refreshConfig` handler
  - 更新 `llm:getConfig` 从远程获取

---

## 5. 文件清单

### 5.1 新增文件

| 文件 | 说明 |
|------|------|
| `oauth-server/migrate-llm.js` | 数据库迁移脚本 |

### 5.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `oauth-server/server.js` | 新增 3 个 API 端点 |
| `oauth-server/public/admin.html` | 新增 LLM 配置 Tab |
| `src/types/llm.ts` | 更新类型定义 |
| `electron/services/LLMService.ts` | 支持远程配置 + OpenAI API |
| `electron/ipc/LLMIPCHandlers.ts` | 更新配置获取逻辑 |
| `src/components/LLMSettings.tsx` | 简化为只读显示 |

---

## 6. 注意事项

### 6.1 API Key 安全

- OAuth Server 端存储 API Key
- 不将 API Key 返回给 Electron 客户端
- Electron 端通过 OAuth Server 代理调用（可选增强方案）

### 6.2 配置缓存

- Electron 启动时拉取配置
- 缓存到内存，避免每次请求都拉取
- 可设置定时刷新（如 5 分钟）

### 6.3 降级策略

- 如果 OAuth Server 不可达，使用本地默认配置
- 提示用户网络连接问题

---

## 更新记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2024-12-24 | v1.0 | 初始版本 |
| 2024-12-24 | v1.1 | 全部任务完成，功能实现 |