import { useState, useEffect } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { getAccountService } from '../services/accountService'

// 获取 OAuth Server URL 的辅助函数
const getOAuthServerUrl = async (): Promise<string> => {
  const defaultUrl = 'http://localhost:3000'

  try {
    if (window.electronAPI?.config?.getOAuthServerUrl) {
      const url = await window.electronAPI.config.getOAuthServerUrl()
      return url || defaultUrl
    }
    return defaultUrl
  } catch (error) {
    console.error('Failed to get OAuth Server URL:', error)
    return defaultUrl
  }
}

interface UserToken {
  id: string
  user_identifier: string
  display_name?: string
  platform: string
  expires_at?: string
  created_at: string
  updated_at: string
}

interface OAuthApp {
  id: string
  platform: string
  name?: string
  client_id: string
  redirect_uri: string
  is_active: boolean
  created_at: string
}

interface Stats {
  oauth_apps: number
  user_tokens: number
  by_platform: {
    gmail: number
    slack: number
    lark: number
  }
}

export function AccountsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [oauthApps, setOAuthApps] = useState<OAuthApp[]>([])
  const [userTokens, setUserTokens] = useState<UserToken[]>([])
  const [searchEmail, setSearchEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oauthServerUrl, setOauthServerUrl] = useState<string>('http://localhost:3000')
  const [serverConnected, setServerConnected] = useState<boolean>(true)

  // Gmail添加流程相关状态
  const [showGmailForm, setShowGmailForm] = useState(false)
  const [selectedOAuthApp, setSelectedOAuthApp] = useState<OAuthApp | null>(null)
  const [gmailInfo, setGmailInfo] = useState({
    email: '',
    displayName: '',
    description: ''
  })

  // Slack添加流程相关状态
  const [showSlackForm, setShowSlackForm] = useState(false)
  const [slackInfo, setSlackInfo] = useState({
    workspaceUrl: '',
    displayName: '',
    description: '',
    selectedProfileId: ''  // 选中的Chrome Profile ID
  })

  // Lark添加流程相关状态
  const [showLarkForm, setShowLarkForm] = useState(false)
  const [larkInfo, setLarkInfo] = useState({
    displayName: '',
    description: '',
    selectedProfileId: ''  // 选中的Chrome Profile ID
  })

  const [chromeProfiles, setChromeProfiles] = useState<Array<{
    id: string
    name: string
    displayName?: string
    accountEmail?: string
  }>>([])

  // 加载Chrome Profiles
  const loadChromeProfiles = async () => {
    if (window.electronAPI?.listChromeProfiles) {
      try {
        const result = await window.electronAPI.listChromeProfiles()
        if (result.success) {
          setChromeProfiles(result.data)
        }
      } catch (error) {
        console.error('Failed to load Chrome profiles:', error)
      }
    }
  }

  useEffect(() => {
    loadChromeProfiles()
  }, [])

  // 加载 OAuth Server URL
  const loadOAuthServerUrl = async () => {
    try {
      if (window.electronAPI?.config?.getOAuthServerUrl) {
        const url = await window.electronAPI.config.getOAuthServerUrl()
        setOauthServerUrl(url || 'http://localhost:3000')
      }
    } catch (error) {
      console.error('Failed to load OAuth Server URL:', error)
      setOauthServerUrl('http://localhost:3000')
    }
  }

  // 清空数据
  const clearData = () => {
    setStats(null)
    setOAuthApps([])
    setUserTokens([])
    setServerConnected(false)
  }

  // 创建带超时的 fetch
  const fetchWithTimeout = (url: string, timeout = 5000): Promise<Response> => {
    return Promise.race([
      fetch(url),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ])
  }

  // 加载所有数据
  const loadAllData = async () => {
    setLoading(true)

    try {
      // 获取当前 Client ID
      let clientId: string | undefined
      try {
        if (window.electronAPI?.config?.getClientId) {
          clientId = await window.electronAPI.config.getClientId()
          console.log('[AccountsPage] Got Client ID:', clientId)
        } else {
          console.warn('[AccountsPage] getClientId method not available')
        }
      } catch (error) {
        console.warn('[AccountsPage] Failed to get Client ID:', error)
      }

      // 构建带 client_id 参数的 tokens URL
      const tokensUrl = new URL(`${oauthServerUrl}/api/tokens`)
      if (clientId) {
        tokensUrl.searchParams.append('client_id', clientId)
        console.log('[AccountsPage] Fetching tokens with client_id:', tokensUrl.toString())
      } else {
        console.warn('[AccountsPage] No Client ID, fetching all tokens')
      }

      // 并行加载所有数据（5秒超时）
      const results = await Promise.allSettled([
        fetchWithTimeout(`${oauthServerUrl}/api/stats`, 5000),
        fetchWithTimeout(`${oauthServerUrl}/api/oauth-apps`, 5000),
        fetchWithTimeout(tokensUrl.toString(), 5000)
      ])

      const statsResponse = results[0].status === 'fulfilled' ? results[0].value : null
      const appsResponse = results[1].status === 'fulfilled' ? results[1].value : null
      const tokensResponse = results[2].status === 'fulfilled' ? results[2].value : null

      // 检查是否所有请求都失败
      const allFailed = !statsResponse?.ok && !appsResponse?.ok && !tokensResponse?.ok

      if (allFailed) {
        setError(`无法连接到 OAuth Server: ${oauthServerUrl}`)
        clearData()
        return
      }

      // 加载统计信息
      if (statsResponse?.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      } else {
        setStats(null)
      }

      // 加载OAuth应用
      if (appsResponse?.ok) {
        const appsData = await appsResponse.json()
        setOAuthApps(appsData)
      } else {
        setOAuthApps([])
      }

      // 加载用户令牌
      if (tokensResponse?.ok) {
        const tokensData = await tokensResponse.json()
        setUserTokens(tokensData)
        const accountService = getAccountService()
        accountService.updateCacheWithData(tokensData)
        console.log('[AccountsPage] Updated AccountService cache with latest tokens')
      } else {
        setUserTokens([])
      }

      // 至少有一个请求成功，标记为已连接
      setServerConnected(true)
      setError(null)

    } catch (error) {
      console.error('Failed to load data:', error)
      setError('加载数据时发生错误')
      clearData()
    } finally {
      setLoading(false)
    }
  }

  // 搜索用户令牌（过滤本地数据）
  const getFilteredTokens = () => {
    if (!searchEmail.trim()) {
      return userTokens
    }

    const searchLower = searchEmail.toLowerCase()
    return userTokens.filter(token =>
      token.user_identifier.toLowerCase().includes(searchLower) ||
      token.display_name?.toLowerCase().includes(searchLower)
    )
  }

  // 处理OAuth认证点击
  const handleOAuthClick = (app: OAuthApp) => {
    setSelectedOAuthApp(app)

    // 获取默认的 Chrome Profile ID（第一个可用的）
    const defaultProfileId = chromeProfiles.length > 0 ? chromeProfiles[0].id : ''

    if (app.platform === 'gmail') {
      // Gmail需要先填写信息
      setShowGmailForm(true)
    } else if (app.platform === 'slack') {
      // Slack显示说明和可选信息，设置默认 Chrome Profile
      setSlackInfo(prev => ({ ...prev, selectedProfileId: defaultProfileId }))
      setShowSlackForm(true)
    } else if (app.platform === 'lark') {
      // Lark显示说明和可选信息，设置默认 Chrome Profile
      setLarkInfo(prev => ({ ...prev, selectedProfileId: defaultProfileId }))
      setShowLarkForm(true)
    } else {
      // 其他平台直接开始OAuth
      startOAuth(app.platform, undefined, app.id)
    }
  }

  // 开始OAuth认证
  const startOAuth = async (platform: string, accountEmail?: string, oauthAppId?: string, profileId?: string, displayName?: string, description?: string) => {
    try {
      if (window.electronAPI?.startOAuth) {
        setLoading(true)
        setError(null)

        // 通过Electron API开始OAuth流程
        const result = await window.electronAPI.startOAuth({
          platform: platform,
          accountEmail: accountEmail || searchEmail,
          oauthAppId: oauthAppId, // 传递 OAuth 应用 ID
          profileId: profileId, // 传递 Chrome Profile ID
          displayName: displayName, // 传递用户自定义显示名称
          description: description // 传递用户自定义描述
        })

        if (result.success) {
          alert(`${platform} 认证成功！`)
          // 重新加载数据
          await loadAllData()
        } else {
          if (result.error?.includes('超时')) {
            setError(`${platform} 认证超时。请确保在浏览器中完成了Google授权流程。如果浏览器没有自动打开，请手动访问授权页面。`)
          } else {
            setError(`${platform} 认证失败: ${result.error}`)
          }
        }
      } else {
        setError('OAuth功能不可用，请确保在Electron环境中运行')
      }
    } catch (error) {
      console.error('OAuth认证失败:', error)
      setError(`OAuth认证失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  // 确认Gmail信息并开始OAuth
  const confirmGmailAuth = async () => {
    if (!gmailInfo.email.trim()) {
      setError('请输入Gmail邮箱地址')
      return
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(gmailInfo.email)) {
      setError('请输入有效的邮箱地址')
      return
    }

    setShowGmailForm(false)
    await startOAuth('gmail', gmailInfo.email, selectedOAuthApp?.id, undefined, gmailInfo.displayName, gmailInfo.description)

    // 清空表单
    setGmailInfo({
      email: '',
      displayName: '',
      description: ''
    })
  }

  // 取消Gmail添加
  const cancelGmailAuth = () => {
    setShowGmailForm(false)
    setSelectedOAuthApp(null)
    setGmailInfo({
      email: '',
      displayName: '',
      description: ''
    })
  }

  // 确认Slack授权
  const confirmSlackAuth = async () => {
    setShowSlackForm(false)

    // 提取workspace ID或domain
    let workspaceId = slackInfo.workspaceUrl.trim()
    if (workspaceId) {
      // 如果输入的是完整URL，提取domain
      workspaceId = workspaceId.replace(/^https?:\/\//, '').replace(/\.slack\.com.*$/, '')
    }

    // 传递selectedProfileId和displayName到OAuth流程
    await startOAuth(
      'slack',
      workspaceId || undefined,
      selectedOAuthApp?.id,
      slackInfo.selectedProfileId || undefined,
      slackInfo.displayName,
      slackInfo.description
    )

    // 清空表单
    setSlackInfo({
      workspaceUrl: '',
      displayName: '',
      description: '',
      selectedProfileId: ''
    })
  }

  // 取消Slack添加
  const cancelSlackAuth = () => {
    setShowSlackForm(false)
    setSelectedOAuthApp(null)
    setSlackInfo({
      workspaceUrl: '',
      displayName: '',
      description: '',
      selectedProfileId: ''
    })
  }

  // 确认Lark授权
  const confirmLarkAuth = async () => {
    setShowLarkForm(false)

    await startOAuth(
      'lark',
      undefined,
      selectedOAuthApp?.id,
      larkInfo.selectedProfileId || undefined,
      larkInfo.displayName,
      larkInfo.description
    )

    // 清空表单
    setLarkInfo({
      displayName: '',
      description: '',
      selectedProfileId: ''
    })
  }

  // 取消Lark添加
  const cancelLarkAuth = () => {
    setShowLarkForm(false)
    setSelectedOAuthApp(null)
    setLarkInfo({
      displayName: '',
      description: '',
      selectedProfileId: ''
    })
  }

  // 删除用户令牌
  const deleteToken = async (tokenId: string) => {
    if (!confirm('确定要删除这个令牌吗？')) {
      return
    }

    try {
      const baseUrl = await getOAuthServerUrl()
      const response = await fetch(`${baseUrl}/api/tokens/${tokenId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('令牌删除成功')
        await loadAllData()
      } else {
        const error = await response.json()
        setError(`删除令牌失败: ${error.error}`)
      }
    } catch (error) {
      console.error('删除令牌失败:', error)
      setError('删除令牌失败')
    }
  }

  // 初始化：加载 OAuth Server URL
  // 初始化时加载 OAuth Server URL
  useEffect(() => {
    loadOAuthServerUrl()
  }, [])

  // 当 OAuth Server URL 变化时，重新加载数据
  useEffect(() => {
    if (oauthServerUrl && oauthServerUrl !== 'http://localhost:3000') {
      loadAllData()
    }
  }, [oauthServerUrl])

  // 监听 OAuth Server URL 变更事件
  useEffect(() => {
    const handleUrlChange = async () => {
      await loadOAuthServerUrl()
    }

    // 注册事件监听器（如果 electronAPI 支持）
    if (window.electronAPI?.on) {
      window.electronAPI.on('oauth-server-url-changed', handleUrlChange)

      return () => {
        if (window.electronAPI?.off) {
          window.electronAPI.off('oauth-server-url-changed', handleUrlChange)
        }
      }
    }
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">账户管理</h1>
        <p className="text-gray-600">管理您的OAuth账户和令牌</p>
        <p className="text-sm text-gray-500 mt-1">OAuth Server: {oauthServerUrl}</p>
      </div>

      {/* OAuth Server 连接失败警告 */}
      {!serverConnected && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-yellow-800">无法连接到 OAuth Server</h3>
              <p className="mt-1 text-sm text-yellow-700">
                当前配置的 OAuth Server ({oauthServerUrl}) 无法连接。应用和账户列表已清空。
                请检查服务器地址是否正确，或在设置页面修改 OAuth Server URL。
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            关闭
          </button>
        </div>
      )}

      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-blue-600 mb-1">
            {stats?.oauth_apps || 0}
          </div>
          <div className="text-sm text-gray-600">OAuth应用</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-green-600 mb-1">
            {stats?.user_tokens || 0}
          </div>
          <div className="text-sm text-gray-600">用户令牌</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-red-600 mb-1">
            {stats?.by_platform.gmail || 0}
          </div>
          <div className="text-sm text-gray-600">Gmail账户</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-purple-600 mb-1">
            {stats?.by_platform.slack || 0}
          </div>
          <div className="text-sm text-gray-600">Slack账户</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-cyan-600 mb-1">
            {stats?.by_platform.lark || 0}
          </div>
          <div className="text-sm text-gray-600">Lark账户</div>
        </div>
      </div>

      {/* OAuth认证 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">添加新账户</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {oauthApps.map((app) => (
            <div key={app.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${app.platform === 'gmail' ? 'bg-red-500' :
                    app.platform === 'slack' ? 'bg-purple-500' :
                    app.platform === 'lark' ? 'bg-cyan-500' :
                      'bg-green-500'
                    }`}></div>
                  <span className="font-medium">{app.name || app.platform.toUpperCase()}</span>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${app.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                  {app.is_active ? '启用' : '禁用'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                客户端ID: {app.client_id.substring(0, 20)}...
              </p>
              <Button
                onClick={() => handleOAuthClick(app)}
                disabled={loading || !app.is_active}
                className="w-full"
              >
                {loading ? '认证中...' : '添加用户'}
              </Button>
            </div>
          ))}
        </div>

        {oauthApps.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>暂无可用的OAuth配置</p>
            <p className="text-sm mt-2">
              请访问 <a href={oauthServerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                管理界面
              </a> 添加OAuth应用配置
            </p>
          </div>
        )}
      </div>

      {/* Slack信息输入模态框 */}
      {showSlackForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">添加Slack账户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workspace Domain (可选)
                </label>
                <Input
                  type="text"
                  placeholder="your-workspace 或 your-workspace.slack.com"
                  value={slackInfo.workspaceUrl}
                  onChange={(e) => setSlackInfo(prev => ({ ...prev, workspaceUrl: e.target.value }))}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  填写后将自动跳转到指定workspace的登录页面
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  显示名称 (可选)
                </label>
                <Input
                  type="text"
                  placeholder="工作Slack、团队Slack等"
                  value={slackInfo.displayName}
                  onChange={(e) => setSlackInfo(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备注 (可选)
                </label>
                <Input
                  type="text"
                  placeholder="用于区分不同的Slack workspace"
                  value={slackInfo.description}
                  onChange={(e) => setSlackInfo(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Chrome Profile (可选)
                  </label>
                  <button
                    type="button"
                    onClick={loadChromeProfiles}
                    className="text-xs text-purple-600 hover:text-purple-800"
                  >
                    🔄 刷新
                  </button>
                </div>
                <select
                  value={slackInfo.selectedProfileId}
                  onChange={(e) => setSlackInfo(prev => ({ ...prev, selectedProfileId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">不使用（新建浏览器窗口）</option>
                  {chromeProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName || profile.name}
                      {profile.accountEmail && ` (${profile.accountEmail})`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  选择已登录Slack的Chrome profile可以跳过登录步骤
                </p>
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              <Button
                onClick={cancelSlackAuth}
                variant="outline"
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={confirmSlackAuth}
                className="flex-1"
              >
                开始授权
              </Button>
            </div>

            <div className="mt-4 p-3 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-800">
                <strong>Slack授权流程：</strong>
              </p>
              <ol className="text-sm text-purple-800 mt-2 ml-4 list-decimal">
                <li>点击"开始授权"后将打开浏览器</li>
                <li>如果填写了workspace，将直接跳转到该workspace登录页</li>
                <li>如果未填写，需要在Slack页面中选择workspace</li>
                <li>输入workspace的登录凭据（如果需要）</li>
                <li>点击"Allow"授权应用访问Slack</li>
                <li>授权完成后浏览器会自动跳转</li>
                <li>系统将自动完成账户添加</li>
              </ol>
              <p className="text-sm text-purple-800 mt-2">
                <strong>提示：</strong>
              </p>
              <ul className="text-sm text-purple-800 mt-1 ml-4 list-disc">
                <li>填写workspace domain可以跳过选择步骤</li>
                <li>整个流程需要在10分钟内完成</li>
                <li>首次授权可能需要workspace管理员批准</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Gmail信息输入模态框 */}
      {showGmailForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">添加Gmail账户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gmail邮箱地址 *
                </label>
                <Input
                  type="email"
                  placeholder="example@gmail.com"
                  value={gmailInfo.email}
                  onChange={(e) => setGmailInfo(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  显示名称 (可选)
                </label>
                <Input
                  type="text"
                  placeholder="工作邮箱、个人邮箱等"
                  value={gmailInfo.displayName}
                  onChange={(e) => setGmailInfo(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备注 (可选)
                </label>
                <Input
                  type="text"
                  placeholder="用于区分不同用途的Gmail账户"
                  value={gmailInfo.description}
                  onChange={(e) => setGmailInfo(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              <Button
                onClick={cancelGmailAuth}
                variant="outline"
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={confirmGmailAuth}
                disabled={!gmailInfo.email.trim()}
                className="flex-1"
              >
                确认并授权
              </Button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>授权流程：</strong>
              </p>
              <ol className="text-sm text-blue-800 mt-2 ml-4 list-decimal">
                <li>点击"确认并授权"后将打开Chrome浏览器</li>
                <li>在Google授权页面中登录您的Gmail账户</li>
                <li>点击"允许"授权应用访问Gmail</li>
                <li>授权完成后浏览器会自动跳转，请不要关闭浏览器</li>
                <li>系统将自动完成账户添加</li>
              </ol>
              <p className="text-sm text-blue-800 mt-2">
                <strong>注意：</strong>整个流程需要在10分钟内完成，否则会超时。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lark信息输入模态框 */}
      {showLarkForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">添加飞书账户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  显示名称 (可选)
                </label>
                <Input
                  type="text"
                  placeholder="工作飞书、团队飞书等"
                  value={larkInfo.displayName}
                  onChange={(e) => setLarkInfo(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备注 (可选)
                </label>
                <Input
                  type="text"
                  placeholder="用于区分不同的飞书账户"
                  value={larkInfo.description}
                  onChange={(e) => setLarkInfo(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Chrome Profile (可选)
                  </label>
                  <button
                    type="button"
                    onClick={loadChromeProfiles}
                    className="text-xs text-cyan-600 hover:text-cyan-800"
                  >
                    🔄 刷新
                  </button>
                </div>
                <select
                  value={larkInfo.selectedProfileId}
                  onChange={(e) => setLarkInfo(prev => ({ ...prev, selectedProfileId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">不使用（新建浏览器窗口）</option>
                  {chromeProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName || profile.name}
                      {profile.accountEmail && ` (${profile.accountEmail})`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  选择已登录Lark的Chrome profile可以跳过登录步骤
                </p>
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              <Button
                onClick={cancelLarkAuth}
                variant="outline"
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={confirmLarkAuth}
                className="flex-1"
              >
                开始授权
              </Button>
            </div>

            <div className="mt-4 p-3 bg-cyan-50 rounded-lg">
              <p className="text-sm text-cyan-800">
                <strong>飞书授权流程：</strong>
              </p>
              <ol className="text-sm text-cyan-800 mt-2 ml-4 list-decimal">
                <li>点击"开始授权"后将打开浏览器</li>
                <li>在飞书授权页面中登录您的账户</li>
                <li>点击"允许"授权应用访问飞书消息</li>
                <li>授权完成后浏览器会自动跳转</li>
                <li>系统将自动完成账户添加</li>
              </ol>
              <p className="text-sm text-cyan-800 mt-2">
                <strong>所需权限：</strong>
              </p>
              <ul className="text-sm text-cyan-800 mt-1 ml-4 list-disc">
                <li>im:chat:readonly - 获取会话列表</li>
                <li>im:message:readonly - 读取消息内容</li>
              </ul>
              <p className="text-sm text-cyan-800 mt-2">
                <strong>注意：</strong>整个流程需要在10分钟内完成，否则会超时。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 用户令牌搜索 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">已保存的账户</h2>

        <div className="mb-6">
          <Input
            type="text"
            placeholder="输入邮箱或用户标识符搜索..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            className="max-w-md"
          />
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-500">
            搜索中...
          </div>
        )}

        {!loading && getFilteredTokens().length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium text-gray-900">平台</th>
                  <th className="text-left p-3 font-medium text-gray-900">用户标识</th>
                  <th className="text-left p-3 font-medium text-gray-900">显示名称</th>
                  <th className="text-left p-3 font-medium text-gray-900">过期时间</th>
                  <th className="text-left p-3 font-medium text-gray-900">创建时间</th>
                  <th className="text-left p-3 font-medium text-gray-900">操作</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredTokens().map((token) => (
                  <tr key={token.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${token.platform === 'gmail' ? 'bg-red-100 text-red-800' :
                        token.platform === 'slack' ? 'bg-purple-100 text-purple-800' :
                        token.platform === 'lark' ? 'bg-cyan-100 text-cyan-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                        {token.platform.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-sm">{token.user_identifier}</td>
                    <td className="p-3">{token.display_name || '-'}</td>
                    <td className="p-3 text-sm">
                      {token.expires_at ? new Date(token.expires_at).toLocaleString() : '永不过期'}
                    </td>
                    <td className="p-3 text-sm">
                      {new Date(token.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <Button
                        onClick={() => deleteToken(token.id)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && searchEmail && getFilteredTokens().length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>未找到匹配的账户</p>
            <p className="text-sm mt-2">尝试搜索其他邮箱或用户标识符</p>
          </div>
        )}

        {!loading && !searchEmail && userTokens.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>暂无已保存的账户</p>
            <p className="text-sm mt-2">点击上方"添加新账户"按钮开始添加</p>
          </div>
        )}
      </div>
    </div>
  )
}