import React, { useState, useCallback, useEffect } from 'react'
import { SearchBar } from '../components/SearchBar'
import { SearchResults } from '../components/SearchResults'
import { SearchFilters } from '../components/SearchFilters'
import { AccountSelector } from '../components/AccountSelector'
import { ReauthorizePrompt, ExpiredAccount } from '../components/ReauthorizePrompt'
import { LarkSearchProgress } from '../components/LarkSearchProgress'
import { useSearchStore } from '../store/useSearchStore'
import { getSearchService } from '../services/searchService'
import { getAccountService } from '../services/accountService'
import { MessageResult, SearchFilters as SearchFiltersType } from '../types/search'

export const SearchPage: React.FC = () => {
  const {
    isSearching,
    searchResults,
    totalCount,
    hasMore,
    searchTime,
    currentQuery,
    currentPage,
    pageSize,
    accounts,
    selectedAccounts,
    loadingAccounts,
    addRecentQuery,
    setSearching,
    setSearchResults,
    appendSearchResults,
    setCurrentPage,
    setPageSize,
    setAccounts,
    setLoadingAccounts,
    toggleAccountSelection,
    setSelectedAccounts,
    clearSearchResults
  } = useSearchStore()

  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [searchFilters, setSearchFilters] = useState<SearchFiltersType | null>(null)
  const [paginationMode] = useState<'infinite' | 'pages'>('infinite')
  const [expiredAccounts, setExpiredAccounts] = useState<ExpiredAccount[]>([])
  const [showReauthorizePrompt, setShowReauthorizePrompt] = useState(false)
  const [showLarkProgress, setShowLarkProgress] = useState(false)

  const searchService = getSearchService()
  const accountService = getAccountService()

  // 加载账户信息
  const loadAccounts = useCallback(async (autoSelectConnected: boolean = false) => {
    try {
      setLoadingAccounts(true)
      const accountList = await accountService.getAllAccounts()
      setAccounts(accountList)

      // 清理无效的selectedAccounts（数据库中已删除的账户）
      const validAccountIds = accountList.map(acc => acc.id)
      const invalidSelectedAccounts = selectedAccounts.filter(id => !validAccountIds.includes(id))

      if (invalidSelectedAccounts.length > 0) {
        console.log('🧹 [SearchPage] Cleaning up invalid selected accounts:', invalidSelectedAccounts)
        const validSelectedAccounts = selectedAccounts.filter(id => validAccountIds.includes(id))
        setSelectedAccounts(validSelectedAccounts)
      }

      // 只在明确指定时才自动选中已连接的账户
      if (autoSelectConnected && selectedAccounts.length === 0) {
        const connectedAccounts = accountList.filter(acc => acc.connectionStatus === 'connected')
        const connectedIds = connectedAccounts.map(acc => acc.id)
        if (connectedIds.length > 0) {
          setSelectedAccounts(connectedIds)
        }
      }
    } catch (err) {
      console.error('加载账户失败:', err)
      setError('加载账户信息失败')
    } finally {
      setLoadingAccounts(false)
    }
  }, [accountService, setAccounts, setLoadingAccounts, selectedAccounts, setSelectedAccounts])

  // 辅助函数：按平台分组账户
  const groupAccountsByPlatform = useCallback((
    selectedAccountIds: string[],
    accountList: Account[]
  ): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const accountId of selectedAccountIds) {
      const account = accountList.find(acc => acc.id === accountId);
      if (account) {
        if (!result[account.platform]) {
          result[account.platform] = [];
        }
        result[account.platform].push(accountId);
      }
    }
    return result;
  }, [])

  // 执行搜索
  const handleSearch = useCallback(async (query: string, resetResults: boolean = true) => {
    if (!query.trim()) return

    // 检查是否有选中的账户
    if (selectedAccounts.length === 0) {
      setError('请至少选择一个账户进行搜索')
      return
    }

    try {
      setError(null)
      setShowReauthorizePrompt(false)
      setSearching(true)
      addRecentQuery(query)

      // 获取选中账户对应的平台列表
      const selectedPlatforms = accountService.getSelectedPlatformsForSearch(accounts, selectedAccounts)

      if (selectedPlatforms.length === 0) {
        setError('选中的账户都未连接，请检查账户状态')
        setSearching(false)
        return
      }

      // ✅ Phase 3: 直接传递 token IDs（account.id 就是 token ID）
      // 按平台分组账户
      const accountsByPlatform = groupAccountsByPlatform(selectedAccounts, accounts)

      // 如果包含 Lark 账户，显示进度条
      if (accountsByPlatform['lark'] && accountsByPlatform['lark'].length > 0) {
        setShowLarkProgress(true)
      }

      // ✅ 使用 accountsByPlatform 传递账户
      const searchRequest = searchService.createSearchRequest(query, {
        platforms: selectedPlatforms,
        accountsByPlatform,
        filters: searchFilters || undefined,
        pagination: { page: 1, limit: pageSize }
      })

      // 重置页码
      if (resetResults) {
        setCurrentPage(1)
      }

      const response = await searchService.search(searchRequest)

      if (resetResults) {
        setSearchResults(response)
      } else {
        // 追加结果（用于加载更多）
        appendSearchResults(response.results)
      }
    } catch (err: any) {
      const errorHandler = searchService.createErrorHandler()
      const errorInfo = errorHandler(err)

      // 检查是否是认证过期错误
      if (err?.message?.includes('AUTHENTICATION_EXPIRED') ||
        err?.message?.includes('token has expired') ||
        err?.message?.includes('unauthorized')) {
        // 重新加载账户以更新状态
        await loadAccounts(false)
        // 检查过期账户
        const expired = accountService.getExpiredAccounts(accounts, selectedAccounts)
        if (expired.length > 0) {
          setExpiredAccounts(expired)
          setShowReauthorizePrompt(true)
          setError(`发现 ${expired.length} 个账户授权已过期，请重新授权`)
        } else {
          setError('账户授权已过期，请重新授权')
        }
      } else {
        setError(errorInfo.message)
      }

      console.error('搜索失败:', err)
    } finally {
      setSearching(false)
    }
  }, [searchService, setSearching, setSearchResults, appendSearchResults, addRecentQuery, selectedAccounts, accounts, accountService, searchFilters, loadAccounts])

  // 加载更多结果
  const handleLoadMore = useCallback(async () => {
    if (!currentQuery || isSearching || !hasMore || selectedAccounts.length === 0) return

    try {
      setSearching(true)

      const selectedPlatforms = accountService.getSelectedPlatformsForSearch(accounts, selectedAccounts)

      // 计算下一页页码：当前结果数 / 每页数量 + 1
      const nextPage = Math.floor(searchResults.length / pageSize) + 1

      console.log(`[SearchPage] Loading more - Current results: ${searchResults.length}, Page size: ${pageSize}, Next page: ${nextPage}`)

      // ✅ Phase 3: 直接传递 token IDs
      // 按平台分组账户
      const accountsByPlatform = groupAccountsByPlatform(selectedAccounts, accounts)
      // ✅ 使用 accountsByPlatform 传递账户
      const searchRequest = searchService.createSearchRequest(currentQuery, {
        platforms: selectedPlatforms,
        accountsByPlatform,
        filters: searchFilters || undefined,
        pagination: { page: nextPage, limit: pageSize }
      })

      const response = await searchService.search(searchRequest)

      console.log(`[SearchPage] Loaded ${response.results.length} more results, hasMore: ${response.hasMore}`)

      appendSearchResults(response.results)
    } catch (err) {
      const errorHandler = searchService.createErrorHandler()
      const errorInfo = errorHandler(err)
      setError(errorInfo.message)
      console.error('加载更多失败:', err)
    } finally {
      setSearching(false)
    }
  }, [currentQuery, isSearching, hasMore, searchResults.length, selectedAccounts, accounts, searchService, accountService, appendSearchResults, searchFilters, pageSize])

  // 处理页面变化（分页模式）
  const handlePageChange = useCallback(async (page: number) => {
    if (!currentQuery || isSearching || selectedAccounts.length === 0) return

    try {
      setSearching(true)

      const selectedPlatforms = accountService.getSelectedPlatformsForSearch(accounts, selectedAccounts)

      // 按平台分组账户
      const accountsByPlatform = groupAccountsByPlatform(selectedAccounts, accounts)

      // ✅ 使用 accountsByPlatform 传递账户
      const searchRequest = searchService.createSearchRequest(currentQuery, {
        platforms: selectedPlatforms,
        accountsByPlatform,
        filters: searchFilters || undefined,
        pagination: { page, limit: pageSize }
      })
      const response = await searchService.search(searchRequest)
      setSearchResults(response)
      setCurrentPage(page)
    } catch (err) {
      const errorHandler = searchService.createErrorHandler()
      const errorInfo = errorHandler(err)
      setError(errorInfo.message)
      console.error('分页加载失败:', err)
    } finally {
      setSearching(false)
    }
  }, [currentQuery, isSearching, selectedAccounts, accounts, searchService, accountService, searchFilters, setSearchResults])

  // 清空搜索
  const handleClear = useCallback(() => {
    setError(null)
  }, [])

  // 重试搜索
  const handleRetry = useCallback(() => {
    if (currentQuery) {
      handleSearch(currentQuery)
    }
  }, [currentQuery, handleSearch])

  // 切换筛选器
  const handleToggleFilters = useCallback(() => {
    setShowFilters(prev => !prev)
  }, [])

  // 处理筛选器变化
  const handleFiltersChange = useCallback((filters: SearchFiltersType | null) => {
    setSearchFilters(filters)
  }, [])

  // 应用筛选器
  const handleApplyFilters = useCallback(() => {
    if (currentQuery) {
      handleSearch(currentQuery, true)
    }
  }, [currentQuery, handleSearch])

  // 清空筛选器
  const handleClearFilters = useCallback(() => {
    setSearchFilters(null)
    if (currentQuery) {
      handleSearch(currentQuery, true)
    }
  }, [currentQuery, handleSearch])

  // 处理账户切换
  const handleAccountToggle = useCallback((accountId: string, enabled: boolean) => {
    toggleAccountSelection(accountId, enabled)
  }, [toggleAccountSelection])

  // 刷新账户信息
  const handleRefreshAccounts = useCallback(async () => {
    await loadAccounts(false) // 刷新时不自动选中账户
  }, [loadAccounts])



  // 打开消息源
  const handleOpenMessage = useCallback(async (message: MessageResult) => {
    if (!message.deepLink) return

    console.log(`[SearchPage] Opening message:`, {
      platform: message.platform,
      accountId: message.accountId,
      sender: message.sender.email,
      deepLink: message.deepLink
    })

    try {
      // 如果是Gmail消息，使用Chrome Profile打开
      if (message.platform === 'gmail' && window.electronAPI?.openGmailWithProfile) {
        let gmailAccount = null

        console.log(`[SearchPage] Available accounts:`, accounts.map(acc => ({
          id: acc.id,
          userIdentifier: acc.userIdentifier,
          platform: acc.platform
        })))

        // 如果消息有accountId，使用该账户
        if (message.accountId) {
          gmailAccount = accounts.find(acc =>
            acc.userIdentifier === message.accountId &&
            acc.platform === 'gmail' &&
            acc.connectionStatus === 'connected'
          )
          console.log(`[SearchPage] Found account for message accountId ${message.accountId}:`, gmailAccount?.userIdentifier)
        }

        // 如果没有找到，使用第一个选中的Gmail账户
        if (!gmailAccount) {
          const gmailAccounts = accounts.filter(acc =>
            acc.platform === 'gmail' &&
            selectedAccounts.includes(acc.id) &&
            acc.connectionStatus === 'connected'
          )
          gmailAccount = gmailAccounts[0]
          console.log(`[SearchPage] Using first selected Gmail account:`, gmailAccount?.userIdentifier)
        }

        if (gmailAccount) {
          console.log(`[SearchPage] Opening Gmail message with Chrome profile for account: ${gmailAccount.userIdentifier}`)

          const result = await window.electronAPI.openGmailWithProfile({
            accountEmail: gmailAccount.userIdentifier,
            url: message.deepLink,
            displayName: gmailAccount.displayName || gmailAccount.userIdentifier
          })

          if (result.success) {
            console.log(`[SearchPage] Successfully opened Gmail with Chrome profile`)
            return
          } else {
            console.warn(`[SearchPage] Failed to open with Chrome profile: ${result.error}`)
            // 降级到默认浏览器
          }
        } else {
          console.warn(`[SearchPage] No Gmail account found for message`)
        }
      }

      // 对于非Gmail消息或Chrome Profile失败的情况，使用默认浏览器
      if (window.electronAPI?.system?.openExternal) {
        await window.electronAPI.system.openExternal(message.deepLink)
      } else {
        // 浏览器环境中直接打开
        window.open(message.deepLink, '_blank')
      }
    } catch (error) {
      console.error('打开消息源失败:', error)
      // 降级到浏览器打开
      window.open(message.deepLink, '_blank')
    }
  }, [accounts, selectedAccounts])

  // 处理重新授权
  const handleReauthorize = useCallback(async (account: ExpiredAccount) => {
    try {
      const result = await accountService.startReauthorization({
        platform: account.platform,
        userIdentifier: account.userIdentifier,
        displayName: account.displayName,
        oauthAppName: account.oauthAppName
      })

      if (result.success) {
        // 重新加载账户信息
        await loadAccounts()

        // 移除已授权的账户
        setExpiredAccounts(prev => prev.filter(acc => acc.id !== account.id))

        // 如果所有账户都已重新授权，隐藏提示
        if (expiredAccounts.length <= 1) {
          setShowReauthorizePrompt(false)
          setError(null)
        }

        // 显示成功消息
        console.log(`${account.userIdentifier} 重新授权成功`)
      } else {
        setError(`重新授权失败: ${result.error}`)
      }
    } catch (error) {
      console.error('重新授权失败:', error)
      setError(`重新授权失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [accountService, loadAccounts, expiredAccounts.length])

  // 关闭重新授权提示
  const handleDismissReauthorize = useCallback(() => {
    setShowReauthorizePrompt(false)
    setExpiredAccounts([])
  }, [])

  // 页面加载时获取账户信息
  useEffect(() => {
    loadAccounts(true) // 首次加载时自动选中已连接的账户
  }, []) // 只在组件挂载时执行一次

  // 当选中的账户改变时，清空搜索结果
  useEffect(() => {
    if (searchResults.length > 0) {
      clearSearchResults()
    }
  }, [selectedAccounts]) // 只监听selectedAccounts，不包含其他依赖以避免循环

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">消息搜索</h1>
        <p className="text-gray-600">在所有平台中搜索您的消息</p>
      </div>

      {/* 账户选择器 */}
      <AccountSelector
        accounts={accounts}
        selectedAccounts={selectedAccounts}
        onAccountToggle={handleAccountToggle}
        onBatchSelect={setSelectedAccounts}
        onRefreshAccounts={handleRefreshAccounts}
        loading={loadingAccounts}
        showHeader={true}
        showManageButton={false}
      />

      {/* 重新授权提示 */}
      {showReauthorizePrompt && expiredAccounts.length > 0 && (
        <ReauthorizePrompt
          expiredAccounts={expiredAccounts}
          onReauthorize={handleReauthorize}
          onDismiss={handleDismissReauthorize}
        />
      )}

      {/* 搜索栏 */}
      <div className="w-full bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchBar
              onSearch={handleSearch}
              onClear={handleClear}
              onToggleFilters={handleToggleFilters}
              showFilters={showFilters}
              disabled={isSearching || selectedAccounts.length === 0}
              placeholder={
                selectedAccounts.length === 0
                  ? "请先选择要搜索的账户..."
                  : "搜索消息内容、发送人或频道..."
              }
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label htmlFor="pageSize" className="text-sm text-gray-600 whitespace-nowrap">
              每账户结果数:
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              disabled={isSearching}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {/* 筛选器面板 */}
        {showFilters && (
          <div className="mt-4">
            <SearchFilters
              filters={searchFilters}
              onFiltersChange={handleFiltersChange}
              onApplyFilters={handleApplyFilters}
              onClearFilters={handleClearFilters}
              disabled={isSearching}
            />
          </div>
        )}
      </div>

      {/* 搜索结果 */}
      <SearchResults
        results={searchResults}
        totalCount={totalCount}
        hasMore={hasMore}
        searchTime={searchTime}
        isLoading={isSearching}
        error={error}
        onLoadMore={handleLoadMore}
        onRetry={handleRetry}
        onOpenMessage={handleOpenMessage}
        showPlatformStatus={true}
        showSearchSummary={true}
        enableInfiniteScroll={paginationMode === 'infinite'}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        paginationMode={paginationMode}
      />

      {/* 飞书搜索进度 */}
      <LarkSearchProgress
        isVisible={showLarkProgress}
        onClose={() => setShowLarkProgress(false)}
      />
    </div>
  )
}