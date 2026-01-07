# Electron主进程和IPC通信实现

## 概述

本任务实现了跨平台消息搜索应用的Electron主进程和IPC通信机制，为后续的搜索功能、平台集成和配置管理奠定了基础。

## 已实现的功能

### 1. 增强的Electron主进程 (`electron/main.ts`)

- **窗口管理**: 创建和管理主应用窗口
- **应用生命周期**: 处理应用启动、激活、退出等事件
- **安全策略**: 设置内容安全策略，防止恶意代码执行
- **菜单系统**: 创建原生应用菜单，支持快捷键
- **跨平台支持**: 针对Windows、macOS、Linux的特定处理

#### 主要特性:
- 窗口状态自动保存和恢复
- 开发环境和生产环境的不同配置
- 外部链接安全处理
- macOS特有的窗口行为（隐藏而非关闭）

### 2. 窗口管理器 (`electron/utils/window-manager.ts`)

- **状态持久化**: 自动保存和恢复窗口位置、大小、最大化状态
- **多显示器支持**: 确保窗口在可见区域内显示
- **窗口设置API**: 提供程序化的窗口控制接口

#### 功能:
- 窗口大小和位置的智能恢复
- 跨会话的窗口状态保持
- 窗口边界检查和修正
- 实时状态监听和保存

### 3. IPC通信处理器 (`electron/utils/ipc-handlers.ts`)

实现了完整的主进程与渲染进程通信机制，包括以下API分组:

#### 应用相关API
- `app:getVersion` - 获取应用版本
- `app:getPlatform` - 获取平台信息
- `app:getPaths` - 获取系统路径
- `app:restart` - 重启应用
- `app:quit` - 退出应用

#### 搜索相关API
- `search:perform` - 执行搜索（框架已就绪，待后续实现）
- `search:getHistory` - 获取搜索历史
- `search:clearHistory` - 清除搜索历史
- `search:cancel` - 取消搜索

#### 平台配置API
- `platform:getConfigs` - 获取平台配置列表
- `platform:addConfig` - 添加平台配置
- `platform:updateConfig` - 更新平台配置
- `platform:removeConfig` - 删除平台配置
- `platform:testConnection` - 测试平台连接
- `platform:startAuth` - 开始OAuth认证

#### 配置管理API
- `config:getUserConfig` - 获取用户配置
- `config:updateUserConfig` - 更新用户配置
- `config:resetConfig` - 重置配置

#### 窗口管理API
- `window:minimize` - 最小化窗口
- `window:toggleMaximize` - 切换最大化状态
- `window:close` - 关闭窗口
- `window:getState` - 获取窗口状态
- `window:setBounds` - 设置窗口边界

#### 系统集成API
- `system:openExternal` - 在外部浏览器打开链接
- `system:showItemInFolder` - 在文件管理器中显示文件
- `system:showMessageBox` - 显示消息对话框
- `system:showErrorBox` - 显示错误对话框
- `system:showSaveDialog` - 显示保存文件对话框
- `system:showOpenDialog` - 显示打开文件对话框

### 4. 预加载脚本 (`electron/preload.ts`)

- **安全的API暴露**: 通过contextBridge安全地暴露主进程功能
- **类型安全**: 完整的TypeScript类型定义
- **事件系统**: 支持双向事件通信
- **权限控制**: 只暴露必要的功能，保持安全性

#### 特性:
- 完整的API类型定义
- 事件监听器管理
- 安全的频道过滤
- 内存泄漏防护

### 5. 环境工具 (`electron/utils/env.ts`)

- **环境检测**: 区分开发、生产、测试环境
- **平台识别**: 检测操作系统类型
- **配置适配**: 根据环境提供不同的配置

## 安全特性

1. **内容安全策略**: 防止XSS攻击和恶意代码执行
2. **上下文隔离**: 渲染进程与主进程完全隔离
3. **预加载脚本**: 通过安全的API桥接进行通信
4. **外部链接处理**: 自动在外部浏览器打开链接
5. **导航限制**: 防止恶意页面导航

## 错误处理

- **统一错误格式**: 使用AppError类型进行错误标准化
- **错误分类**: 按类型对错误进行分类和处理
- **用户友好**: 提供用户可理解的错误消息
- **调试信息**: 保留详细的错误堆栈用于调试

## 测试和验证

应用包含了IPC通信的测试界面，可以验证:
- Electron环境检测
- 应用信息获取
- 搜索功能框架
- 配置管理框架

## 构建和部署

- **TypeScript编译**: 支持完整的类型检查
- **跨平台构建**: 支持Windows、macOS、Linux
- **开发模式**: 热重载和开发者工具
- **生产构建**: 优化的打包配置

## 下一步

当前实现为后续任务提供了坚实的基础:
1. 安全存储和配置管理服务 (任务3)
2. 平台适配器基础架构 (任务4)
3. 具体平台集成 (任务5-7)
4. 搜索集成服务 (任务8)
5. React前端组件 (任务9-15)

所有的IPC通信接口都已就绪，后续任务只需要实现具体的业务逻辑即可。