import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Search, X, Filter, Clock, User } from 'lucide-react'
import { Button, Input } from './ui'
import { cn } from '../utils/cn'
import { useSearchStore } from '../store/useSearchStore'

export interface SearchBarProps {
  onSearch: (query: string) => void
  onClear?: () => void
  onToggleFilters?: () => void
  showFilters?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  enableSmartSearch?: boolean
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onClear,
  onToggleFilters,
  showFilters = false,
  disabled = false,
  placeholder = '搜索消息...',
  className,
  enableSmartSearch = true
}) => {
  const {
    currentQuery,
    setCurrentQuery,
    recentQueries,
    searchSuggestions,
    isSearching
  } = useSearchStore()

  const [inputValue, setInputValue] = useState(currentQuery)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // 同步输入值与store中的查询
  useEffect(() => {
    setInputValue(currentQuery)
  }, [currentQuery])

  // 处理搜索提交
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const query = inputValue.trim()
    if (query && !disabled) {
      setCurrentQuery(query)
      onSearch(query)
      setShowSuggestions(false)
    }
  }, [inputValue, disabled, onSearch, setCurrentQuery])

  // 处理输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    // 显示建议（当有输入且不为空时）
    if (value.trim()) {
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }, [])

  // 处理清空
  const handleClear = useCallback(() => {
    setInputValue('')
    setCurrentQuery('')
    setShowSuggestions(false)
    onClear?.()
    inputRef.current?.focus()
  }, [onClear, setCurrentQuery])

  // 处理建议选择
  const handleSuggestionSelect = useCallback((suggestion: { text: string; type: 'recent' | 'content' | 'sender' | 'smart' }) => {
    setInputValue(suggestion.text)
    setCurrentQuery(suggestion.text)
    setShowSuggestions(false)
    onSearch(suggestion.text)
  }, [onSearch, setCurrentQuery])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }, [])

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 智能搜索建议
  const getSmartSuggestions = useCallback((query: string) => {
    const suggestions: Array<{ text: string; type: 'sender' | 'smart' }> = []
    
    // 检测是否是发送人搜索
    if (query.includes('@') || query.startsWith('from:')) {
      const senderQuery = query.replace('from:', '').replace('@', '').trim()
      if (senderQuery) {
        suggestions.push({
          text: `from:${senderQuery}`,
          type: 'sender'
        })
      }
    }
    
    // 检测是否是日期搜索
    const datePattern = /\d{4}-\d{2}-\d{2}/
    if (datePattern.test(query)) {
      suggestions.push({
        text: `after:${query}`,
        type: 'smart'
      })
    }
    
    // 智能建议：常用搜索模式
    if (query.length >= 2) {
      const smartPatterns = [
        `"${query}"`, // 精确匹配
        `${query} AND`, // 组合搜索
        `${query} OR`, // 或搜索
      ]
      
      smartPatterns.forEach(pattern => {
        suggestions.push({
          text: pattern,
          type: 'smart'
        })
      })
    }
    
    return suggestions
  }, [])

  // 合并最近查询和搜索建议
  const suggestions = React.useMemo(() => {
    const query = inputValue.toLowerCase().trim()
    if (!query) return recentQueries.slice(0, 5).map(q => ({ text: q, type: 'recent' as const }))

    const filtered: Array<{ text: string; type: 'recent' | 'content' | 'sender' | 'smart' }> = [
      ...recentQueries.filter(q => q.toLowerCase().includes(query)).map(q => ({ text: q, type: 'recent' as const })),
      ...searchSuggestions.filter(s => s.toLowerCase().includes(query)).map(s => ({ text: s, type: 'content' as const }))
    ]

    // 添加智能建议
    if (enableSmartSearch) {
      filtered.push(...getSmartSuggestions(query))
    }

    // 去重并限制数量
    const uniqueSuggestions = Array.from(
      new Map(filtered.map(s => [s.text, s])).values()
    ).slice(0, 8)

    return uniqueSuggestions
  }, [inputValue, recentQueries, searchSuggestions, enableSmartSearch, getSmartSuggestions])

  return (
    <div className={cn('relative w-full', className)}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          {/* 搜索输入框 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (inputValue.trim() || recentQueries.length > 0) {
                  setShowSuggestions(true)
                }
              }}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                'pl-10 pr-20',
                isSearching && 'animate-pulse'
              )}
            />
            
            {/* 清空按钮 */}
            {inputValue && (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled}
                className="absolute right-16 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 筛选按钮 */}
          {onToggleFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleFilters}
              disabled={disabled}
              className={cn(
                'ml-2 px-3',
                showFilters && 'bg-primary-50 border-primary-200 text-primary-700'
              )}
            >
              <Filter className="h-4 w-4" />
            </Button>
          )}

          {/* 搜索按钮 */}
          <Button
            type="submit"
            disabled={disabled || !inputValue.trim() || isSearching}
            className="ml-2 px-4"
          >
            {isSearching ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>

      {/* 搜索建议下拉框 */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          <div className="py-1">
            {suggestions.map((suggestion, index) => {
              const getIcon = () => {
                switch (suggestion.type) {
                  case 'recent':
                    return <Clock className="mr-2 h-3 w-3 text-gray-400" />
                  case 'sender':
                    return <User className="mr-2 h-3 w-3 text-blue-400" />
                  case 'smart':
                    return <Search className="mr-2 h-3 w-3 text-purple-400" />
                  default:
                    return <Search className="mr-2 h-3 w-3 text-gray-400" />
                }
              }

              const getLabel = () => {
                switch (suggestion.type) {
                  case 'recent':
                    return '最近'
                  case 'sender':
                    return '发送人'
                  case 'smart':
                    return '智能'
                  default:
                    return ''
                }
              }

              return (
                <button
                  key={`${suggestion.text}-${index}`}
                  type="button"
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                >
                  {getIcon()}
                  <span className="truncate flex-1">{suggestion.text}</span>
                  {getLabel() && (
                    <span className="ml-auto text-xs text-gray-400">{getLabel()}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}