import React, { useState } from 'react'
import { User, Mail, MessageSquare, Zap, Settings, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button, LoadingSpinner } from './ui'
import { cn } from '../utils/cn'

export interface Account {
  id: string
  platform: 'gmail' | 'slack' | 'lark'
  userIdentifier: string
  displayName?: string
  name?: string
  avatar?: string
  enabled: boolean
  connectionStatus: 'connected' | 'disconnected' | 'error'
  lastChecked?: Date
  error?: string
}

export interface AccountSelectorProps {
  accounts: Account[]
  selectedAccounts: string[]
  onAccountToggle: (accountId: string, enabled: boolean) => void
  onBatchSelect?: (accountIds: string[]) => void
  onRefreshAccounts?: () => void
  onManageAccounts?: () => void
  loading?: boolean
  className?: string
  showHeader?: boolean
  showManageButton?: boolean
}

export const AccountSelector: React.FC<AccountSelectorProps> = ({
  accounts,
  selectedAccounts,
  onAccountToggle,
  onBatchSelect,
  onRefreshAccounts,
  onManageAccounts,
  loading = false,
  className,
  showHeader = true,
  showManageButton = true
}) => {
  const [localLoading, setLocalLoading] = useState(false)

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

  // 处理账户切换
  const handleAccountToggle = (accountId: string, isCurrentlySelected: boolean) => {
    // isCurrentlySelected 是当前选中状态，我们要切换到相反状态
    const newEnabled = !isCurrentlySelected
    onAccountToggle(accountId, newEnabled)
  }

  // 处理刷新账户
  const handleRefresh = async () => {
    if (onRefreshAccounts) {
      setLocalLoading(true)
      try {
        await onRefreshAccounts()
      } finally {
        setLocalLoading(false)
      }
    }
  }

  // 获取连接状态显示
  const getConnectionStatusDisplay = (status: Account['connectionStatus'], error?: string) => {
    switch (status) {
      case 'connected':
        return {
          text: '已连接',
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          icon: '●'
        }
      case 'disconnected':
        return {
          text: '未连接',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: '○'
        }
      case 'error':
        return {
          text: error ? '连接错误' : '连接失败',
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          icon: '⚠'
        }
      default:
        return {
          text: '未知',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: '?'
        }
    }
  }

  // 按平台分组账户
  const groupedAccounts = accounts.reduce((groups, account) => {
    const platform = account.platform
    if (!groups[platform]) {
      groups[platform] = []
    }
    groups[platform].push(account)
    return groups
  }, {} as Record<string, Account[]>)

  // 获取选中账户统计
  const selectedCount = selectedAccounts.length
  const totalCount = accounts.length
  const connectedCount = accounts.filter(acc => acc.connectionStatus === 'connected').length

  if (loading || localLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <LoadingSpinner size="md" text="加载账户信息..." />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg">选择搜索账户</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                已选择 {selectedCount}/{totalCount} 个账户 ({connectedCount} 个已连接)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onRefreshAccounts && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={localLoading}
                  title="刷新账户状态"
                >
                  <RefreshCw className={cn('h-4 w-4', localLoading && 'animate-spin')} />
                </Button>
              )}
              {showManageButton && onManageAccounts && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onManageAccounts}
                  title="管理账户"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  管理
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      )}

      <CardContent className="space-y-4">
        {accounts.length === 0 ? (
          <div className="text-center py-8">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无账户</h3>
            <p className="text-sm text-gray-600 mb-4">
              您还没有添加任何搜索账户
            </p>
            {onManageAccounts && (
              <Button onClick={onManageAccounts} size="sm">
                <Settings className="h-4 w-4 mr-1" />
                添加账户
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedAccounts).map(([platform, platformAccounts]) => {
              const platformInfo = getPlatformInfo(platform)
              const PlatformIcon = platformInfo.icon

              return (
                <div key={platform} className="space-y-2">
                  {/* 平台标题 */}
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-100">
                    <PlatformIcon className={cn('h-4 w-4', platformInfo.color)} />
                    <span className="font-medium text-gray-900">{platformInfo.name}</span>
                    <span className="text-sm text-gray-500">
                      ({platformAccounts.length})
                    </span>
                  </div>

                  {/* 账户列表 */}
                  <div className="space-y-2">
                    {platformAccounts.map((account) => {
                      const isSelected = selectedAccounts.includes(account.id)
                      const connectionStatus = getConnectionStatusDisplay(
                        account.connectionStatus,
                        account.error
                      )
                      const isDisabled = false // 允许用户选择任何账户，不管连接状态

                      return (
                        <div
                          key={account.id}
                          className={cn(
                            'flex items-center justify-between p-2 rounded-lg border transition-colors',
                            isSelected && !isDisabled
                              ? `${platformInfo.bgColor} ${platformInfo.borderColor}`
                              : 'bg-white border-gray-200 hover:bg-gray-50',
                            isDisabled && 'opacity-60'
                          )}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            {/* 账户头像 */}
                            <div className="flex-shrink-0">
                              {account.avatar ? (
                                <img
                                  src={account.avatar}
                                  alt={account.displayName || account.name || account.userIdentifier}
                                  className="h-6 w-6 rounded-full object-cover"
                                />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                                  <User className="h-3 w-3 text-gray-500" />
                                </div>
                              )}
                            </div>

                            {/* 账户信息 */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {account.displayName || account.name || account.userIdentifier}
                                </p>
                                <span
                                  className={cn(
                                    'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium',
                                    connectionStatus.bgColor,
                                    connectionStatus.color
                                  )}
                                  title={account.error || connectionStatus.text}
                                >
                                  <span>{connectionStatus.icon}</span>
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">
                                {account.userIdentifier}
                              </p>
                            </div>
                          </div>

                          {/* 开关按钮 */}
                          <div className="flex-shrink-0">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleAccountToggle(account.id, isSelected)}
                                disabled={isDisabled}
                                className="sr-only"
                              />
                              <div
                                className={cn(
                                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                                  isSelected && !isDisabled
                                    ? 'bg-blue-600'
                                    : 'bg-gray-200',
                                  isDisabled && 'cursor-not-allowed opacity-50'
                                )}
                              >
                                <span
                                  className={cn(
                                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                                    isSelected && !isDisabled ? 'translate-x-6' : 'translate-x-1'
                                  )}
                                />
                              </div>
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 全选/取消全选按钮 */}
        {accounts.length > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between flex-wrap gap-2 min-w-0">
              <div className="text-sm text-gray-600 whitespace-nowrap">
                已选择 {selectedCount} / {totalCount} 个账户
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onBatchSelect) {
                      // 使用批量选择方法
                      const allAccountIds = accounts.map(acc => acc.id)
                      onBatchSelect(allAccountIds)
                    } else {
                      // 降级到逐个选择
                      accounts.forEach(acc => {
                        if (!selectedAccounts.includes(acc.id)) {
                          onAccountToggle(acc.id, true)
                        }
                      })
                    }
                  }}
                  disabled={totalCount === 0}
                >
                  全选
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onBatchSelect) {
                      // 使用批量选择方法，传入空数组
                      onBatchSelect([])
                    } else {
                      // 降级到逐个取消
                      const accountsToDeselect = [...selectedAccounts]
                      accountsToDeselect.forEach(accountId => {
                        onAccountToggle(accountId, false)
                      })
                    }
                  }}
                  disabled={selectedCount === 0}
                >
                  取消全选
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}