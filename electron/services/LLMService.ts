/**
 * LLM Service
 * Handles communication with LLM services, provides message summarization functionality
 * Supports Ollama and OpenAI-compatible APIs
 * Supports both streaming and non-streaming response modes
 * Supports fetching remote configuration from OAuth Server
 */

import { EventEmitter } from 'events';
import {
  LLMConfig,
  LLMProvider,
  DEFAULT_LLM_CONFIG,
  RemoteLLMConfigResponse,
  SummarizeRequest,
  SummarizeResponse,
  LLMConnectionTestResult,
  LLMErrorType,
  LLMError,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaModelsResponse,
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  SummaryLanguage,
} from '../../src/types/llm';
import type { MessageResult } from '../../src/types/search';

/**
 * Callback function type for streaming responses
 */
export type StreamCallback = (chunk: string, isComplete: boolean) => void;

/**
 * System prompt templates for different languages
 */
const SYSTEM_PROMPTS: Record<SummaryLanguage, string> = {
  'zh-CN': `你是一个专业的消息总结助手。请根据以下来自不同平台的消息，生成一份结构化的总结。

## 要求
1. 提取关键信息和要点
2. 识别重要的人物、时间、事件
3. 如有行动项或待办事项，请单独列出
4. 保持客观，不添加原消息中没有的信息
5. 使用简体中文回复
6. 使用 Markdown 格式输出`,

  'zh-TW': `你是一個專業的訊息總結助手。請根據以下來自不同平台的訊息，生成一份結構化的總結。

## 要求
1. 提取關鍵信息和要點
2. 識別重要的人物、時間、事件
3. 如有行動項或待辦事項，請單獨列出
4. 保持客觀，不添加原訊息中沒有的信息
5. 使用繁體中文回覆
6. 使用 Markdown 格式輸出`,

  'en': `You are a professional message summarization assistant. Based on the following messages from different platforms, generate a structured summary.

## Requirements
1. Extract key information and main points
2. Identify important people, dates, and events
3. List action items or to-dos separately if any
4. Stay objective and do not add information not present in the original messages
5. Reply in English
6. Use Markdown format for output`,
};

/**
 * Get system prompt for specified language
 */
function getSystemPrompt(language?: SummaryLanguage): string {
  return SYSTEM_PROMPTS[language || 'zh-CN'];
}

export class LLMService extends EventEmitter {
  private config: LLMConfig;
  private abortController: AbortController | null = null;
  private oauthServerUrl: string | null = null;
  private configLoaded: boolean = false;
  private configLoadingPromise: Promise<boolean> | null = null;

  constructor(config?: Partial<LLMConfig>) {
    super();
    this.config = { ...DEFAULT_LLM_CONFIG, ...config };
  }

  /**
   * Set OAuth Server URL (for fetching remote configuration)
   */
  public setOAuthServerUrl(url: string): void {
    this.oauthServerUrl = url;
    console.log(`[LLMService] OAuth Server URL set to: ${url}`);
  }

  /**
   * Fetch remote configuration from OAuth Server
   * Uses Promise deduplication to avoid concurrent requests
   */
  public async fetchRemoteConfig(): Promise<boolean> {
    // If config is already loaded, return immediately
    if (this.configLoaded) {
      return true;
    }

    // If already loading, wait for existing load to complete
    if (this.configLoadingPromise) {
      return this.configLoadingPromise;
    }

    if (!this.oauthServerUrl) {
      console.warn('[LLMService] OAuth Server URL not set, using local config');
      return false;
    }

    // Create loading promise
    this.configLoadingPromise = this.doFetchRemoteConfig();

    try {
      return await this.configLoadingPromise;
    } finally {
      this.configLoadingPromise = null;
    }
  }

  /**
   * Actually perform remote configuration fetch
   */
  private async doFetchRemoteConfig(): Promise<boolean> {
    try {
      console.log(`[LLMService] Fetching remote config from ${this.oauthServerUrl}`);

      const response = await this.fetchWithTimeout(
        `${this.oauthServerUrl}/api/llm/config/full`,
        { method: 'GET' },
        10000
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as RemoteLLMConfigResponse;

      if (result.success && result.data) {
        const remoteConfig = result.data;
        this.config = {
          provider: remoteConfig.provider,
          baseUrl: remoteConfig.baseUrl,
          apiKey: remoteConfig.apiKey,
          model: remoteConfig.model,
          maxTokens: remoteConfig.maxTokens,
          temperature: remoteConfig.temperature,
          timeout: remoteConfig.timeout,
          enabled: remoteConfig.isEnabled,
        };
        this.configLoaded = true;
        console.log(`[LLMService] Remote config loaded: provider=${this.config.provider}, model=${this.config.model}`);
        this.emit('configUpdated', this.config);
        return true;
      } else {
        console.warn('[LLMService] Remote config not available:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[LLMService] Failed to fetch remote config:', error);
      return false;
    }
  }

  /**
   * Ensure configuration is loaded (if OAuth Server URL is set)
   */
  public async ensureConfigLoaded(): Promise<void> {
    if (!this.configLoaded && this.oauthServerUrl) {
      await this.fetchRemoteConfig();
    }
  }

  /**
   * Cancel current streaming request
   */
  public cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      console.log('[LLMService] Stream cancelled');
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get service base URL (compatible with old version)
   */
  private getBaseUrl(): string {
    return this.config.baseUrl || this.config.ollamaUrl || 'http://localhost:11434';
  }

  /**
   * Detect if it's Google Gemini OpenAI-compatible API
   * Google Gemini's endpoint path differs from standard OpenAI:
   * - OpenAI/DeepSeek: baseUrl + /v1/chat/completions
   * - Google Gemini: baseUrl + /chat/completions (baseUrl already includes /v1beta/openai)
   */
  private isGoogleGeminiApi(): boolean {
    const baseUrl = this.getBaseUrl().toLowerCase();
    return baseUrl.includes('generativelanguage.googleapis.com') ||
           baseUrl.includes('/openai');
  }

  /**
   * Get Chat Completions endpoint path
   */
  private getChatCompletionsPath(): string {
    // Google Gemini OpenAI-compatible API doesn't need /v1 prefix
    return this.isGoogleGeminiApi() ? '/chat/completions' : '/v1/chat/completions';
  }

  /**
   * Get Models endpoint path
   */
  private getModelsPath(): string {
    // Google Gemini OpenAI-compatible API doesn't need /v1 prefix
    return this.isGoogleGeminiApi() ? '/models' : '/v1/models';
  }

  /**
   * Test connection with LLM service
   */
  public async testConnection(): Promise<LLMConnectionTestResult> {
    const startTime = Date.now();

    try {
      const baseUrl = this.getBaseUrl();

      if (this.config.provider === 'openai') {
        // OpenAI-compatible API: call /models or /v1/models
        const response = await this.fetchWithTimeout(
          `${baseUrl}${this.getModelsPath()}`,
          {
            method: 'GET',
            headers: this.getOpenAIHeaders(),
          },
          10000
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const availableModels = data.data?.map((m: { id: string }) => m.id) || [];

        return {
          success: true,
          availableModels: availableModels.slice(0, 10),
          responseTime: Date.now() - startTime,
        };
      } else {
        // Ollama API: call /api/tags
        const response = await this.fetchWithTimeout(
          `${baseUrl}/api/tags`,
          { method: 'GET' },
          10000
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as OllamaModelsResponse;
        const availableModels = data.models?.map((m) => m.name) || [];

        return {
          success: true,
          availableModels,
          responseTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      const llmError = this.createLLMError(error);
      return {
        success: false,
        error: llmError.userMessage,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get list of available models
   */
  public async getAvailableModels(): Promise<string[]> {
    try {
      const result = await this.testConnection();
      return result.availableModels || [];
    } catch (error) {
      console.error('[LLMService] Failed to get models:', error);
      return [];
    }
  }

  /**
   * Summarize messages (non-streaming)
   */
  public async summarize(request: SummarizeRequest): Promise<SummarizeResponse> {
    await this.ensureConfigLoaded();
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        success: false,
        error: 'LLM feature is not enabled',
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: request.messages.length,
      };
    }

    if (request.messages.length === 0) {
      return {
        success: false,
        error: 'No messages to summarize',
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: 0,
      };
    }

    try {
      console.log(`[LLMService] Starting summarization of ${request.messages.length} messages using ${this.config.provider}`);

      // Format messages
      const formattedMessages = this.formatMessages(request.messages);

      // Build user prompt
      const userPrompt = this.buildUserPrompt(formattedMessages, request.query);

      let content: string;

      const systemPrompt = request.customPrompt || getSystemPrompt(request.language);

      if (this.config.provider === 'openai') {
        content = await this.callOpenAIChat(userPrompt, systemPrompt);
      } else {
        const chatRequest: OllamaChatRequest = {
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens,
          },
        };
        const response = await this.callOllamaChat(chatRequest);
        content = response.message.content;
      }

      console.log(`[LLMService] Summarization completed in ${Date.now() - startTime}ms`);

      return {
        success: true,
        summary: content,
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: request.messages.length,
      };
    } catch (error) {
      const llmError = this.createLLMError(error);
      console.error('[LLMService] Summarization failed:', llmError);

      return {
        success: false,
        error: llmError.userMessage,
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: request.messages.length,
      };
    }
  }

  /**
   * Summarize messages with streaming
   * Sends 'stream-chunk' events through EventEmitter
   */
  public async summarizeStream(request: SummarizeRequest): Promise<SummarizeResponse> {
    await this.ensureConfigLoaded();
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        success: false,
        error: 'LLM feature is not enabled',
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: request.messages.length,
      };
    }

    if (request.messages.length === 0) {
      return {
        success: false,
        error: 'No messages to summarize',
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: 0,
      };
    }

    // Cancel previous request
    this.cancelStream();

    // Create new AbortController
    this.abortController = new AbortController();

    try {
      console.log(`[LLMService] Starting streaming summarization of ${request.messages.length} messages using ${this.config.provider}`);

      // Format messages
      const formattedMessages = this.formatMessages(request.messages);

      // Build user prompt
      const userPrompt = this.buildUserPrompt(formattedMessages, request.query);

      let fullContent: string;

      const systemPrompt = request.customPrompt || getSystemPrompt(request.language);

      if (this.config.provider === 'openai') {
        fullContent = await this.callOpenAIChatStream(userPrompt, systemPrompt);
      } else {
        const chatRequest: OllamaChatRequest = {
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens,
          },
        };
        fullContent = await this.callOllamaChatStream(chatRequest);
      }

      console.log(`[LLMService] Streaming summarization completed in ${Date.now() - startTime}ms`);

      return {
        success: true,
        summary: fullContent,
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: request.messages.length,
      };
    } catch (error) {
      // If it's a cancellation, return specific error
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Cancelled',
          duration: Date.now() - startTime,
          model: this.config.model,
          messageCount: request.messages.length,
        };
      }

      const llmError = this.createLLMError(error);
      console.error('[LLMService] Streaming summarization failed:', llmError);

      // Send error event
      this.emit('stream-error', llmError);

      return {
        success: false,
        error: llmError.userMessage,
        duration: Date.now() - startTime,
        model: this.config.model,
        messageCount: request.messages.length,
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Get OpenAI API request headers
   */
  private getOpenAIHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  /**
   * Call OpenAI-compatible Chat API (non-streaming)
   */
  private async callOpenAIChat(userPrompt: string, systemPrompt: string): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const request: OpenAIChatRequest = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    const response = await this.fetchWithTimeout(
      `${baseUrl}${this.getChatCompletionsPath()}`,
      {
        method: 'POST',
        headers: this.getOpenAIHeaders(),
        body: JSON.stringify(request),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Call OpenAI-compatible Chat API (streaming)
   */
  private async callOpenAIChatStream(userPrompt: string, systemPrompt: string): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const request: OpenAIChatRequest = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    const response = await fetch(`${baseUrl}${this.getChatCompletionsPath()}`, {
      method: 'POST',
      headers: this.getOpenAIHeaders(),
      body: JSON.stringify(request),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = ''; // Buffer for handling incomplete data across chunks

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.emit('stream-chunk', { chunk: '', isComplete: true, fullContent });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process SSE format: split events by double newline
        const events = buffer.split('\n\n');
        // Keep the last potentially incomplete event
        buffer = events.pop() || '';

        for (const event of events) {
          // Extract data: lines (an event may consist of multiple lines)
          const dataLines = event.split('\n')
            .filter(line => line.startsWith('data: '))
            .map(line => line.slice(6)); // Remove 'data: ' prefix

          const jsonStr = dataLines.join('');

          if (!jsonStr || jsonStr === '[DONE]') {
            if (jsonStr === '[DONE]') {
              this.emit('stream-chunk', { chunk: '', isComplete: true, fullContent });
            }
            continue;
          }

          try {
            const data = JSON.parse(jsonStr) as OpenAIStreamChunk;
            const content = data.choices[0]?.delta?.content;

            if (content) {
              fullContent += content;
              this.emit('stream-chunk', {
                chunk: content,
                isComplete: false,
                fullContent,
              });
            }
          } catch {
            // Ignore parsing errors (e.g., Gemini's thought_signature and other non-standard fields)
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  /**
   * Call Ollama Chat streaming API
   */
  private async callOllamaChatStream(request: OllamaChatRequest): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Send completion event
          this.emit('stream-chunk', { chunk: '', isComplete: true, fullContent });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        // Ollama returns NDJSON format, one JSON object per line
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as OllamaChatResponse;

            if (data.message?.content) {
              fullContent += data.message.content;
              // Send streaming chunk event
              this.emit('stream-chunk', {
                chunk: data.message.content,
                isComplete: false,
                fullContent,
              });
            }

            // Check if completed
            if (data.done) {
              this.emit('stream-chunk', { chunk: '', isComplete: true, fullContent });
            }
          } catch {
            // Ignore parsing errors, might be incomplete JSON
            console.debug('[LLMService] Skipping invalid JSON line:', line);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  /**
   * Format message list into text understandable by LLM
   */
  private formatMessages(messages: MessageResult[]): string {
    const platformNames: Record<string, string> = {
      gmail: 'Gmail',
      slack: 'Slack',
      lark: 'Lark',
    };

    return messages
      .map((msg, index) => {
        const platform = platformNames[msg.platform] || msg.platform;
        const sender = msg.sender.name || msg.sender.email || 'Unknown Sender';
        const time = this.formatTimestamp(msg.timestamp);
        const channel = msg.channel ? ` [Channel: ${msg.channel}]` : '';

        return `---
[Message ${index + 1}] [Platform: ${platform}] [Sender: ${sender}] [Time: ${time}]${channel}
${msg.content || msg.snippet}
---`;
      })
      .join('\n\n');
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(formattedMessages: string, query?: string): string {
    let prompt = 'Please summarize the following messages:\n\n';

    if (query) {
      prompt += `Search keyword: "${query}"\n\n`;
    }

    prompt += `## Message List\n\n${formattedMessages}\n\n## Please output the summary`;

    return prompt;
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(timestamp: Date | string): string {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Call Ollama Chat API (non-streaming)
   */
  private async callOllamaChat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const baseUrl = this.getBaseUrl();

    const response = await this.fetchWithTimeout(
      `${baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    return (await response.json()) as OllamaChatResponse;
  }

  /**
   * Fetch request with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create LLM error object
   */
  private createLLMError(error: unknown): LLMError {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const lowerMessage = errorMessage.toLowerCase();

    // Connection errors
    if (
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('fetch failed') ||
      lowerMessage.includes('network')
    ) {
      return {
        type: LLMErrorType.SERVICE_NOT_RUNNING,
        message: errorMessage,
        userMessage: 'LLM service is not running, please check service configuration',
        retryable: true,
        suggestions: [
          'Ensure LLM service is running',
          'Check if service address is correct',
          'Check firewall settings',
        ],
      };
    }

    // Timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('aborted')) {
      return {
        type: LLMErrorType.TIMEOUT,
        message: errorMessage,
        userMessage: 'Request timeout, may be due to too many messages or slow model response',
        retryable: true,
        suggestions: ['Reduce number of messages', 'Increase timeout duration', 'Check server performance'],
      };
    }

    // Authentication errors (OpenAI)
    if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
      return {
        type: LLMErrorType.CONNECTION_ERROR,
        message: errorMessage,
        userMessage: 'API Key is invalid or unauthorized',
        retryable: false,
        suggestions: ['Check if API Key is correct', 'Confirm API Key has sufficient permissions'],
      };
    }

    // Model not found
    if (lowerMessage.includes('model') && lowerMessage.includes('not found')) {
      return {
        type: LLMErrorType.MODEL_NOT_FOUND,
        message: errorMessage,
        userMessage: `Model ${this.config.model} not found`,
        retryable: false,
        suggestions: ['Check if model name is correct', 'Confirm model is installed or available'],
      };
    }

    // Out of memory
    if (lowerMessage.includes('memory') || lowerMessage.includes('oom')) {
      return {
        type: LLMErrorType.OUT_OF_MEMORY,
        message: errorMessage,
        userMessage: 'Out of memory, cannot load model',
        retryable: false,
        suggestions: ['Close other programs to free memory', 'Use a smaller model', 'Reduce number of messages'],
      };
    }

    // Default error
    return {
      type: LLMErrorType.UNKNOWN,
      message: errorMessage,
      userMessage: `Summarization failed: ${errorMessage}`,
      retryable: true,
      suggestions: ['Check LLM service status', 'View logs for detailed information'],
    };
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    this.cancelStream();
    this.removeAllListeners();
    console.log('[LLMService] Cleaned up');
  }
}
