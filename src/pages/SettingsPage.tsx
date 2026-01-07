import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '../components/ui'
import { ClientIdSettings } from '../components/ClientIdSettings'
import { LLMSettings } from '../components/LLMSettings'
import { Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react'

interface DiagnosisResult {
  success: boolean
  chromePath: string | null
  userDataDir: string | null
  checkedPaths: Array<{ path: string; exists: boolean }>
  profiles: number
  error?: string
}

export const SettingsPage: React.FC = () => {
  const [oauthServerUrl, setOauthServerUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  
  // Chrome 诊断相关状态
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null)

  // 加载当前配置
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      if (window.electronAPI?.config?.getOAuthServerUrl) {
        const url = await window.electronAPI.config.getOAuthServerUrl()
        setOauthServerUrl(url || 'http://localhost:3000')
      } else {
        console.warn('electronAPI not available, using default URL')
        setOauthServerUrl('http://localhost:3000')
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      setOauthServerUrl('http://localhost:3000')
    }
  }

  // 测试连接
  const handleTestConnection = async () => {
    if (!oauthServerUrl.trim()) {
      setErrorMessage('请输入 OAuth Server 地址')
      setTestStatus('error')
      return
    }

    setTestStatus('testing')
    setErrorMessage('')

    try {
      // 测试连接到 OAuth Server
      const response = await fetch(`${oauthServerUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setTestStatus('success')
        setTimeout(() => setTestStatus('idle'), 3000)
      } else {
        setTestStatus('error')
        setErrorMessage(`连接失败: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      setTestStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '无法连接到服务器')
    }
  }

  // 保存设置
  const handleSave = async () => {
    if (!oauthServerUrl.trim()) {
      setErrorMessage('请输入 OAuth Server 地址')
      setSaveStatus('error')
      return
    }

    setLoading(true)
    setSaveStatus('idle')
    setErrorMessage('')

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API 不可用，请确保在 Electron 环境中运行')
      }

      if (!window.electronAPI.config) {
        throw new Error('配置 API 不可用')
      }

      if (!window.electronAPI.config.setOAuthServerUrl) {
        throw new Error('setOAuthServerUrl 方法不可用，请重启应用')
      }

      await window.electronAPI.config.setOAuthServerUrl(oauthServerUrl)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
      setSaveStatus('error')
      const errorMsg = error instanceof Error ? error.message : '保存失败'
      setErrorMessage(errorMsg)
      console.error('Save OAuth Server URL failed:', error)
    } finally {
      setLoading(false)
    }
  }

  // 重置为默认值
  const handleReset = () => {
    setOauthServerUrl('http://localhost:3000')
    setSaveStatus('idle')
    setTestStatus('idle')
    setErrorMessage('')
  }

  // Chrome 诊断
  const runDiagnosis = async () => {
    setDiagnosing(true)
    try {
      if (window.electronAPI?.diagnoseChromeInstallation) {
        const result = await window.electronAPI.diagnoseChromeInstallation()
        setDiagnosisResult(result)
      } else {
        alert('诊断功能不可用')
      }
    } catch (error) {
      console.error('诊断失败:', error)
      alert('诊断失败: ' + error)
    } finally {
      setDiagnosing(false)
    }
  }

  const copyDiagnosisToClipboard = async () => {
    if (!diagnosisResult) return

    const text = `
Chrome 诊断报告
================

状态: ${diagnosisResult.success ? '✓ 正常' : '✗ 异常'}
Chrome 路径: ${diagnosisResult.chromePath || '未找到'}
用户数据目录: ${diagnosisResult.userDataDir || '未找到'}
已加载 Profiles: ${diagnosisResult.profiles}
${diagnosisResult.error ? `错误: ${diagnosisResult.error}` : ''}

检查的路径:
${diagnosisResult.checkedPaths.map(p => `${p.exists ? '✓' : '✗'} ${p.path}`).join('\n')}
    `.trim()

    try {
      // 优先尝试使用现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          alert('✓ 诊断报告已复制到剪贴板')
          return
        } catch (clipboardError) {
          console.warn('Clipboard API failed, falling back to execCommand:', clipboardError)
          // 如果失败，继续执行降级方案
        }
      }

      // 降级方案：使用传统的 execCommand
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      textArea.setAttribute('readonly', '')
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      try {
        const successful = document.execCommand('copy')
        if (successful) {
          alert('✓ 诊断报告已复制到剪贴板')
        } else {
          throw new Error('execCommand failed')
        }
      } catch (execError) {
        console.error('execCommand failed:', execError)
        // 最后降级：显示对话框让用户手动复制
        prompt('自动复制失败，请手动复制以下内容:', text)
      } finally {
        document.body.removeChild(textArea)
      }
    } catch (error) {
      console.error('复制失败:', error)
      // 最终降级：使用 prompt
      prompt('复制失败，请手动复制以下内容:', text)
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">设置</h1>
        <p className="text-gray-600">管理您的平台配置和应用设置</p>
      </div>

      <div className="grid gap-6">
        {/* Client ID 设置 */}
        <ClientIdSettings />

        {/* AI 总结设置 */}
        <LLMSettings />

        {/* OAuth Server 配置 */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>OAuth Server 配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="oauth-server-url" className="block text-sm font-medium text-gray-700 mb-2">
                OAuth Server 地址
              </label>
              <Input
                id="oauth-server-url"
                type="url"
                value={oauthServerUrl}
                onChange={(e) => setOauthServerUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                输入 OAuth 认证服务器的完整地址（包括协议和端口）
              </p>
            </div>

            {/* 错误消息 */}
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-600">{errorMessage}</p>
              </div>
            )}

            {/* 成功消息 */}
            {saveStatus === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-600">设置已保存成功</p>
              </div>
            )}

            {testStatus === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-600">连接测试成功</p>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleTestConnection}
                variant="outline"
                disabled={testStatus === 'testing' || !oauthServerUrl.trim()}
              >
                {testStatus === 'testing' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    测试连接
                  </>
                )}
              </Button>

              <Button
                onClick={handleSave}
                disabled={loading || !oauthServerUrl.trim()}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    保存设置
                  </>
                )}
              </Button>

              <Button
                onClick={handleReset}
                variant="ghost"
              >
                重置为默认
              </Button>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <strong>注意：</strong>修改 OAuth Server 地址后，需要重新启动应用才能生效。
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <p>调试信息：</p>
                <p>- electronAPI 可用: {window.electronAPI ? '是' : '否'}</p>
                <p>- config API 可用: {window.electronAPI?.config ? '是' : '否'}</p>
                <p>- setOAuthServerUrl 可用: {window.electronAPI?.config?.setOAuthServerUrl ? '是' : '否'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chrome 浏览器诊断 */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Chrome 浏览器诊断</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              如果无法打开 Chrome 或使用 Chrome Profile 功能，请运行诊断来检查 Chrome 安装情况。
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={runDiagnosis}
                disabled={diagnosing}
                variant="outline"
              >
                {diagnosing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    诊断中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    运行诊断
                  </>
                )}
              </Button>

              <Button
                onClick={async () => {
                  try {
                    if (window.electronAPI?.system?.showLogFile) {
                      const success = await window.electronAPI.system.showLogFile()
                      if (!success) {
                        alert('无法打开日志文件')
                      }
                    } else if (window.electronAPI?.system?.getLogFilePath) {
                      // 降级方案：显示路径
                      const logPath = await window.electronAPI.system.getLogFilePath()
                      if (logPath) {
                        alert(`日志文件位置：\n${logPath}\n\n请手动打开此文件`)
                      } else {
                        alert('无法获取日志文件路径')
                      }
                    } else {
                      alert('日志功能不可用，请重启应用')
                    }
                  } catch (error) {
                    console.error('查看日志失败:', error)
                    alert('查看日志失败: ' + error)
                  }
                }}
                variant="ghost"
              >
                查看日志文件
              </Button>
            </div>

            {diagnosisResult && (
              <div className="mt-4 border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">诊断结果</h3>
                  <Button
                    onClick={copyDiagnosisToClipboard}
                    variant="outline"
                    size="sm"
                  >
                    复制报告
                  </Button>
                </div>

                {/* 状态 */}
                <div className="mb-4">
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    diagnosisResult.success
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {diagnosisResult.success ? '✓ Chrome 已正确安装' : '✗ Chrome 未找到或配置异常'}
                  </div>
                </div>

                {/* Chrome 路径 */}
                <div className="mb-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">Chrome 路径:</div>
                  <div className="bg-white p-2 rounded text-sm font-mono break-all border">
                    {diagnosisResult.chromePath || '未找到'}
                  </div>
                </div>

                {/* 用户数据目录 */}
                <div className="mb-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">用户数据目录:</div>
                  <div className="bg-white p-2 rounded text-sm font-mono break-all border">
                    {diagnosisResult.userDataDir || '未找到'}
                  </div>
                </div>

                {/* Profiles 数量 */}
                <div className="mb-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">已加载的 Profiles:</div>
                  <div className="bg-white p-2 rounded text-sm border">
                    {diagnosisResult.profiles} 个
                  </div>
                </div>

                {/* 错误信息 */}
                {diagnosisResult.error && (
                  <div className="mb-3">
                    <div className="text-sm font-medium text-red-700 mb-1">错误:</div>
                    <div className="bg-red-50 p-2 rounded text-sm text-red-800 border border-red-200">
                      {diagnosisResult.error}
                    </div>
                  </div>
                )}

                {/* 检查的路径 */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">检查的路径:</div>
                  <div className="bg-white p-3 rounded max-h-64 overflow-y-auto border">
                    {diagnosisResult.checkedPaths.map((item, index) => (
                      <div
                        key={index}
                        className={`text-sm font-mono mb-1 ${
                          item.exists ? 'text-green-700' : 'text-gray-500'
                        }`}
                      >
                        <span className="mr-2">{item.exists ? '✓' : '✗'}</span>
                        {item.path}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 建议 */}
                {!diagnosisResult.success && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="text-sm font-medium text-yellow-800 mb-2">建议:</div>
                    <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                      <li>请确保已安装 Google Chrome 浏览器</li>
                      <li>下载地址: <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" className="underline">https://www.google.com/chrome/</a></li>
                      <li>安装后重启应用并重新运行诊断</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 其他设置卡片 */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>平台配置</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                平台配置组件将在后续任务中实现。这里将包含：
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-gray-600">
                <li>Slack 工作区配置</li>
                <li>Gmail 账户配置</li>
                <li>Lark 企业版配置</li>
                <li>OAuth 认证流程</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>应用设置</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                应用设置组件将在后续任务中实现。这里将包含：
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-gray-600">
                <li>主题设置</li>
                <li>语言设置</li>
                <li>搜索偏好</li>
                <li>隐私设置</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
