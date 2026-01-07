import React, { useState, useCallback } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from './ui'
import { cn } from '../utils/cn'
import { useLLMStore } from '../store/useLLMStore'

export interface SummaryResultProps {
  className?: string
}

export const SummaryResult: React.FC<SummaryResultProps> = ({ className }) => {
  const { status, summary, error, lastDuration, isStreaming, streamingContent, clearSummary, cancelStreaming } = useLLMStore()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isCopied, setIsCopied] = useState(false)

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    const contentToCopy = summary || streamingContent
    if (!contentToCopy) return

    try {
      await navigator.clipboard.writeText(contentToCopy)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [summary, streamingContent])

  // 关闭/隐藏
  const handleClose = useCallback(() => {
    if (isStreaming) {
      // 如果正在流式生成，先取消
      cancelStreaming()
      window.electronAPI?.llm?.cancelStream?.()
    }
    clearSummary()
  }, [clearSummary, isStreaming, cancelStreaming])

  // 切换展开/折叠
  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  // 格式化耗时
  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`
    }
    return `${(ms / 1000).toFixed(1)}s`
  }

  // 只在流式生成中、有总结或错误时显示
  if (!isStreaming && status !== 'success' && status !== 'error') {
    return null
  }

  // 流式生成中的状态
  if (isStreaming) {
    return (
      <div
        className={cn(
          'bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg overflow-hidden',
          className
        )}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
              <span className="text-lg">AI</span>
              <h4 className="text-sm font-medium text-gray-900">正在生成总结...</h4>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700"
              title="停止生成"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 流式内容区域 */}
        {streamingContent && (
          <div className="px-4 pb-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="prose prose-sm max-w-none text-gray-700">
                <MarkdownContent content={streamingContent} />
                <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-1" />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 错误状态
  if (status === 'error' && error) {
    return (
      <div
        className={cn(
          'bg-red-50 border border-red-200 rounded-lg p-4',
          className
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800">总结失败</h4>
              <p className="text-sm text-red-600 mt-1">{error.userMessage}</p>
              {error.suggestions && error.suggestions.length > 0 && (
                <ul className="text-xs text-red-500 mt-2 list-disc list-inside">
                  {error.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-red-500 hover:text-red-700 hover:bg-red-100 -mt-1 -mr-1"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // 成功状态
  return (
    <div
      className={cn(
        'bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg overflow-hidden',
        className
      )}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-purple-100/50 transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg">AI</span>
            <h4 className="text-sm font-medium text-gray-900">总结</h4>
          </div>
          {lastDuration && (
            <div className="flex items-center text-xs text-gray-500">
              <Clock className="h-3 w-3 mr-1" />
              {formatDuration(lastDuration)}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleCopy()
            }}
            className="text-gray-500 hover:text-gray-700"
            title="复制到剪贴板"
          >
            {isCopied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleClose()
            }}
            className="text-gray-500 hover:text-gray-700"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
          <button
            className="text-gray-500 hover:text-gray-700 p-1"
            title={isExpanded ? '折叠' : '展开'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      {isExpanded && summary && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="prose prose-sm max-w-none text-gray-700">
              <MarkdownContent content={summary} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 简单的 Markdown 渲染组件
 */
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  // 简单的 Markdown 解析
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let currentList: string[] = []
    let listType: 'ul' | 'ol' | null = null
    let listStartIndex = 0
    let elementCounter = 0

    const flushList = () => {
      if (currentList.length > 0) {
        const ListTag = listType === 'ol' ? 'ol' : 'ul'
        const listKey = `list-${listStartIndex}`
        elements.push(
          <ListTag
            key={listKey}
            className={cn(
              'my-2 pl-5',
              listType === 'ol' ? 'list-decimal' : 'list-disc'
            )}
          >
            {currentList.map((item, i) => (
              <li key={`${listKey}-item-${i}`} className="text-gray-700">
                {renderInline(item)}
              </li>
            ))}
          </ListTag>
        )
        currentList = []
        listType = null
      }
    }

    lines.forEach((line, index) => {
      // 标题
      if (line.startsWith('### ')) {
        flushList()
        elements.push(
          <h3 key={`h3-${index}`} className="text-base font-semibold text-gray-900 mt-4 mb-2">
            {renderInline(line.slice(4))}
          </h3>
        )
        elementCounter++
        return
      }
      if (line.startsWith('## ')) {
        flushList()
        elements.push(
          <h2 key={`h2-${index}`} className="text-lg font-semibold text-gray-900 mt-4 mb-2">
            {renderInline(line.slice(3))}
          </h2>
        )
        elementCounter++
        return
      }
      if (line.startsWith('# ')) {
        flushList()
        elements.push(
          <h1 key={`h1-${index}`} className="text-xl font-bold text-gray-900 mt-4 mb-2">
            {renderInline(line.slice(2))}
          </h1>
        )
        elementCounter++
        return
      }

      // 无序列表
      if (line.match(/^[-*]\s/)) {
        if (listType !== 'ul') {
          flushList()
          listType = 'ul'
          listStartIndex = index
        }
        currentList.push(line.slice(2))
        return
      }

      // 有序列表
      if (line.match(/^\d+\.\s/)) {
        if (listType !== 'ol') {
          flushList()
          listType = 'ol'
          listStartIndex = index
        }
        currentList.push(line.replace(/^\d+\.\s/, ''))
        return
      }

      // 空行
      if (line.trim() === '') {
        flushList()
        return
      }

      // 普通段落
      flushList()
      elements.push(
        <p key={`p-${index}`} className="my-2 text-gray-700">
          {renderInline(line)}
        </p>
      )
      elementCounter++
    })

    flushList()
    return elements
  }

  // 渲染行内元素（粗体、斜体、代码）
  const renderInline = (text: string): React.ReactNode => {
    // 简单处理粗体和代码
    const parts: React.ReactNode[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
      // 粗体 **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      // 代码 `code`
      const codeMatch = remaining.match(/`(.+?)`/)

      if (boldMatch && (!codeMatch || boldMatch.index! <= codeMatch.index!)) {
        if (boldMatch.index! > 0) {
          parts.push(remaining.slice(0, boldMatch.index))
        }
        parts.push(
          <strong key={key++} className="font-semibold">
            {boldMatch[1]}
          </strong>
        )
        remaining = remaining.slice(boldMatch.index! + boldMatch[0].length)
      } else if (codeMatch) {
        if (codeMatch.index! > 0) {
          parts.push(remaining.slice(0, codeMatch.index))
        }
        parts.push(
          <code
            key={key++}
            className="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono"
          >
            {codeMatch[1]}
          </code>
        )
        remaining = remaining.slice(codeMatch.index! + codeMatch[0].length)
      } else {
        parts.push(remaining)
        break
      }
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>
  }

  return <>{renderMarkdown(content)}</>
}
