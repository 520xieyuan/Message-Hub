import React, { useCallback, useEffect, useRef } from 'react'
import { Sparkles, RefreshCw, AlertCircle, StopCircle, ChevronDown } from 'lucide-react'
import { Button } from './ui'
import { cn } from '../utils/cn'
import { useLLMStore } from '../store/useLLMStore'
import { useSearchStore } from '../store/useSearchStore'
import type { LLMErrorType, SummaryLanguage } from '../types/llm'
import { SUMMARY_LANGUAGE_OPTIONS } from '../types/llm'

export interface SummaryButtonProps {
  className?: string
  disabled?: boolean
}

export const SummaryButton: React.FC<SummaryButtonProps> = ({
  className,
  disabled = false,
}) => {
  const { searchResults, isSearching } = useSearchStore()
  const {
    status,
    config,
    isStreaming,
    summaryLanguage,
    setSummaryLanguage,
    startStreaming,
    updateStreamingContent,
    completeStreaming,
    failSummarizing,
    clearSummary,
    cancelStreaming,
  } = useLLMStore()

  // 用于追踪开始时间
  const startTimeRef = useRef<number>(0)

  const isLoading = status === 'loading'
  const hasError = status === 'error'
  const hasSuccess = status === 'success'

  // 是否可以点击
  const canSummarize =
    !disabled &&
    !isSearching &&
    !isLoading &&
    searchResults.length > 0 &&
    config.enabled

  // 设置流式监听器
  useEffect(() => {
    // 检查 API 是否可用
    if (!window.electronAPI?.llm?.onStreamChunk) {
      console.warn('[SummaryButton] Streaming API not available')
      return
    }

    // 监听流式响应
    const handleStreamChunk = (data: { chunk: string; isComplete: boolean; fullContent: string }) => {
      if (data.isComplete) {
        const duration = Date.now() - startTimeRef.current
        completeStreaming(duration)
      } else {
        updateStreamingContent(data.fullContent)
      }
    }

    window.electronAPI.llm.onStreamChunk(handleStreamChunk)

    // 清理函数
    return () => {
      window.electronAPI?.llm?.offStreamChunk?.()
    }
  }, [updateStreamingContent, completeStreaming])

  // 执行流式总结
  const handleSummarize = useCallback(async () => {
    if (!canSummarize) return

    // 如果已经有总结结果，先清除
    if (hasSuccess) {
      clearSummary()
    }

    startTimeRef.current = Date.now()
    startStreaming()

    try {
      const response = await window.electronAPI?.llm?.summarizeStream?.({
        messages: searchResults,
        query: useSearchStore.getState().currentQuery,
        language: summaryLanguage,
      })

      // 流式响应完成后，结果会通过事件回调处理
      // 这里只处理错误情况
      if (response && !response.success) {
        const errorMessage = response.error || '总结失败'
        const isServiceNotRunning = errorMessage.includes('Ollama 服务未运行') || errorMessage.includes('fetch failed')

        failSummarizing({
          type: isServiceNotRunning ? 'LLM_SERVICE_NOT_RUNNING' as LLMErrorType : 'LLM_UNKNOWN_ERROR' as LLMErrorType,
          message: errorMessage,
          userMessage: errorMessage,
          retryable: true,
          suggestions: isServiceNotRunning
            ? ['确保 Ollama 服务正在运行', '检查服务地址是否正确', '检查防火墙设置']
            : ['检查 LLM 服务配置', '查看日志获取详细信息'],
        })
      }
    } catch (error) {
      failSummarizing({
        type: 'LLM_UNKNOWN_ERROR' as LLMErrorType,
        message: error instanceof Error ? error.message : '未知错误',
        userMessage: '总结失败，请检查 LLM 服务配置',
        retryable: true,
        suggestions: ['检查 LLM 服务配置', '确保网络连接正常'],
      })
    }
  }, [
    canSummarize,
    hasSuccess,
    searchResults,
    summaryLanguage,
    startStreaming,
    failSummarizing,
    clearSummary,
  ])

  // 取消流式请求
  const handleCancel = useCallback(async () => {
    try {
      await window.electronAPI?.llm?.cancelStream?.()
      cancelStreaming()
    } catch (error) {
      console.error('Failed to cancel stream:', error)
    }
  }, [cancelStreaming])

  // 重新总结
  const handleRetry = useCallback(() => {
    clearSummary()
    handleSummarize()
  }, [clearSummary, handleSummarize])

  // 获取按钮文本
  const getButtonText = () => {
    if (isStreaming) return '正在生成...'
    if (isLoading) return '正在总结...'
    if (hasError) return '重试'
    if (hasSuccess) return '重新总结'
    return 'AI 总结'
  }

  // 获取按钮图标
  const getButtonIcon = () => {
    if (isStreaming || isLoading) return null
    if (hasError) return <AlertCircle className="h-4 w-4 mr-1.5" />
    if (hasSuccess) return <RefreshCw className="h-4 w-4 mr-1.5" />
    return <Sparkles className="h-4 w-4 mr-1.5" />
  }

  // 获取禁用提示
  const getDisabledReason = () => {
    if (!config.enabled) return 'LLM 功能未启用'
    if (isSearching) return '搜索进行中'
    if (searchResults.length === 0) return '无搜索结果'
    return ''
  }

  const disabledReason = getDisabledReason()

  // 如果正在流式生成，显示取消按钮
  if (isStreaming) {
    return (
      <Button
        variant="danger"
        size="sm"
        onClick={handleCancel}
        className={cn('whitespace-nowrap', className)}
      >
        <StopCircle className="h-4 w-4 mr-1.5" />
        停止生成
      </Button>
    )
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* 语言选择下拉菜单 */}
      <div className="relative">
        <select
          value={summaryLanguage}
          onChange={(e) => setSummaryLanguage(e.target.value as SummaryLanguage)}
          disabled={isLoading || isStreaming}
          className="appearance-none bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs px-2 py-1.5 pr-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          title="选择总结语言"
        >
          {SUMMARY_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500 pointer-events-none" />
      </div>

      {/* AI 总结按钮 */}
      <Button
        variant={hasError ? 'danger' : hasSuccess ? 'outline' : 'primary'}
        size="sm"
        onClick={hasSuccess ? handleRetry : handleSummarize}
        loading={isLoading}
        disabled={!canSummarize}
        className="whitespace-nowrap"
        title={disabledReason || undefined}
      >
        {getButtonIcon()}
        {getButtonText()}
      </Button>
    </div>
  )
}
