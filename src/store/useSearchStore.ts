import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { SearchResponse, MessageResult, SearchFilters } from '../types/search'

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
  oauthAppName?: string // OAuth应用名称，用于重新授权时选择正确的应用
}

interface SearchState {
  // 搜索状态
  isSearching: boolean
  searchResults: MessageResult[]
  totalCount: number
  hasMore: boolean
  searchTime: number
  
  // 当前搜索参数
  currentQuery: string
  currentFilters: SearchFilters | null
  currentPage: number
  pageSize: number
  
  // 账户管理
  accounts: Account[]
  selectedAccounts: string[]
  loadingAccounts: boolean
  
  // 搜索历史和建议
  recentQueries: string[]
  searchSuggestions: string[]
  
  // Actions
  setSearching: (searching: boolean) => void
  setSearchResults: (response: SearchResponse) => void
  appendSearchResults: (results: MessageResult[]) => void
  clearSearchResults: () => void
  
  setCurrentQuery: (query: string) => void
  setCurrentFilters: (filters: SearchFilters | null) => void
  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void
  
  // 账户管理 Actions
  setAccounts: (accounts: Account[]) => void
  updateAccount: (accountId: string, updates: Partial<Account>) => void
  toggleAccountSelection: (accountId: string, enabled: boolean) => void
  setSelectedAccounts: (accountIds: string[]) => void
  setLoadingAccounts: (loading: boolean) => void
  
  addRecentQuery: (query: string) => void
  setSearchSuggestions: (suggestions: string[]) => void
  
  // 重置搜索状态
  resetSearch: () => void
}

export const useSearchStore = create<SearchState>()(
  devtools(
    persist(
      (set, get) => ({
        // 初始状态
        isSearching: false,
        searchResults: [],
        totalCount: 0,
        hasMore: false,
        searchTime: 0,
        
        currentQuery: '',
        currentFilters: null,
        currentPage: 1,
        pageSize: 100,
        
        // 账户管理初始状态
        accounts: [],
        selectedAccounts: [],
        loadingAccounts: false,
        
        recentQueries: [],
        searchSuggestions: [],
        
        // Actions
        setSearching: (searching) => set({ isSearching: searching }),
        
        setSearchResults: (response) => set({
          searchResults: response.results,
          totalCount: response.totalCount,
          hasMore: response.hasMore,
          searchTime: response.searchTime,
        }),
        
        appendSearchResults: (results) => {
          const { searchResults } = get()
          set({ searchResults: [...searchResults, ...results] })
        },
        
        clearSearchResults: () => set({
          searchResults: [],
          totalCount: 0,
          hasMore: false,
          searchTime: 0,
        }),
        
        setCurrentQuery: (query) => set({ currentQuery: query }),
        
        setCurrentFilters: (filters) => set({ currentFilters: filters }),
        
        setCurrentPage: (page) => set({ currentPage: page }),
        
        setPageSize: (size) => set({ pageSize: size }),
        
        // 账户管理 Actions
        setAccounts: (accounts) => set({ accounts }),
        
        updateAccount: (accountId, updates) => {
          const { accounts } = get()
          const updatedAccounts = accounts.map(account =>
            account.id === accountId ? { ...account, ...updates } : account
          )
          set({ accounts: updatedAccounts })
        },
        
        toggleAccountSelection: (accountId, enabled) => {
          const { selectedAccounts } = get()
          let newSelectedAccounts: string[]
          
          if (enabled) {
            // 添加到选中列表
            if (!selectedAccounts.includes(accountId)) {
              newSelectedAccounts = [...selectedAccounts, accountId]
            } else {
              newSelectedAccounts = selectedAccounts
            }
          } else {
            // 从选中列表移除
            newSelectedAccounts = selectedAccounts.filter(id => id !== accountId)
          }
          
          set({ selectedAccounts: newSelectedAccounts })
        },
        
        setSelectedAccounts: (accountIds) => {
          set({ selectedAccounts: accountIds })
        },
        
        setLoadingAccounts: (loading) => set({ loadingAccounts: loading }),
        
        addRecentQuery: (query) => {
          if (!query.trim()) return
          
          const { recentQueries } = get()
          const newQueries = [
            query,
            ...recentQueries.filter(q => q !== query).slice(0, 9)
          ]
          set({ recentQueries: newQueries })
        },
        
        setSearchSuggestions: (suggestions) => set({ searchSuggestions: suggestions }),
        
        resetSearch: () => set({
          isSearching: false,
          searchResults: [],
          totalCount: 0,
          hasMore: false,
          searchTime: 0,
          currentQuery: '',
          currentFilters: null,
          currentPage: 1,
        }),
      }),
      {
        name: 'search-store',
        // 只持久化账户选择和搜索历史
        partialize: (state) => ({
          selectedAccounts: state.selectedAccounts,
          recentQueries: state.recentQueries,
        }),
      }
    ),
    {
      name: 'search-store',
    }
  )
)