import React, { useState, useCallback, useEffect } from 'react'
import { Calendar, User, Filter, X } from 'lucide-react'
import { Button, Input, Badge } from './ui'
import { cn } from '../utils/cn'
import { SearchFilters as SearchFiltersType } from '../types/search'

export interface SearchFiltersProps {
  filters: SearchFiltersType | null
  onFiltersChange: (filters: SearchFiltersType | null) => void
  onApplyFilters: () => void
  onClearFilters: () => void
  className?: string
  disabled?: boolean
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  filters,
  onFiltersChange,
  onApplyFilters, // 保留以保持接口兼容，但不再自动触发
  onClearFilters,
  className,
  disabled = false
}) => {
  const [localFilters, setLocalFilters] = useState<SearchFiltersType>({
    sender: filters?.sender || '',
    messageType: filters?.messageType || 'all',
    dateRange: filters?.dateRange || undefined
  })

  const [hasChanges, setHasChanges] = useState(false)

  // 同步外部filters到本地状态
  useEffect(() => {
    if (filters) {
      setLocalFilters({
        sender: filters.sender || '',
        messageType: filters.messageType || 'all',
        dateRange: filters.dateRange || undefined
      })
    } else {
      setLocalFilters({
        sender: '',
        messageType: 'all',
        dateRange: undefined
      })
    }
    setHasChanges(false)
  }, [filters])

  // 检查是否有变化
  const checkForChanges = useCallback((newFilters: SearchFiltersType) => {
    const hasActiveFilters = !!(
      newFilters.sender ||
      newFilters.messageType !== 'all' ||
      newFilters.dateRange
    )
    
    const filtersChanged = JSON.stringify(newFilters) !== JSON.stringify(filters || {})
    setHasChanges(hasActiveFilters && filtersChanged)
  }, [filters])

  // 处理发送人筛选变化
  const handleSenderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...localFilters, sender: e.target.value }
    setLocalFilters(newFilters)
    checkForChanges(newFilters)
  }, [localFilters, checkForChanges])

  // 处理消息类型变化
  const handleMessageTypeChange = useCallback((type: 'text' | 'file' | 'all') => {
    const newFilters = { ...localFilters, messageType: type }
    setLocalFilters(newFilters)
    checkForChanges(newFilters)
  }, [localFilters, checkForChanges])

  // 处理日期范围变化
  const handleDateRangeChange = useCallback((field: 'start' | 'end', value: string) => {
    const date = value ? new Date(value) : undefined
    const newDateRange = localFilters.dateRange ? { ...localFilters.dateRange } : { start: new Date(), end: new Date() }
    
    if (field === 'start') {
      newDateRange.start = date || new Date()
    } else {
      newDateRange.end = date || new Date()
    }

    const newFilters = {
      ...localFilters,
      dateRange: (newDateRange.start || newDateRange.end) ? newDateRange : undefined
    }
    
    setLocalFilters(newFilters)
    checkForChanges(newFilters)
  }, [localFilters, checkForChanges])

  // 应用筛选器（仅更新状态，不触发搜索）
  const applyFilters = useCallback(() => {
    const activeFilters: SearchFiltersType = {}
    
    if (localFilters.sender?.trim()) {
      activeFilters.sender = localFilters.sender.trim()
    }
    
    if (localFilters.messageType && localFilters.messageType !== 'all') {
      activeFilters.messageType = localFilters.messageType
    }
    
    if (localFilters.dateRange) {
      activeFilters.dateRange = localFilters.dateRange
    }

    // 只更新筛选状态，不触发搜索
    onFiltersChange(Object.keys(activeFilters).length > 0 ? activeFilters : null)
    setHasChanges(false)
  }, [localFilters, onFiltersChange])

  // 当筛选条件改变时自动更新状态（不触发搜索）
  useEffect(() => {
    if (hasChanges) {
      // 使用防抖，避免频繁更新
      const timer = setTimeout(() => {
        applyFilters()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [hasChanges, applyFilters])

  // 清空筛选器
  const handleClearFilters = useCallback(() => {
    const emptyFilters = {
      sender: '',
      messageType: 'all' as const,
      dateRange: undefined
    }
    
    setLocalFilters(emptyFilters)
    onFiltersChange(null)
    onClearFilters()
    setHasChanges(false)
  }, [onFiltersChange, onClearFilters])

  // 格式化日期为输入框格式
  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return ''
    return date.toISOString().split('T')[0]
  }

  // 获取活跃筛选器数量
  const getActiveFiltersCount = (): number => {
    let count = 0
    if (filters?.sender) count++
    if (filters?.messageType && filters.messageType !== 'all') count++
    if (filters?.dateRange) count++
    return count
  }

  const activeFiltersCount = getActiveFiltersCount()

  return (
    <div className={cn('space-y-4 p-4 bg-gray-50 rounded-lg border', className)}>
      {/* 筛选器标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">高级筛选</h3>
          {activeFiltersCount > 0 && (
            <Badge variant="default" size="sm">
              {activeFiltersCount} 个筛选条件
            </Badge>
          )}
        </div>
        
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={disabled}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-3 w-3 mr-1" />
            清空
          </Button>
        )}
      </div>

      {/* 筛选器内容 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 发送人筛选 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-700 flex items-center">
            <User className="h-3 w-3 mr-1" />
            发送人
          </label>
          <Input
            type="text"
            value={localFilters.sender}
            onChange={handleSenderChange}
            placeholder="输入姓名或邮箱..."
            disabled={disabled}
            className="text-sm"
            autoComplete="off"
          />
          <p className="text-xs text-gray-500">
            支持姓名、邮箱或用户名搜索
          </p>
        </div>

        {/* 消息类型筛选 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-700">
            消息类型
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: '全部', icon: '📄' },
              { value: 'text', label: '文本', icon: '💬' },
              { value: 'file', label: '文件', icon: '📁' }
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => handleMessageTypeChange(type.value as any)}
                disabled={disabled}
                className={cn(
                  'flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                  localFilters.messageType === type.value
                    ? 'bg-primary-100 text-primary-800 border border-primary-200'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                )}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 时间范围筛选 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-700 flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            时间范围
          </label>
          <div className="space-y-2">
            <Input
              type="date"
              value={formatDateForInput(localFilters.dateRange?.start)}
              onChange={(e) => handleDateRangeChange('start', e.target.value)}
              disabled={disabled}
              className="text-sm"
              placeholder="开始日期"
            />
            <Input
              type="date"
              value={formatDateForInput(localFilters.dateRange?.end)}
              onChange={(e) => handleDateRangeChange('end', e.target.value)}
              disabled={disabled}
              className="text-sm"
              placeholder="结束日期"
            />
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          {hasChanges && '有未应用的筛选条件'}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilters}
            disabled={disabled || activeFiltersCount === 0}
          >
            重置
          </Button>
          

        </div>
      </div>
    </div>
  )
}