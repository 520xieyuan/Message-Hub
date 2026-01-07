/**
 * BaseAdapter - 平台适配器基类
 *
 * 功能：
 * 1. 统一的令牌缓存管理（1 小时 TTL）
 * 2. 从 OAuth Server 获取完整令牌信息
 * 3. 令牌刷新逻辑（子类实现）
 * 4. 异步同步到 OAuth Server
 */

export interface CachedToken {
  accessToken: string
  refreshToken: string | null
  clientId: string
  clientSecret: string
  expiresAt: string | null
  platform: string
  userIdentifier: string
  cachedAt: number
}

export abstract class BaseAdapter {
  protected tokenCache: Map<string, CachedToken> = new Map()
  protected readonly CACHE_TTL = 60 * 60 * 1000 // 1 小时

  /**
   * 从缓存或 OAuth Server 获取完整令牌
   * @param tokenId - Token ID（从 user_tokens 表的 id 字段）
   * @param oauthServerUrl - OAuth Server 的基础 URL
   * @returns 完整的令牌信息
   */
  protected async getTokenById(
    tokenId: string,
    oauthServerUrl: string
  ): Promise<CachedToken> {
    // 检查缓存
    const cached = this.tokenCache.get(tokenId)
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      console.log(`✅ [BaseAdapter] Using cached token for ID: ${tokenId}`)
      return cached
    }

    // 缓存未命中，从 OAuth Server 获取
    console.log(`📡 [BaseAdapter] Fetching token from OAuth Server: ${tokenId}`)
    const response = await fetch(
      `${oauthServerUrl}/api/tokens/by-id/${tokenId}/full`
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch token: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    if (!result.success || !result.data) {
      throw new Error('Invalid token response from OAuth Server')
    }

    const token = result.data
    const cachedToken: CachedToken = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      clientId: token.client_id,
      clientSecret: token.client_secret,
      expiresAt: token.expires_at || null,
      platform: token.platform,
      userIdentifier: token.user_identifier,
      cachedAt: Date.now()
    }

    // 更新缓存
    this.tokenCache.set(tokenId, cachedToken)
    console.log(`✅ [BaseAdapter] Cached token for ID: ${tokenId}`)

    return cachedToken
  }

  /**
   * 刷新 Access Token（使用 Refresh Token）
   * 子类必须实现此方法以支持平台特定的刷新逻辑
   *
   * @param tokenId - Token ID
   * @param refreshToken - Refresh Token
   * @param clientId - OAuth App Client ID
   * @param clientSecret - OAuth App Client Secret
   * @param oauthServerUrl - OAuth Server URL
   * @returns 新的 Access Token
   */
  protected async refreshAccessToken(
    tokenId: string,
    refreshToken: string,
    clientId: string,
    clientSecret: string,
    oauthServerUrl: string
  ): Promise<{ accessToken: string; expiresAt: string }> {
    throw new Error('refreshAccessToken must be implemented by subclass')
  }

  /**
   * 异步更新 OAuth Server 中的 Token
   * 不阻塞主流程，失败时仅记录警告
   *
   * @param tokenId - Token ID
   * @param accessToken - 新的 Access Token
   * @param expiresAt - 新的过期时间（ISO 8601 格式）
   * @param oauthServerUrl - OAuth Server URL
   */
  protected async updateTokenAsync(
    tokenId: string,
    accessToken: string,
    expiresAt: string,
    oauthServerUrl: string
  ): Promise<void> {
    // 异步执行，不阻塞主流程
    fetch(`${oauthServerUrl}/api/tokens/by-id/${tokenId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        expires_at: expiresAt
      })
    }).catch(error => {
      console.error(`⚠️ [BaseAdapter] Failed to update token ${tokenId}:`, error.message)
    })
  }

  /**
   * 检查 Token 是否过期（提前 5 分钟）
   * @param expiresAt - 过期时间（ISO 8601 格式）
   * @returns 是否过期
   */
  protected isTokenExpired(expiresAt: string | null): boolean {
    if (!expiresAt) {
      // 如果没有过期时间，假设不会过期（如 Slack）
      return false
    }

    const expiry = new Date(expiresAt).getTime()
    const now = Date.now()
    // 提前 5 分钟刷新
    return expiry - now < 5 * 60 * 1000
  }

  /**
   * 清空缓存
   */
  public clearCache(): void {
    console.log('🧹 [BaseAdapter] Clearing token cache')
    this.tokenCache.clear()
  }

  /**
   * 清除特定 Token 的缓存
   * @param tokenId - Token ID
   */
  public clearTokenCache(tokenId: string): void {
    console.log(`🧹 [BaseAdapter] Clearing cache for token: ${tokenId}`)
    this.tokenCache.delete(tokenId)
  }

  /**
   * 获取缓存统计信息（用于调试）
   */
  public getCacheStats(): { size: number; tokens: string[] } {
    return {
      size: this.tokenCache.size,
      tokens: Array.from(this.tokenCache.keys())
    }
  }
}
