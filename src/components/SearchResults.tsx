import React, { useCallback, useEffect, useRef } from 'react'
import { AlertCircle, Search, RefreshCw, ChevronDown } from 'lucide-react'
import { Button, LoadingSpinner, Badge } from './ui'
import { MessageCard } from './MessageCard'
import { SummaryButton } from './SummaryButton'
import { SummaryResult } from './SummaryResult'
import { cn } from '../utils/cn'
import { MessageResult, PlatformSearchStatus } from '../types/search'
import { useSearchStore } from '../store/useSearchStore'
import { useLLMStore } from '../store/useLLMStore'

export interface SearchResultsProps {
  results: MessageResult[]
  totalCount: number
  hasMore: boolean
  searchTime: number
  platformStatus?: Record<string, PlatformSearchStatus>
  isLoading?: boolean
  error?: string | null
  onLoadMore?: () => void
  onRetry?: () => void
  onOpenMessage?: (message: MessageResult) => void
  className?: string
  showPlatformStatus?: boolean
  showSearchSummary?: boolean
  enableInfiniteScroll?: boolean
  currentPage?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  paginationMode?: 'infinite' | 'pages'
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  totalCount,
  hasMore,
  searchTime,
  platformStatus = {},
  isLoading = false,
  error = null,
  onLoadMore,
  onRetry,
  onOpenMessage,
  className,
  showPlatformStatus = true,
  showSearchSummary = true,
  enableInfiniteScroll = true,
  currentPage = 1,
  pageSize = 100,
  onPageChange,
  paginationMode = 'infinite'
}) => {
  const { currentQuery, isSearching } = useSearchStore()
  const { status: summaryStatus, isStreaming, clearSummary } = useLLMStore()
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  // 当搜索结果变化时，清除之前的总结
  useEffect(() => {
    if (isSearching) {
      clearSummary()
    }
  }, [isSearching, clearSummary])

  // 无限滚动处理
  useEffect(() => {
    if (!enableInfiniteScroll || !hasMore || isLoading || isLoadingMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && onLoadMore) {
          setIsLoadingMore(true)
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [enableInfiniteScroll, hasMore, isLoading, isLoadingMore, onLoadMore])

  // 重置加载更多状态
  useEffect(() => {
    if (!isLoading) {
      setIsLoadingMore(false)
    }
  }, [isLoading])

  // 处理消息打开
  const handleOpenMessage = useCallback((message: MessageResult) => {
    if (onOpenMessage) {
      onOpenMessage(message)
    } else {
      // 默认行为：打开深度链接
      if (message.deepLink) {
        window.open(message.deepLink, '_blank')
      }
    }
  }, [onOpenMessage])

  // 格式化搜索时间
  const formatSearchTime = (timeMs: number) => {
    if (timeMs < 1000) {
      return `${timeMs}ms`
    } else {
      return `${(timeMs / 1000).toFixed(1)}s`
    }
  }

  // 获取平台状态统计
  const getPlatformStats = () => {
    const statuses = Object.values(platformStatus)
    const successful = statuses.filter(s => s.success).length
    const failed = statuses.filter(s => !s.success).length
    const total = statuses.length

    return { successful, failed, total }
  }

  const platformStats = getPlatformStats()

  // 错误状态
  if (error && !isLoading) {
    return (
      <div className={cn('w-full space-y-4', className)}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">搜索出错</h3>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              {onRetry && (
                <Button onClick={onRetry} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重试
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 加载状态
  if (isLoading && results.length === 0) {
    return (
      <div className={cn('w-full space-y-4', className)}>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" text="正在搜索..." />
        </div>
      </div>
    )
  }

  // 无结果状态
  if (!isLoading && results.length === 0 && currentQuery) {
    return (
      <div className={cn('w-full space-y-4', className)}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4 max-w-md">
            <Search className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">未找到相关消息</h3>
              <p className="text-sm text-gray-600">
                尝试使用不同的关键词或调整搜索筛选条件
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 初始状态（无搜索）
  if (!currentQuery && results.length === 0) {
    return (
      <div className={cn('w-full space-y-4', className)}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4 max-w-md">
            <Search className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">开始搜索</h3>
              <p className="text-sm text-gray-600">
                在上方输入关键词来搜索您的消息
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* 搜索摘要 */}
      {showSearchSummary && results.length > 0 && (
        <div className="w-full bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
            <div className="flex items-center gap-4 flex-wrap min-w-0">
              <div className="whitespace-nowrap">
                <span className="text-sm text-gray-600">找到 </span>
                <span className="font-medium text-gray-900">{totalCount}</span>
                <span className="text-sm text-gray-600"> 条结果</span>
              </div>
              <div className="text-sm text-gray-500 whitespace-nowrap">
                用时 {formatSearchTime(searchTime)}
              </div>
            </div>

            {/* 平台状态和 AI 总结按钮 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {showPlatformStatus && platformStats.total > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">
                    {platformStats.successful} 成功
                  </Badge>
                  {platformStats.failed > 0 && (
                    <Badge variant="danger" size="sm">
                      {platformStats.failed} 失败
                    </Badge>
                  )}
                </div>
              )}
              {/* AI 总结按钮 */}
              <SummaryButton disabled={isLoading} />
            </div>
          </div>

          {/* 平台详细状态 */}
          {showPlatformStatus && Object.keys(platformStatus).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {Object.entries(platformStatus).map(([platform, status]) => (
                  <div
                    key={platform}
                    className={cn(
                      'flex items-center space-x-1 px-2 py-1 rounded text-xs',
                      status.success
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    )}
                  >
                    <span className="font-medium capitalize">{platform}</span>
                    <span>({status.resultCount})</span>
                    {!status.success && status.error && (
                      <span title={status.error}>⚠️</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI 总结结果 */}
      {(isStreaming || summaryStatus === 'success' || summaryStatus === 'error') && (
        <SummaryResult />
      )}

      {/* 搜索结果列表 */}
      <div className="w-full space-y-3">
        {results.map((message, index) => (
          <MessageCard
            key={`${message.platform}-${message.id}-${index}`}
            message={message}
            onOpenSource={handleOpenMessage}
            searchQuery={currentQuery}
          />
        ))}
      </div>

      {/* 分页控制 */}
      {paginationMode === 'infinite' ? (
        // 无限滚动模式
        <>
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {isLoadingMore ? (
                <LoadingSpinner size="md" text="加载更多..." />
              ) : (
                onLoadMore && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsLoadingMore(true)
                      onLoadMore()
                    }}
                    disabled={isLoading}
                  >
                    <ChevronDown className="h-4 w-4 mr-2" />
                    加载更多结果
                  </Button>
                )
              )}
            </div>
          )}

          {/* 结果结束提示 */}
          {!hasMore && results.length > 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">已显示所有搜索结果</p>
            </div>
          )}
        </>
      ) : (
        // 分页模式
        hasMore && totalCount > pageSize && (
          <div className="flex justify-center items-center space-x-4 py-6">
            <div className="flex items-center space-x-2">
              {/* 上一页 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
              >
                上一页
              </Button>

              {/* 页码显示 */}
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, Math.ceil(totalCount / pageSize)) }, (_, i) => {
                  const pageNum = currentPage - 2 + i
                  if (pageNum < 1 || pageNum > Math.ceil(totalCount / pageSize)) return null

                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => onPageChange?.(pageNum)}
                      disabled={isLoading}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>

              {/* 下一页 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalCount / pageSize) || isLoading}
              >
                下一页
              </Button>
            </div>

            {/* 页面信息 */}
            <div className="text-sm text-gray-500">
              第 {currentPage} 页，共 {Math.ceil(totalCount / pageSize)} 页
            </div>
          </div>
        )
      )}
    </div>
  )
}