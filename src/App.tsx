import { useEffect } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout'
import { SearchPage, SettingsPage, AccountsPage } from './pages'
import { useAppStore } from './store'

function App() {
  const { setUserConfig, setError } = useAppStore()

  useEffect(() => {
    // Initialize application configuration
    const initializeApp = async () => {
      try {
        // Check if running in Electron environment
        if (window.electronAPI) {
          // Get user configuration
          const config = await window.electronAPI.config.getUserConfig()
          setUserConfig(config)
        } else {
          // Default configuration for browser environment
          console.warn('Running in browser environment, some features may not be available')
        }
      } catch (error) {
        console.error('Application initialization failed:', error)
        setError('Application initialization failed, please try again')
      }
    }

    initializeApp()

    // Fix Electron window focus issue
    const checkFocus = async () => {
      if (window.electronAPI) {
        // Slight delay to ensure window is fully loaded
        setTimeout(async () => {
          if (!document.hasFocus()) {
            console.log('Document not focused, requesting force focus...')
            await window.electronAPI?.window.forceFocus()
          }
        }, 500)
      }
    }

    checkFocus()

    // Listen for visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkFocus()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [setUserConfig, setError])

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<SearchPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </div>
    </Router>
  )
}

export default App