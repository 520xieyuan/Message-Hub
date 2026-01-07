import React, { useState } from 'react'
import { ExternalLink, User, Calendar, MessageSquare, Mail, Zap, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, Badge, Button } from './ui'
import { cn } from '../utils/cn'
import { MessageResult } from '../types/search'

export interface MessageCardProps {
  message: MessageResult
  onOpenSource?: (message: MessageResult) => void
  className?: string
  showPlatformIcon?: boolean
  showTimestamp?: boolean
  maxContentLength?: number
  searchQuery?: string
  highlightMatches?: boolean
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  onOpenSource,
  className,
  showPlatformIcon = true,
  showTimestamp = true,
  maxContentLength = 200,
  searchQuery = '',
  highlightMatches = true
}) => {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // 获取平台信息
  const getPlatformInfo = (platform: string) => {
    const platformMap = {
      slack: {
        name: 'Slack',
        icon: MessageSquare,
        color: 'bg-purple-100 text-purple-800',
        bgColor: 'bg-purple-50'
      },
      gmail: {
        name: 'Gmail',
        icon: Mail,
        color: 'bg-red-100 text-red-800',
        bgColor: 'bg-red-50'
      },
      lark: {
        name: 'Lark',
        icon: Zap,
        color: 'bg-blue-100 text-blue-800',
        bgColor: 'bg-blue-50'
      }
    }
    
    return platformMap[platform as keyof typeof platformMap] || {
      name: platform,
      icon: MessageSquare,
      color: 'bg-gray-100 text-gray-800',
      bgColor: 'bg-gray-50'
    }
  }

  const platformInfo = getPlatformInfo(message.platform)
  const PlatformIcon = platformInfo.icon

  // 格式化时间
  const formatTimestamp = (timestamp: Date) => {
    const now = new Date()
    const messageTime = new Date(timestamp)
    const diff = now.getTime() - messageTime.getTime()
    
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) {
      return '刚刚'
    } else if (minutes < 60) {
      return `${minutes}分钟前`
    } else if (hours < 24) {
      return `${hours}小时前`
    } else if (days < 7) {
      return `${days}天前`
    } else {
      return messageTime.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }
  }

  // 截断内容
  const truncateContent = (content: string, maxLength: number) => {
    if (content.length <= maxLength) {
      return content
    }
    return content.substring(0, maxLength - 3) + '...'
  }

  // 处理打开消息源
  const handleOpenSource = () => {
    if (onOpenSource) {
      onOpenSource(message)
    } else {
      // 默认行为：打开深度链接
      if (message.deepLink) {
        window.open(message.deepLink, '_blank')
      }
    }
  }

  // 复制消息内容
  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 高亮搜索关键词
  const highlightContent = (content: string) => {
    if (!highlightMatches || !searchQuery.trim()) {
      return content
    }

    // 清理搜索查询，移除特殊语法
    const cleanQuery = searchQuery
      .replace(/(?:from:|@|after:|before:|type:)[^\s]+/gi, '')
      .replace(/['"]/g, '')
      .trim()

    if (!cleanQuery) {
      return content
    }

    // 分割关键词
    const keywords = cleanQuery.split(/\s+/).filter(k => k.length > 1)
    
    if (keywords.length === 0) {
      return content
    }

    // 创建正则表达式进行高亮
    const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    
    const parts = content.split(regex)
    
    return (
      <span>
        {parts.map((part, index) => {
          const isMatch = keywords.some(keyword => 
            part.toLowerCase() === keyword.toLowerCase()
          )
          
          return isMatch ? (
            <mark key={index} className="bg-yellow-200 text-yellow-900 px-1 rounded">
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          )
        })}
      </span>
    )
  }

  return (
    <Card className={cn('hover:shadow-md transition-shadow duration-200 pt-4 w-full max-w-full min-w-0', className)}>
      <CardContent className="p-4 w-full min-w-0">
        <div className="space-y-3 w-full min-w-0">
          {/* 头部信息 */}
          <div className="flex items-start justify-between w-full">
            <div className="flex items-center space-x-3 min-w-0 flex-1 overflow-hidden">
              {/* 发送人头像 */}
              <div className="flex-shrink-0">
                {message.sender.avatar ? (
                  <img
                    src={message.sender.avatar}
                    alt={message.sender.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-4 w-4 text-gray-500" />
                  </div>
                )}
              </div>

              {/* 发送人信息 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {message.sender.displayName || message.sender.name}
                  </h4>
                  {showPlatformIcon && (
                    <Badge variant="secondary" size="sm" className={platformInfo.color}>
                      <PlatformIcon className="h-3 w-3 mr-1" />
                      {platformInfo.name}
                    </Badge>
                  )}
                </div>
                
                {/* 频道/会话信息 */}
                {message.channel && (
                  <p className="text-xs text-gray-500 truncate">
                    {message.channel}
                  </p>
                )}
              </div>
            </div>

            {/* 时间戳 */}
            {showTimestamp && (
              <div className="flex items-center text-xs text-gray-500 flex-shrink-0 ml-2">
                <Calendar className="h-3 w-3 mr-1" />
                {formatTimestamp(message.timestamp)}
              </div>
            )}
          </div>

          {/* 消息内容 */}
          <div className="space-y-2 w-full">
            {/* Gmail 邮件主题 */}
            {message.platform === 'gmail' && message.metadata?.subject && (
              <div className="text-sm font-semibold text-gray-900 break-words">
                {message.metadata.subject}
              </div>
            )}
            
            <div className="text-sm text-gray-900 leading-relaxed break-words whitespace-pre-wrap w-full overflow-hidden">
              {isExpanded 
                ? highlightContent(message.content)
                : highlightContent(truncateContent(message.content, maxContentLength))
              }
            </div>
            
            {/* 展开/收起按钮 */}
            {message.content.length > maxContentLength && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    展开全文
                  </>
                )}
              </button>
            )}
            
            {/* 消息摘要（如果与内容不同） */}
            {message.snippet && message.snippet !== message.content && (
              <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                <span className="font-medium">摘要: </span>
                {message.snippet}
              </div>
            )}
          </div>

          {/* 附件信息 */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {message.attachments.map((attachment, index) => (
                <Badge key={attachment.id || index} variant="outline" size="sm">
                  📎 {attachment.name}
                </Badge>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 w-full flex-wrap gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 消息类型标识 */}
              <Badge variant="outline" size="sm" className="flex-shrink-0">
                {message.messageType === 'text' && '💬 文本'}
                {message.messageType === 'file' && '📁 文件'}
                {message.messageType === 'image' && '🖼️ 图片'}
                {message.messageType === 'other' && '📄 其他'}
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 复制按钮 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyContent}
                className="h-8 px-2 flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>

              {/* 打开消息源按钮 */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSource}
                className="h-8 px-3 flex-shrink-0"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                打开消息源
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}