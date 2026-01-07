import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from './ui'
import { Copy, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

/**
 * Client ID 设置组件
 * 用于管理设备的唯一标识符，实现跨设备数据隔离和同步
 */
export const ClientIdSettings: React.FC = () => {
  const [clientId, setClientId] = useState('')
  const [newClientId, setNewClientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // 加载当前 Client ID
  useEffect(() => {
    loadClientId()
  }, [])

  const loadClientId = async () => {
    try {
      if (window.electronAPI?.config?.getClientId) {
        const id = await window.electronAPI.config.getClientId()
        setClientId(id)
        setNewClientId(id)
      }
    } catch (error) {
      console.error('Failed to load Client ID:', error)
      setErrorMessage('无法加载 Client ID')
    }
  }

  // 复制 Client ID 到剪贴板
  const handleCopy = async () => {
    try {
      // 优先尝试使用现代剪贴板 API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(clientId)
          setCopyStatus('copied')
          setTimeout(() => setCopyStatus('idle'), 2000)
          return
        } catch (clipboardError) {
          console.warn('Clipboard API failed, falling back to execCommand:', clipboardError)
          // 如果失败，继续执行降级方案
        }
      }

      // 降级方案：使用 textarea + execCommand
      const textArea = document.createElement('textarea')
      textArea.value = clientId
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      textArea.setAttribute('readonly', '')
      document.body.appendChild(textArea)

      // 确保元素可见并获得焦点
      textArea.focus()
      textArea.select()

      try {
        const successful = document.execCommand('copy')
        if (successful) {
          setCopyStatus('copied')
          setTimeout(() => setCopyStatus('idle'), 2000)
        } else {
          throw new Error('execCommand copy failed')
        }
      } catch (execError) {
        console.error('execCommand failed:', execError)
        // 最后的降级方案：显示对话框让用户手动复制
        const userCopy = prompt('自动复制失败，请手动复制以下 Client ID:', clientId)
        if (userCopy !== null) {
          setCopyStatus('copied')
          setTimeout(() => setCopyStatus('idle'), 2000)
        }
      } finally {
        document.body.removeChild(textArea)
      }
    } catch (error) {
      console.error('Failed to copy:', error)
      // 最终降级：使用 prompt
      const userCopy = prompt('复制失败，请手动复制以下 Client ID:', clientId)
      if (userCopy !== null) {
        setCopyStatus('copied')
        setTimeout(() => setCopyStatus('idle'), 2000)
      }
    }
  }

  // 重置 Client ID
  const handleReset = async () => {
    const confirmed = confirm(
      '⚠️ 重置 Client ID 将生成一个新的设备标识符。\n\n' +
      '这意味着：\n' +
      '- 当前设备将无法访问之前添加的账户\n' +
      '- 之前添加的所有账户数据仍然保留在服务器上\n' +
      '- 您可以随时通过粘贴旧的 Client ID 来恢复访问\n\n' +
      '确定要继续吗？'
    )

    if (!confirmed) return

    setLoading(true)
    setErrorMessage('')
    setSaveStatus('idle')

    try {
      if (window.electronAPI?.config?.resetClientId) {
        const result = await window.electronAPI.config.resetClientId()
        if (result.success) {
          setClientId(result.clientId)
          setNewClientId(result.clientId)
          setIsEditing(false)
          setSaveStatus('success')
          setTimeout(() => setSaveStatus('idle'), 3000)
        } else {
          throw new Error('重置失败')
        }
      }
    } catch (error) {
      console.error('Failed to reset Client ID:', error)
      setSaveStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '重置失败')
    } finally {
      setLoading(false)
    }
  }

  // 保存新的 Client ID（用于跨设备同步）
  const handleSave = async () => {
    if (!newClientId.trim()) {
      setErrorMessage('Client ID 不能为空')
      setSaveStatus('error')
      return
    }

    // 简单验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(newClientId.trim())) {
      setErrorMessage('Client ID 格式不正确，应为 UUID 格式（例如：123e4567-e89b-12d3-a456-426614174000）')
      setSaveStatus('error')
      return
    }

    const confirmed = confirm(
      '⚠️ 设置新的 Client ID 后：\n\n' +
      '- 当前设备将切换到新的设备标识符\n' +
      '- 您将能看到该 Client ID 关联的所有账户\n' +
      '- 之前添加的账户将不再可见（除非切换回原 Client ID）\n\n' +
      '这通常用于在多个设备之间同步账户数据。\n\n' +
      '确定要继续吗？'
    )

    if (!confirmed) return

    setLoading(true)
    setErrorMessage('')
    setSaveStatus('idle')

    try {
      if (window.electronAPI?.config?.setClientId) {
        const result = await window.electronAPI.config.setClientId(newClientId.trim())
        if (result.success) {
          setClientId(result.clientId!)
          setIsEditing(false)
          setSaveStatus('success')
          setTimeout(() => setSaveStatus('idle'), 3000)
        } else {
          throw new Error(result.error || '保存失败')
        }
      }
    } catch (error) {
      console.error('Failed to save Client ID:', error)
      setSaveStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  // 取消编辑
  const handleCancel = () => {
    setNewClientId(clientId)
    setIsEditing(false)
    setErrorMessage('')
    setSaveStatus('idle')
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>设备标识符 (Client ID)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 当前 Client ID 显示 */}
        {!isEditing ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              当前 Client ID
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={clientId}
                readOnly
                className="flex-1 font-mono text-sm bg-gray-50"
              />
              <Button
                onClick={handleCopy}
                variant="outline"
                title="复制到剪贴板"
                disabled={!clientId}
                className="min-w-[100px]"
              >
                {copyStatus === 'copied' ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    复制
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="new-client-id" className="block text-sm font-medium text-gray-700 mb-2">
              新的 Client ID
            </label>
            <Input
              id="new-client-id"
              type="text"
              value={newClientId}
              onChange={(e) => setNewClientId(e.target.value)}
              placeholder="粘贴另一台设备的 Client ID"
              className="w-full font-mono text-sm"
            />
          </div>
        )}

        {/* 错误消息 */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-600">{errorMessage}</p>
          </div>
        )}

        {/* 成功消息 */}
        {saveStatus === 'success' && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-600">Client ID 已更新成功</p>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-3 pt-2">
          {!isEditing ? (
            <>
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
              >
                设置新 Client ID
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    重置中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重置为新 ID
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleSave}
                disabled={loading || !newClientId.trim()}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  '保存'
                )}
              </Button>
              <Button
                onClick={handleCancel}
                variant="ghost"
                disabled={loading}
              >
                取消
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
