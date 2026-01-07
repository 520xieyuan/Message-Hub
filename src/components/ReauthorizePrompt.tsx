import React, { useState, useCallback } from 'react'
import { AlertTriangle, RefreshCw, User, Mail, MessageSquare, Zap } from 'lucide-react'
import { Button, Card, CardContent } from './ui'
import { cn } from '../utils/cn'

export interface ExpiredAccount {
  id: string
  platform: 'gmail' | 'slack' | 'lark'
  userIdentifier: string
  displayName?: string
  name?: string
  error?: string
  oauthAppName?: string // OAuth应用名称
}

export interface ReauthorizePromptProps {
  expiredAccounts: ExpiredAccount[]
  onReauthorize: (account: ExpiredAccount) => Promise<void>
  onDismiss?: () => void
  className?: string
}

export const ReauthorizePrompt: React.FC<ReauthorizePromptProps> = ({
  expiredAccounts,
  onReauthorize,
  onDismiss,
  className
}) => {
  const [reauthorizingAccounts, setReauthorizingAccounts] = useState<Set<string>>(new Set())

  // 获取平台信息
  const getPlatformInfo = (platform: string) => {
    const platformMap = {
      gmail: {
        name: 'Gmail',
        icon: Mail,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200'
      },
      slack: {
        name: 'Slack',
        icon: MessageSquare,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200'
      },
      lark: {
        name: 'Lark',
        icon: Zap,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200'
      }
    }

    return platformMap[platform as keyof typeof platformMap] || {
      name: platform,
      icon: MessageSquare,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200'
    }
  }

  // 处理重新授权
  const handleReauthorize = useCallback(async (account: ExpiredAccount) => {
    setReauthorizingAccounts(prev => new Set(prev).add(account.id))

    try {
      await onReauthorize(account)
    } catch (error) {
      console.error('重新授权失败:', error)
    } finally {
      setReauthorizingAccounts(prev => {
        const newSet = new Set(prev)
        newSet.delete(account.id)
        return newSet
      })
    }
  }, [onReauthorize])

  // 批量重新授权
  const handleReauthorizeAll = useCallback(async () => {
    const promises = expiredAccounts.map(account => handleReauthorize(account))
    await Promise.allSettled(promises)
  }, [expiredAccounts, handleReauthorize])

  if (expiredAccounts.length === 0) {
    return null
  }

  return (
    <Card className={cn('border-orange-200 bg-orange-50', className)}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* 标题 */}
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-orange-900">
                账户授权已过期
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                以下 {expiredAccounts.length} 个账户的访问令牌已过期，需要重新授权才能继续搜索。
              </p>
            </div>
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-orange-600 hover:text-orange-800 hover:bg-orange-100"
              >
                ×
              </Button>
            )}
          </div>

          {/* 过期账户列表 */}
          <div className="space-y-2">
            {expiredAccounts.map((account) => {
              const platformInfo = getPlatformInfo(account.platform)
              const PlatformIcon = platformInfo.icon
              const isReauthorizing = reauthorizingAccounts.has(account.id)

              return (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    {/* 平台图标 */}
                    <div className={cn('p-2 rounded-lg', platformInfo.bgColor)}>
                      <PlatformIcon className={cn('h-4 w-4', platformInfo.color)} />
                    </div>

                    {/* 账户信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {account.displayName || account.name || account.userIdentifier}
                        </p>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {platformInfo.name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {account.userIdentifier}
                      </p>
                      {account.error && (
                        <p className="text-xs text-orange-600 truncate">
                          {account.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 重新授权按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReauthorize(account)}
                    disabled={isReauthorizing}
                    className="flex-shrink-0 ml-3 border-orange-300 text-orange-700 hover:bg-orange-100"
                  >
                    {isReauthorizing ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        授权中...
                      </>
                    ) : (
                      <>
                        <User className="h-3 w-3 mr-1" />
                        重新授权
                      </>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2 border-t border-orange-200">
            <div className="text-xs text-orange-700">
              重新授权后即可恢复搜索功能
            </div>

            <div className="flex space-x-2">
              {expiredAccounts.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReauthorizeAll}
                  disabled={reauthorizingAccounts.size > 0}
                  className="border-orange-300 text-orange-700 hover:bg-orange-100"
                >
                  <RefreshCw className={cn(
                    'h-3 w-3 mr-1',
                    reauthorizingAccounts.size > 0 && 'animate-spin'
                  )} />
                  全部重新授权
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}