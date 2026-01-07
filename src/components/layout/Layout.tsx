import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppStore } from '../../store'

export const Layout: React.FC = () => {
  const { sidebarOpen } = useAppStore()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar />
      
      {/* 主内容区域 */}
      <div className={`flex flex-1 flex-col transition-all duration-300 min-w-0 overflow-hidden ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        {/* 顶部导航 */}
        <Header />
        
        {/* 页面内容 */}
        <main className="flex-1 overflow-auto p-6 w-full min-w-0">
          <div className="w-full h-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}