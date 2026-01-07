/**
 * LLM 服务 IPC 处理器
 * 处理渲染进程与主进程之间的 LLM 相关通信
 * 支持流式和非流式两种模式
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { LLMService } from '../services/LLMService';
import type {
  LLMConfig,
  SummarizeRequest,
  SummarizeResponse,
  LLMConnectionTestResult,
} from '../../src/types/llm';

export class LLMIPCHandlers {
  private llmService: LLMService;
  private streamListener: ((data: { chunk: string; isComplete: boolean; fullContent: string }) => void) | null = null;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
    this.registerHandlers();
  }

  /**
   * 注册所有 IPC 处理器
   */
  private registerHandlers(): void {
    // 先移除可能存在的处理器
    this.removeHandlers();

    // LLM 相关处理器
    ipcMain.handle('llm:summarize', this.handleSummarize.bind(this));
    ipcMain.handle('llm:summarizeStream', this.handleSummarizeStream.bind(this));
    ipcMain.handle('llm:cancelStream', this.handleCancelStream.bind(this));
    ipcMain.handle('llm:getConfig', this.handleGetConfig.bind(this));
    ipcMain.handle('llm:refreshConfig', this.handleRefreshConfig.bind(this));
    ipcMain.handle('llm:updateConfig', this.handleUpdateConfig.bind(this));
    ipcMain.handle('llm:testConnection', this.handleTestConnection.bind(this));
    ipcMain.handle('llm:getModels', this.handleGetModels.bind(this));

    console.log('[LLMIPCHandlers] IPC handlers registered');
  }

  /**
   * 处理总结请求（非流式）
   */
  private async handleSummarize(
    _event: IpcMainInvokeEvent,
    request: SummarizeRequest
  ): Promise<SummarizeResponse> {
    try {
      // 验证请求
      this.validateSummarizeRequest(request);

      // 执行总结
      const response = await this.llmService.summarize(request);

      return response;
    } catch (error) {
      console.error('[LLMIPCHandlers] Summarize failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : '总结失败',
        duration: 0,
        model: this.llmService.getConfig().model,
        messageCount: request?.messages?.length || 0,
      };
    }
  }

  /**
   * 处理流式总结请求
   * 通过 IPC 事件将流式内容发送到渲染进程
   */
  private async handleSummarizeStream(
    event: IpcMainInvokeEvent,
    request: SummarizeRequest
  ): Promise<SummarizeResponse> {
    try {
      // 验证请求
      this.validateSummarizeRequest(request);

      // 获取发送事件的窗口
      const webContents = event.sender;

      // 移除之前的监听器
      if (this.streamListener) {
        this.llmService.removeListener('stream-chunk', this.streamListener);
        this.streamListener = null;
      }

      // 创建新的流式监听器
      this.streamListener = (data: { chunk: string; isComplete: boolean; fullContent: string }) => {
        // 检查 webContents 是否仍然有效
        if (!webContents.isDestroyed()) {
          webContents.send('llm:stream-chunk', data);
        }
      };

      // 添加监听器
      this.llmService.on('stream-chunk', this.streamListener);

      // 执行流式总结
      const response = await this.llmService.summarizeStream(request);

      // 移除监听器
      if (this.streamListener) {
        this.llmService.removeListener('stream-chunk', this.streamListener);
        this.streamListener = null;
      }

      return response;
    } catch (error) {
      console.error('[LLMIPCHandlers] Stream summarize failed:', error);

      // 清理监听器
      if (this.streamListener) {
        this.llmService.removeListener('stream-chunk', this.streamListener);
        this.streamListener = null;
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : '流式总结失败',
        duration: 0,
        model: this.llmService.getConfig().model,
        messageCount: request?.messages?.length || 0,
      };
    }
  }

  /**
   * 处理取消流式请求
   */
  private async handleCancelStream(
    _event: IpcMainInvokeEvent
  ): Promise<{ success: boolean }> {
    try {
      this.llmService.cancelStream();

      // 清理监听器
      if (this.streamListener) {
        this.llmService.removeListener('stream-chunk', this.streamListener);
        this.streamListener = null;
      }

      return { success: true };
    } catch (error) {
      console.error('[LLMIPCHandlers] Cancel stream failed:', error);
      return { success: false };
    }
  }

  /**
   * 处理获取配置请求
   * 如果设置了远程配置，先尝试从 OAuth Server 获取
   */
  private async handleGetConfig(
    _event: IpcMainInvokeEvent
  ): Promise<LLMConfig> {
    try {
      // 尝试获取远程配置
      await this.llmService.ensureConfigLoaded();
      return this.llmService.getConfig();
    } catch (error) {
      console.error('[LLMIPCHandlers] Get config failed:', error);
      throw error;
    }
  }

  /**
   * 处理刷新远程配置请求
   */
  private async handleRefreshConfig(
    _event: IpcMainInvokeEvent
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const success = await this.llmService.fetchRemoteConfig();
      return {
        success,
        message: success ? 'LLM 配置已刷新' : '无法获取远程配置，使用本地配置',
      };
    } catch (error) {
      console.error('[LLMIPCHandlers] Refresh config failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '刷新配置失败',
      };
    }
  }

  /**
   * 处理更新配置请求
   */
  private async handleUpdateConfig(
    _event: IpcMainInvokeEvent,
    newConfig: Partial<LLMConfig>
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // 验证配置
      this.validateConfig(newConfig);

      this.llmService.updateConfig(newConfig);

      return {
        success: true,
        message: 'LLM 配置已更新',
      };
    } catch (error) {
      console.error('[LLMIPCHandlers] Update config failed:', error);

      return {
        success: false,
        message: error instanceof Error ? error.message : '更新配置失败',
      };
    }
  }

  /**
   * 处理测试连接请求
   */
  private async handleTestConnection(
    _event: IpcMainInvokeEvent
  ): Promise<LLMConnectionTestResult> {
    try {
      return await this.llmService.testConnection();
    } catch (error) {
      console.error('[LLMIPCHandlers] Test connection failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : '连接测试失败',
      };
    }
  }

  /**
   * 处理获取可用模型列表请求
   */
  private async handleGetModels(
    _event: IpcMainInvokeEvent
  ): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      const models = await this.llmService.getAvailableModels();

      return {
        success: true,
        models,
      };
    } catch (error) {
      console.error('[LLMIPCHandlers] Get models failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : '获取模型列表失败',
      };
    }
  }

  /**
   * 验证总结请求
   */
  private validateSummarizeRequest(request: SummarizeRequest): void {
    if (!request) {
      throw new Error('总结请求不能为空');
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      throw new Error('消息列表必须是数组');
    }

    if (request.messages.length === 0) {
      throw new Error('消息列表不能为空');
    }

    // 验证消息数量限制（防止超长请求）
    if (request.messages.length > 100) {
      throw new Error('消息数量过多，最多支持 100 条消息');
    }

    // 验证自定义 Prompt
    if (request.customPrompt && request.customPrompt.length > 5000) {
      throw new Error('自定义 Prompt 过长，最多 5000 个字符');
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(config: Partial<LLMConfig>): void {
    if (!config || typeof config !== 'object') {
      throw new Error('配置必须是对象');
    }

    // 验证 provider
    if (config.provider !== undefined) {
      if (!['ollama', 'openai'].includes(config.provider)) {
        throw new Error('provider 必须是 ollama 或 openai');
      }
    }

    // 验证 Base URL
    if (config.baseUrl !== undefined) {
      if (typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') {
        throw new Error('服务地址不能为空');
      }

      try {
        new URL(config.baseUrl);
      } catch {
        throw new Error('服务地址格式无效');
      }
    }

    // 兼容旧版本的 ollamaUrl
    if (config.ollamaUrl !== undefined) {
      if (typeof config.ollamaUrl !== 'string' || config.ollamaUrl.trim() === '') {
        throw new Error('Ollama 服务地址不能为空');
      }

      try {
        new URL(config.ollamaUrl);
      } catch {
        throw new Error('Ollama 服务地址格式无效');
      }
    }

    // 验证模型名称
    if (config.model !== undefined) {
      if (typeof config.model !== 'string' || config.model.trim() === '') {
        throw new Error('模型名称不能为空');
      }
    }

    // 验证最大 Token 数
    if (config.maxTokens !== undefined) {
      if (
        !Number.isInteger(config.maxTokens) ||
        config.maxTokens < 100 ||
        config.maxTokens > 16384
      ) {
        throw new Error('最大 Token 数必须是 100-16384 之间的整数');
      }
    }

    // 验证温度
    if (config.temperature !== undefined) {
      if (
        typeof config.temperature !== 'number' ||
        config.temperature < 0 ||
        config.temperature > 2
      ) {
        throw new Error('温度必须是 0-2 之间的数字');
      }
    }

    // 验证超时时间
    if (config.timeout !== undefined) {
      if (
        !Number.isInteger(config.timeout) ||
        config.timeout < 10000 ||
        config.timeout > 600000
      ) {
        throw new Error('超时时间必须是 10000-600000 毫秒之间的整数');
      }
    }

    // 验证启用状态
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      throw new Error('启用状态必须是布尔值');
    }
  }

  /**
   * 移除所有 IPC 处理器
   */
  public removeHandlers(): void {
    const handlers = [
      'llm:summarize',
      'llm:summarizeStream',
      'llm:cancelStream',
      'llm:getConfig',
      'llm:refreshConfig',
      'llm:updateConfig',
      'llm:testConnection',
      'llm:getModels',
    ];

    for (const handler of handlers) {
      ipcMain.removeHandler(handler);
    }

    // 清理流式监听器
    if (this.streamListener) {
      this.llmService.removeListener('stream-chunk', this.streamListener);
      this.streamListener = null;
    }

    console.log('[LLMIPCHandlers] IPC handlers removed');
  }

  /**
   * 清理资源
   */
  public async cleanup(): Promise<void> {
    this.removeHandlers();
    console.log('[LLMIPCHandlers] Cleaned up');
  }
}
