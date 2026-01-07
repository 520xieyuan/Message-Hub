/**
 * LLM 相关的类型定义
 * 支持 Ollama 和 OpenAI 兼容的 API
 */

import type { MessageResult } from './search';

/**
 * LLM 服务提供商类型
 */
export type LLMProvider = 'ollama' | 'openai';

/**
 * AI 总结输出语言
 */
export type SummaryLanguage = 'zh-CN' | 'zh-TW' | 'en';

/**
 * 语言选项配置
 */
export const SUMMARY_LANGUAGE_OPTIONS: { value: SummaryLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
];

/**
 * LLM 服务配置
 */
export interface LLMConfig {
  /** 服务提供商类型 */
  provider: LLMProvider;
  /** 服务地址（Ollama 或 OpenAI 兼容服务的 Base URL） */
  baseUrl: string;
  /** API Key（OpenAI 兼容服务需要） */
  apiKey?: string;
  /** 使用的模型名称 */
  model: string;
  /** 最大输出 token 数 */
  maxTokens: number;
  /** 生成温度（0-2，越低越稳定） */
  temperature: number;
  /** 请求超时时间（毫秒） */
  timeout: number;
  /** 是否启用 LLM 功能 */
  enabled: boolean;

  // 兼容旧版本的字段别名
  /** @deprecated 使用 baseUrl 代替 */
  ollamaUrl?: string;
}

/**
 * 远程 LLM 配置响应（从 OAuth Server 获取）
 */
export interface RemoteLLMConfigResponse {
  success: boolean;
  data?: {
    provider: LLMProvider;
    baseUrl: string;
    apiKey?: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
    isEnabled: boolean;
  };
  error?: string;
}

/**
 * 默认 LLM 配置
 */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:7b',
  maxTokens: 2048,
  temperature: 0.3,
  timeout: 120000,
  enabled: true,
};

/**
 * 总结请求
 */
export interface SummarizeRequest {
  /** 要总结的消息列表 */
  messages: MessageResult[];
  /** 搜索关键词（可选，用于上下文） */
  query?: string;
  /** 自定义 Prompt（可选） */
  customPrompt?: string;
  /** 输出语言（可选，默认简体中文） */
  language?: SummaryLanguage;
}

/**
 * 总结响应
 */
export interface SummarizeResponse {
  /** 是否成功 */
  success: boolean;
  /** 总结内容（Markdown 格式） */
  summary?: string;
  /** 错误信息 */
  error?: string;
  /** 处理耗时（毫秒） */
  duration: number;
  /** 使用的模型 */
  model: string;
  /** 处理的消息数量 */
  messageCount: number;
}

/**
 * Ollama 模型信息
 */
export interface OllamaModel {
  /** 模型名称 */
  name: string;
  /** 模型大小 */
  size: number;
  /** 修改时间 */
  modified_at: string;
  /** 模型摘要 */
  digest: string;
}

/**
 * Ollama 模型列表响应
 */
export interface OllamaModelsResponse {
  models: OllamaModel[];
}

/**
 * Ollama Chat 请求
 */
export interface OllamaChatRequest {
  /** 模型名称 */
  model: string;
  /** 消息列表 */
  messages: OllamaChatMessage[];
  /** 是否流式返回 */
  stream: boolean;
  /** 生成选项 */
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

/**
 * Ollama Chat 消息
 */
export interface OllamaChatMessage {
  /** 角色 */
  role: 'system' | 'user' | 'assistant';
  /** 内容 */
  content: string;
}

/**
 * Ollama Chat 响应
 */
export interface OllamaChatResponse {
  /** 模型名称 */
  model: string;
  /** 创建时间 */
  created_at: string;
  /** 响应消息 */
  message: OllamaChatMessage;
  /** 是否完成 */
  done: boolean;
  /** 总耗时（纳秒） */
  total_duration?: number;
  /** 加载耗时（纳秒） */
  load_duration?: number;
  /** Prompt 评估数量 */
  prompt_eval_count?: number;
  /** 响应评估数量 */
  eval_count?: number;
}

/**
 * OpenAI 兼容的 Chat 请求
 */
export interface OpenAIChatRequest {
  /** 模型名称 */
  model: string;
  /** 消息列表 */
  messages: OpenAIChatMessage[];
  /** 是否流式返回 */
  stream?: boolean;
  /** 生成温度 */
  temperature?: number;
  /** 最大输出 token 数 */
  max_tokens?: number;
}

/**
 * OpenAI 兼容的 Chat 消息
 */
export interface OpenAIChatMessage {
  /** 角色 */
  role: 'system' | 'user' | 'assistant';
  /** 内容 */
  content: string;
}

/**
 * OpenAI 兼容的 Chat 响应
 */
export interface OpenAIChatResponse {
  /** 响应 ID */
  id: string;
  /** 对象类型 */
  object: string;
  /** 创建时间戳 */
  created: number;
  /** 模型名称 */
  model: string;
  /** 选择列表 */
  choices: OpenAIChatChoice[];
  /** 用量统计 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI 兼容的 Chat 选择
 */
export interface OpenAIChatChoice {
  /** 索引 */
  index: number;
  /** 消息 */
  message: OpenAIChatMessage;
  /** 结束原因 */
  finish_reason: string | null;
  /** 流式响应的增量内容 */
  delta?: {
    role?: string;
    content?: string;
  };
}

/**
 * OpenAI 兼容的流式响应块
 */
export interface OpenAIStreamChunk {
  /** 响应 ID */
  id: string;
  /** 对象类型 */
  object: string;
  /** 创建时间戳 */
  created: number;
  /** 模型名称 */
  model: string;
  /** 选择列表 */
  choices: OpenAIChatChoice[];
}

/**
 * 连接测试结果
 */
export interface LLMConnectionTestResult {
  /** 是否连接成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 可用模型列表 */
  availableModels?: string[];
  /** 响应时间（毫秒） */
  responseTime?: number;
}

/**
 * LLM 错误类型
 */
export enum LLMErrorType {
  /** 连接错误 */
  CONNECTION_ERROR = 'LLM_CONNECTION_ERROR',
  /** 模型未找到 */
  MODEL_NOT_FOUND = 'LLM_MODEL_NOT_FOUND',
  /** 请求超时 */
  TIMEOUT = 'LLM_TIMEOUT',
  /** 服务未运行 */
  SERVICE_NOT_RUNNING = 'LLM_SERVICE_NOT_RUNNING',
  /** 内存不足 */
  OUT_OF_MEMORY = 'LLM_OUT_OF_MEMORY',
  /** 消息过长 */
  MESSAGE_TOO_LONG = 'LLM_MESSAGE_TOO_LONG',
  /** 未知错误 */
  UNKNOWN = 'LLM_UNKNOWN_ERROR',
}

/**
 * LLM 错误
 */
export interface LLMError {
  /** 错误类型 */
  type: LLMErrorType;
  /** 错误消息 */
  message: string;
  /** 用户友好的错误消息 */
  userMessage: string;
  /** 是否可重试 */
  retryable: boolean;
  /** 建议的解决方案 */
  suggestions?: string[];
}

/**
 * 总结状态
 */
export type SummaryStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * LLM Store 状态
 */
export interface LLMStoreState {
  /** LLM 配置 */
  config: LLMConfig;
  /** 当前总结状态 */
  status: SummaryStatus;
  /** 当前总结内容 */
  summary: string | null;
  /** 当前错误 */
  error: LLMError | null;
  /** 上次总结耗时 */
  lastDuration: number | null;
  /** 是否正在测试连接 */
  isTesting: boolean;
  /** 可用模型列表 */
  availableModels: string[];
}
