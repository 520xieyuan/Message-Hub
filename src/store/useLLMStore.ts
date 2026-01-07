import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import {
  LLMConfig,
  DEFAULT_LLM_CONFIG,
  SummaryStatus,
  LLMError,
  SummaryLanguage,
} from '../types/llm'

interface LLMState {
  // 配置状态
  config: LLMConfig

  // 总结语言偏好
  summaryLanguage: SummaryLanguage

  // 总结状态
  status: SummaryStatus
  summary: string | null
  error: LLMError | null
  lastDuration: number | null

  // 流式状态
  isStreaming: boolean
  streamingContent: string

  // 连接测试状态
  isTesting: boolean
  availableModels: string[]

  // Actions
  setConfig: (config: LLMConfig) => void
  updateConfig: (updates: Partial<LLMConfig>) => void
  setSummaryLanguage: (language: SummaryLanguage) => void

  setStatus: (status: SummaryStatus) => void
  setSummary: (summary: string | null) => void
  setError: (error: LLMError | null) => void
  setLastDuration: (duration: number | null) => void

  setIsTesting: (testing: boolean) => void
  setAvailableModels: (models: string[]) => void

  // 复合 Actions
  startSummarizing: () => void
  completeSummarizing: (summary: string, duration: number) => void
  failSummarizing: (error: LLMError) => void
  clearSummary: () => void
  reset: () => void

  // 流式 Actions
  startStreaming: () => void
  updateStreamingContent: (content: string) => void
  appendStreamingChunk: (chunk: string) => void
  completeStreaming: (duration: number) => void
  cancelStreaming: () => void
}

export const useLLMStore = create<LLMState>()(
  devtools(
    persist(
      (set, get) => ({
        // 初始状态
        config: DEFAULT_LLM_CONFIG,
        summaryLanguage: 'zh-CN' as SummaryLanguage,
        status: 'idle',
        summary: null,
        error: null,
        lastDuration: null,
        isStreaming: false,
        streamingContent: '',
        isTesting: false,
        availableModels: [],

        // 配置 Actions
        setConfig: (config) => set({ config }),

        updateConfig: (updates) =>
          set((state) => ({
            config: { ...state.config, ...updates },
          })),

        setSummaryLanguage: (language) => set({ summaryLanguage: language }),

        // 状态 Actions
        setStatus: (status) => set({ status }),
        setSummary: (summary) => set({ summary }),
        setError: (error) => set({ error }),
        setLastDuration: (duration) => set({ lastDuration: duration }),

        // 测试 Actions
        setIsTesting: (testing) => set({ isTesting: testing }),
        setAvailableModels: (models) => set({ availableModels: models }),

        // 复合 Actions
        startSummarizing: () =>
          set({
            status: 'loading',
            error: null,
          }),

        completeSummarizing: (summary, duration) =>
          set({
            status: 'success',
            summary,
            lastDuration: duration,
            error: null,
          }),

        failSummarizing: (error) =>
          set({
            status: 'error',
            error,
            isStreaming: false,
          }),

        clearSummary: () =>
          set({
            status: 'idle',
            summary: null,
            error: null,
            lastDuration: null,
            isStreaming: false,
            streamingContent: '',
          }),

        reset: () =>
          set({
            status: 'idle',
            summary: null,
            error: null,
            lastDuration: null,
            isTesting: false,
            isStreaming: false,
            streamingContent: '',
          }),

        // 流式 Actions
        startStreaming: () =>
          set({
            status: 'loading',
            isStreaming: true,
            streamingContent: '',
            error: null,
            summary: null,
          }),

        updateStreamingContent: (content) =>
          set({
            streamingContent: content,
          }),

        appendStreamingChunk: (chunk) =>
          set((state) => ({
            streamingContent: state.streamingContent + chunk,
          })),

        completeStreaming: (duration) => {
          const state = get()
          set({
            status: 'success',
            isStreaming: false,
            summary: state.streamingContent,
            lastDuration: duration,
            error: null,
          })
        },

        cancelStreaming: () =>
          set({
            status: 'idle',
            isStreaming: false,
            streamingContent: '',
            error: null,
          }),
      }),
      {
        name: 'llm-store',
        // 持久化配置和语言偏好
        partialize: (state) => ({
          config: state.config,
          summaryLanguage: state.summaryLanguage,
        }),
      }
    ),
    {
      name: 'llm-store',
    }
  )
)
