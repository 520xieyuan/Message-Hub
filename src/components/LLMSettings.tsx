import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button } from './ui'
import {
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Cpu,
  Server,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useLLMStore } from '../store/useLLMStore'
import type { LLMConnectionTestResult } from '../types/llm'

/**
 * LLM 设置组件（只读模式）
 * 显示从 OAuth Server 获取的 LLM 配置
 * 配置管理在 OAuth Server 的 admin 页面进行
 */
export const LLMSettings: React.FC = () => {
  const { config, updateConfig, setAvailableModels } = useLLMStore()

  // 配置状态
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 连接测试状态
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<LLMConnectionTestResult | null>(
    null
  )

  // 初始化加载配置
  useEffect(() => {
    loadConfig()
  }, [])

  // 加载配置
  const loadConfig = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const serverConfig = await window.electronAPI?.llm.getConfig()
      if (serverConfig) {
        updateConfig(serverConfig)
      }
    } catch (error) {
      console.error('Failed to load LLM config:', error)
      setLoadError(error instanceof Error ? error.message : '加载配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 刷新配置
  const handleRefreshConfig = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const result = await window.electronAPI?.llm.refreshConfig()
      if (result?.success) {
        // 重新获取配置
        const serverConfig = await window.electronAPI?.llm.getConfig()
        if (serverConfig) {
          updateConfig(serverConfig)
        }
      } else {
        setLoadError(result?.message || '刷新配置失败')
      }
    } catch (error) {
      console.error('Failed to refresh LLM config:', error)
      setLoadError(error instanceof Error ? error.message : '刷新配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 测试连接
  const handleTestConnection = useCallback(async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await window.electronAPI?.llm.testConnection()
      setTestResult(result || null)

      // 如果成功，更新可用模型列表
      if (result?.success && result.availableModels) {
        setAvailableModels(result.availableModels)
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : '连接测试失败',
      })
    } finally {
      setIsTesting(false)
    }
  }, [setAvailableModels])

  // 获取 Provider 显示名称
  const getProviderDisplayName = (provider: string | undefined): string => {
    switch (provider) {
      case 'ollama':
        return 'Ollama'
      case 'openai':
        return 'OpenAI 兼容'
      default:
        return provider || 'Ollama'
    }
  }

  // 加载中状态
  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Cpu className="h-5 w-5 text-purple-600" />
            <CardTitle>AI 总结服务</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">加载配置中...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="h-5 w-5 text-purple-600" />
            <CardTitle>AI 总结服务</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {/* 启用状态指示 */}
            <span
              className={cn(
                'px-2 py-1 text-xs rounded-full',
                config.enabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              )}
            >
              {config.enabled ? '已启用' : '未启用'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshConfig}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 错误提示 */}
        {loadError && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-yellow-700">{loadError}</p>
              <p className="text-xs text-yellow-600 mt-1">
                使用本地默认配置
              </p>
            </div>
          </div>
        )}

        {/* 配置信息展示 */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Server className="h-4 w-4" />
            <span>当前配置（由管理员在服务端统一管理）</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">服务类型：</span>
              <span className="font-medium text-gray-900 ml-1">
                {getProviderDisplayName(config.provider)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">模型：</span>
              <span className="font-medium text-gray-900 ml-1">
                {config.model}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500">服务地址：</span>
              <span className="font-medium text-gray-900 ml-1 font-mono text-xs">
                {config.baseUrl || config.ollamaUrl || '未配置'}
              </span>
            </div>
          </div>

          {/* 高级参数（折叠） */}
          <details className="pt-2 border-t border-gray-200 mt-3">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
              查看高级参数
            </summary>
            <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-gray-500">最大 Token：</span>
                <span className="text-gray-700 ml-1">{config.maxTokens}</span>
              </div>
              <div>
                <span className="text-gray-500">温度：</span>
                <span className="text-gray-700 ml-1">{config.temperature}</span>
              </div>
              <div>
                <span className="text-gray-500">超时：</span>
                <span className="text-gray-700 ml-1">
                  {config.timeout / 1000}s
                </span>
              </div>
            </div>
          </details>
        </div>

        {/* 连接测试 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleTestConnection}
              variant="outline"
              disabled={isTesting}
              className="flex-1"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  测试连接
                </>
              )}
            </Button>
          </div>

          {/* 连接测试结果 */}
          {testResult && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg',
                testResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              )}
            >
              {testResult.success ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-green-700">
                      连接成功
                      {testResult.responseTime && (
                        <span className="text-green-600 ml-2">
                          ({testResult.responseTime}ms)
                        </span>
                      )}
                    </p>
                    {testResult.availableModels &&
                      testResult.availableModels.length > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          可用模型: {testResult.availableModels.slice(0, 5).join(', ')}
                          {testResult.availableModels.length > 5 && '...'}
                        </p>
                      )}
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700">{testResult.error}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* 管理提示 */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            如需修改 LLM 配置，请联系管理员或访问服务端管理页面
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
