import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { UserConfig } from '../types/config'
import { SearchHistory } from '../types/search'

interface AppState {
  // 用户配置
  userConfig: UserConfig | null
  setUserConfig: (config: UserConfig) => void
  
  // 应用状态
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  
  // 错误状态
  error: string | null
  setError: (error: string | null) => void
  
  // 搜索历史
  searchHistory: SearchHistory[]
  addSearchHistory: (search: SearchHistory) => void
  clearSearchHistory: () => void
  
  // UI状态
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  
  // 主题
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // 初始状态
        userConfig: null,
        isLoading: false,
        error: null,
        searchHistory: [],
        sidebarOpen: true,
        theme: 'system',
        
        // Actions
        setUserConfig: (config) => set({ userConfig: config }),
        
        setIsLoading: (loading) => set({ isLoading: loading }),
        
        setError: (error) => set({ error }),
        
        addSearchHistory: (search) => {
          const { searchHistory } = get()
          const newHistory = [search, ...searchHistory.slice(0, 49)] // 保留最近50条
          set({ searchHistory: newHistory })
        },
        
        clearSearchHistory: () => set({ searchHistory: [] }),
        
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        
        setTheme: (theme) => set({ theme }),
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          searchHistory: state.searchHistory,
          sidebarOpen: state.sidebarOpen,
          theme: state.theme,
        }),
      }
    ),
    {
      name: 'app-store',
    }
  )
)