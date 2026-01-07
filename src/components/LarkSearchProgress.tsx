import React, { useState, useEffect, useCallback } from 'react'
import { LarkSearchProgress as LarkSearchProgressType } from '../types/platform'

interface LarkSearchProgressProps {
  /** 是否显示组件 */
  isVisible: boolean
  /** 关闭回调 */
  onClose?: () => void
}

/**
 * 飞书搜索进度显示组件
 * 通过 IPC 监听搜索进度事件并实时显示
 */
export const LarkSearchProgress: React.FC<LarkSearchProgressProps> = ({
  isVisible,
  onClose
}) => {
  const [progress, setProgress] = useState<LarkSearchProgressType | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)

  // 监听搜索进度事件
  useEffect(() => {
    if (!isVisible) {
      setProgress(null)
      return
    }

    const handleProgress = (progressData: LarkSearchProgressType) => {
      setProgress(progressData)

      // 搜索完成或出错后自动隐藏（延迟 3 秒）
      if (progressData.stage === 'completed' || progressData.stage === 'error') {
        setTimeout(() => {
          setProgress(null)
          onClose?.()
        }, 3000)
      }
    }

    // 注册监听器
    if (window.electronAPI?.on) {
      window.electronAPI.on('lark:search-progress', handleProgress)
    }

    return () => {
      // 清理监听器
      if (window.electronAPI?.off) {
        window.electronAPI.off('lark:search-progress', handleProgress)
      }
    }
  }, [isVisible, onClose])

  // 获取阶段显示文本
  const getStageText = useCallback((stage: LarkSearchProgressType['stage']): string => {
    switch (stage) {
      case 'fetching_chats':
        return '获取会话列表...'
      case 'searching':
        return '搜索消息中...'
      case 'completed':
        return '搜索完成'
      case 'error':
        return '搜索出错'
      default:
        return '搜索中...'
    }
  }, [])

  // 获取阶段图标
  const getStageIcon = useCallback((stage: LarkSearchProgressType['stage']): string => {
    switch (stage) {
      case 'fetching_chats':
        return '📋'
      case 'searching':
        return '🔍'
      case 'completed':
        return '✅'
      case 'error':
        return '❌'
      default:
        return '⏳'
    }
  }, [])

  // 获取进度条颜色
  const getProgressBarColor = useCallback((stage: LarkSearchProgressType['stage']): string => {
    switch (stage) {
      case 'completed':
        return 'bg-green-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-blue-500'
    }
  }, [])

  if (!isVisible || !progress) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{getStageIcon(progress.stage)}</span>
            <span className="font-medium text-sm text-gray-700">
              飞书搜索
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {progress.percentage}%
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? '▼' : '▲'}
            </button>
          </div>
        </div>

        {/* 进度条 */}
        <div className="h-1 bg-gray-200">
          <div
            className={`h-full transition-all duration-300 ${getProgressBarColor(progress.stage)}`}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>

        {/* 详细信息 */}
        {isExpanded && (
          <div className="px-4 py-3 space-y-2">
            {/* 当前状态 */}
            <div className="text-sm text-gray-600">
              {getStageText(progress.stage)}
            </div>

            {/* 账户信息 */}
            {progress.currentAccount && (
              <div className="text-xs text-gray-500">
                账户: {progress.currentAccount}
              </div>
            )}

            {/* 当前会话 */}
            {progress.currentChat && progress.stage === 'searching' && (
              <div className="text-xs text-gray-500 truncate">
                正在搜索: {progress.currentChat}
              </div>
            )}

            {/* 进度统计 */}
            {progress.stage === 'searching' && progress.totalChats > 0 && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  会话: {progress.processedChats} / {progress.totalChats}
                </span>
                <span>
                  已找到: {progress.foundMessages} 条
                </span>
              </div>
            )}

            {/* 完成统计 */}
            {progress.stage === 'completed' && (
              <div className="text-sm text-green-600 font-medium">
                共找到 {progress.foundMessages} 条消息
              </div>
            )}

            {/* 错误信息 */}
            {progress.stage === 'error' && progress.error && (
              <div className="text-sm text-red-600">
                {progress.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default LarkSearchProgress
