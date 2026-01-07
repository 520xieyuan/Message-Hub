/**
 * Gmail平台适配器
 * 实现Gmail API集成和邮件搜索功能
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { shell } from 'electron';
import { PlatformAdapter, PlatformConfig, PlatformType, AuthResult, PlatformUserInfo } from '../../../src/types/platform';
import { SearchRequest, MessageResult, MessageSender } from '../../../src/types/search';
import { ConfigurationService } from '../ConfigurationService';
import { GmailHtmlCleaner } from './utils/GmailHtmlCleaner';

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload?: gmail_v1.Schema$MessagePart;
  internalDate?: string;
}

interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
}

export class GmailAdapter extends PlatformAdapter {
  private oauth2Client: OAuth2Client | null = null;
  private gmailClient: gmail_v1.Gmail | null = null;
  private currentAccountId: string | null = null; // 跟踪当前使用的账户
  private configService: ConfigurationService | null = null;

  // Gmail OAuth 2.0 配置
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  /**
   * 为 Promise 添加超时控制
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${operationName} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  constructor(config: PlatformConfig, configService?: ConfigurationService) {
    super(config);
    this.configService = configService || null;
    this.initializeClient();
  }

  /**
   * 获取 OAuth Server URL
   */
  private async getOAuthServerUrl(): Promise<string> {
    if (this.configService) {
      return await this.configService.getOAuthServerUrl();
    }
    // 后备方案
    return process.env.OAUTH_SERVER_URL || 'http://localhost:3000';
  }

  /**
   * 初始化Google OAuth2客户端
   */
  private initializeClient(): void {
    if (this.config.credentials.clientId && this.config.credentials.clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        this.config.credentials.clientId,
        this.config.credentials.clientSecret,
        'http://localhost:3000/oauth/callback' // 重定向URI
      );

      // 如果有访问令牌，设置凭据
      if (this.config.credentials.accessToken) {
        this.oauth2Client.setCredentials({
          access_token: this.config.credentials.accessToken,
          refresh_token: this.config.credentials.refreshToken,
        });

        // 初始化Gmail客户端
        this.gmailClient = google.gmail({ version: 'v1', auth: this.oauth2Client });
      }
    }
  }

  /**
   * 异步初始化Gmail客户端，尝试从OAuth服务器获取配置
   * @param accountIds 可选的账户ID列表，用于多账户场景
   */
  private async initializeClientAsync(accountIds?: string[]): Promise<void> {
    const initStartTime = Date.now();

    try {
      let { clientId, clientSecret, accessToken, refreshToken } = this.config.credentials;

      // 如果配置中没有clientId，尝试从OAuth服务器获取
      if (!clientId || !clientSecret) {
        const configStartTime = Date.now();

        // 传递第一个账户ID以获取正确的OAuth配置
        const accountId = accountIds && accountIds.length > 0 ? accountIds[0] : undefined;

        try {
          const oauthConfig = await this.withTimeout(
            this.fetchOAuthConfigFromServer(accountId),
            5000,
            'fetchOAuthConfigFromServer'
          );

          if (oauthConfig) {
            clientId = clientId || oauthConfig.clientId;
            clientSecret = clientSecret || oauthConfig.clientSecret;
          }
        } catch (error) {
          console.error(`❌ [GmailAdapter] fetchOAuthConfigFromServer failed after ${Date.now() - configStartTime}ms:`, error);
          throw error;
        }
      }

      if (!clientId || !clientSecret) {
        console.error('❌ [GmailAdapter] Gmail OAuth credentials not available');
        throw new Error('Gmail OAuth credentials not configured');
      }

      // 初始化OAuth2客户端
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/oauth/callback'
      );

      // 始终从OAuth服务器获取最新的访问令牌（避免使用过期的缓存token）
      const tokenStartTime = Date.now();

      try {
        const tokenData = await this.withTimeout(
          this.fetchTokenFromServer(accountIds),
          10000,
          'fetchTokenFromServer'
        );

        if (tokenData) {
          accessToken = tokenData.accessToken;
          refreshToken = tokenData.refreshToken;
        } else {
          // 降级：如果服务器获取失败，尝试使用config中的token
          if (!accessToken) {
            console.error('❌ [GmailAdapter] No access token available');
            throw new Error('No access token available for Gmail');
          }
        }
      } catch (error) {
        console.error(`❌ [GmailAdapter] fetchTokenFromServer failed after ${Date.now() - tokenStartTime}ms:`, error);
        throw error;
      }

      // 如果有访问令牌，设置凭据
      if (accessToken) {
        console.log('🔐 [GmailAdapter] Setting OAuth2 credentials');
        console.log('🔑 [GmailAdapter] Token info:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          accessTokenLength: accessToken?.length,
          refreshTokenPreview: refreshToken?.substring(0, 30) + '...',
        });

        // 保存到 config.credentials 中（重要！）
        this.config.credentials.accessToken = accessToken;
        this.config.credentials.refreshToken = refreshToken;

        this.oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        // 初始化Gmail客户端
        this.gmailClient = google.gmail({ version: 'v1', auth: this.oauth2Client });
        console.log(`✅ [GmailAdapter] Gmail client initialized successfully in ${Date.now() - initStartTime}ms`);
      } else {
        console.log('⚠️  [GmailAdapter] Gmail OAuth client initialized, but no access token available');
        throw new Error('Gmail OAuth client initialized, but no access token available');
      }
    } catch (error) {
      console.error(`❌ [GmailAdapter] initializeClientAsync FAILED after ${Date.now() - initStartTime}ms:`, error);
      throw error;
    }
  }

  /**
   * 从OAuth服务器获取OAuth配置
   * @param accountId Token ID (从 OAuth Server 的 user_tokens 表的 id 字段)
   */
  private async fetchOAuthConfigFromServer(accountId?: string): Promise<{ clientId: string; clientSecret: string } | null> {
    try {
      const serverUrl = await this.getOAuthServerUrl();

      // 如果提供了 accountId (token ID)，直接从 by-id API 获取完整信息（包括 OAuth app 配置）
      if (accountId) {
        console.log(`🔍 [GmailAdapter] Fetching OAuth config for token: ${accountId}`);
        const fullTokenUrl = `${serverUrl}/api/tokens/by-id/${accountId}/full`;
        const response = await this.fetchJson(fullTokenUrl);

        if (response && response.success && response.data) {
          const { client_id, client_secret } = response.data;

          if (client_id && client_secret) {
            console.log(`✅ [GmailAdapter] Got OAuth config from token data (client_id: ${client_id.substring(0, 20)}...)`);
            return {
              clientId: client_id,
              clientSecret: client_secret
            };
          } else {
            console.warn(`⚠️  [GmailAdapter] Token data missing client_id or client_secret`);
          }
        } else {
          console.warn(`⚠️  [GmailAdapter] Invalid response from by-id API:`, response);
        }
      }

      // 降级方案：如果没有 accountId 或者上面的请求失败，使用第一个可用的 Gmail OAuth 应用
      console.log(`⚠️  [GmailAdapter] Falling back to /api/oauth-apps`);
      const url = new URL(`${serverUrl}/api/oauth-apps`);
      const protocol = url.protocol === 'https:' ? require('https') : require('http');

      return new Promise((resolve) => {
        const req = protocol.get(`${serverUrl}/api/oauth-apps`, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const apps = JSON.parse(data);
              const gmailApp = apps.find((app: any) => app.platform === 'gmail' && app.is_active);

              if (gmailApp) {
                console.log(`✅ [GmailAdapter] Using fallback OAuth app: ${gmailApp.name} (${gmailApp.client_id.substring(0, 20)}...)`);
                resolve({
                  clientId: gmailApp.client_id,
                  clientSecret: gmailApp.client_secret
                });
              } else {
                resolve(null);
              }
            } catch (parseError) {
              console.warn('Failed to parse OAuth apps response:', parseError);
              resolve(null);
            }
          });
        });
        req.on('error', (error: any) => {
          console.warn('Failed to fetch OAuth config from server:', error);
          resolve(null);
        });
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(null);
        });
      });
    } catch (error) {
      console.error(`❌ [GmailAdapter] fetchOAuthConfigFromServer failed:`, error);
      return null;
    }
  }

  /**
   * 从OAuth服务器获取访问令牌
   * ✅ Phase 2.2 重访：优化为仅 1 次请求
   * @param accountIds Token IDs（从 OAuth Server 的 user_tokens 表的 id 字段）
   */
  private async fetchTokenFromServer(accountIds?: string[]): Promise<{ accessToken: string; refreshToken?: string } | null> {
    const fetchStartTime = Date.now();

    try {
      const serverUrl = await this.getOAuthServerUrl();

      // ✅ 优化：直接使用 token ID 获取完整信息（仅 1 次请求）
      const tokenId = accountIds && accountIds.length > 0 ? accountIds[0] : null;

      if (!tokenId) {
        console.error('❌ [GmailAdapter] No token ID provided');
        return null;
      }

      console.log(`📡 [GmailAdapter] Fetching token by ID: ${tokenId}`);

      // 使用新 API：直接通过 token ID 获取完整令牌（仅 1 次请求）
      const fullTokenUrl = `${serverUrl}/api/tokens/by-id/${tokenId}/full`;
      const response = await this.fetchJson(fullTokenUrl);

      if (!response || !response.success || !response.data) {
        console.error('❌ [GmailAdapter] Failed to fetch full token:', response);
        return null;
      }

      const fullToken = response.data;

      // 验证平台是否正确
      if (fullToken.platform !== 'gmail') {
        console.error('❌ [GmailAdapter] CRITICAL ERROR: Received token for wrong platform!', {
          expected: 'gmail',
          received: fullToken.platform,
          user_identifier: fullToken.user_identifier
        });
        return null;
      }

      if (!fullToken.access_token) {
        console.error('❌ [GmailAdapter] No access_token in response');
        return null;
      }

      console.log(`✅ [GmailAdapter] Token fetched successfully in ${Date.now() - fetchStartTime}ms (1 request)`);

      return {
        accessToken: fullToken.access_token,
        refreshToken: fullToken.refresh_token
      };
    } catch (error) {
      console.error(`❌ [GmailAdapter] fetchTokenFromServer FAILED with error after ${Date.now() - fetchStartTime}ms:`, error);
      return null;
    }
  }

  /**
   * 辅助方法：从URL获取JSON数据
   */
  private async fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? require('https') : require('http');

      const req = protocol.get(url, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (parseError) {
            reject(parseError);
          }
        });
      });
      req.on('error', (error: any) => {
        reject(error);
      });
      req.setTimeout(3000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 获取平台类型
   */
  public getPlatformType(): PlatformType {
    return 'gmail';
  }

  /**
   * 进行Google OAuth认证
   * @deprecated 此方法未在当前架构中使用。实际认证通过 RemoteOAuthService + IntegratedAuthService 完成。
   */
  public async authenticate(): Promise<AuthResult> {
    try {
      if (!this.oauth2Client) {
        return {
          success: false,
          error: 'OAuth client not configured. Please set clientId and clientSecret.',
        };
      }

      // 生成OAuth授权URL
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.SCOPES,
        prompt: 'consent', // 强制显示同意屏幕以获取refresh_token
      });

      // 在默认浏览器中打开授权URL
      await shell.openExternal(authUrl);

      // 注意：在实际实现中，需要设置一个本地服务器来接收OAuth回调
      return {
        success: false,
        error: 'Please complete the OAuth flow in your browser and provide the authorization code.',
      };
    } catch (error) {
      console.error('Gmail authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * 使用授权码完成OAuth流程
   * @deprecated 此方法未在当前架构中使用。实际认证通过 RemoteOAuthService + IntegratedAuthService 完成。
   */
  public async completeOAuth(code: string): Promise<AuthResult> {
    try {
      if (!this.oauth2Client) {
        return {
          success: false,
          error: 'OAuth client not configured',
        };
      }

      // 使用授权码获取访问令牌
      const { tokens } = await this.oauth2Client.getToken(code);

      if (tokens.access_token) {
        // 设置凭据
        this.oauth2Client.setCredentials(tokens);

        // 更新配置中的令牌
        this.config.credentials.accessToken = tokens.access_token;
        this.config.credentials.refreshToken = tokens.refresh_token || undefined;
        if (tokens.expiry_date) {
          this.config.credentials.expiresAt = new Date(tokens.expiry_date);
        }

        // 初始化Gmail客户端
        this.gmailClient = google.gmail({ version: 'v1', auth: this.oauth2Client });

        return {
          success: true,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || undefined,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        };
      }

      return {
        success: false,
        error: 'Failed to obtain access token',
      };
    } catch (error) {
      console.error('OAuth completion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth completion failed',
      };
    }
  }

  /**
   * 刷新访问令牌
   * @param accountId 可选的账户ID，用于更新OAuth Server中的token
   */
  public async refreshToken(accountId?: string): Promise<AuthResult> {
    try {
      if (!this.config.credentials.refreshToken) {
        return {
          success: false,
          error: 'No refresh token available, re-authentication required',
        };
      }

      console.log('🔄 [GmailAdapter] Attempting to refresh access token...');
      console.log('🔑 [GmailAdapter] Current OAuth2 Client config:', {
        hasOAuth2Client: !!this.oauth2Client,
        clientId: this.oauth2Client?._clientId,
        clientSecret: this.oauth2Client?._clientSecret ? this.oauth2Client._clientSecret.substring(0, 20) + '...' : 'none',
        refreshToken: this.config.credentials.refreshToken ? this.config.credentials.refreshToken.substring(0, 30) + '...' : 'none',
        accountId,
      });

      // 如果提供了accountId，需要确保使用正确的OAuth app配置
      if (accountId) {
        console.log('🔍 [GmailAdapter] Fetching correct OAuth config for account:', accountId);
        const oauthConfig = await this.fetchOAuthConfigFromServer(accountId);

        if (oauthConfig) {
          console.log('✅ [GmailAdapter] Got OAuth config, recreating OAuth2Client with correct credentials');
          // 重新创建OAuth2Client以使用正确的client_id和client_secret
          this.oauth2Client = new google.auth.OAuth2(
            oauthConfig.clientId,
            oauthConfig.clientSecret,
            'http://localhost:3000/oauth/callback'
          );
          console.log('🔑 [GmailAdapter] New OAuth2 Client created with client_id:', oauthConfig.clientId.substring(0, 20) + '...');
        } else {
          console.warn('⚠️  [GmailAdapter] Failed to fetch OAuth config for account, using existing client');
        }
      }

      if (!this.oauth2Client) {
        return {
          success: false,
          error: 'OAuth client not configured',
        };
      }

      // 设置refresh token
      this.oauth2Client.setCredentials({
        refresh_token: this.config.credentials.refreshToken,
      });

      // 刷新访问令牌
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (credentials.access_token) {
        // 更新配置中的令牌
        this.config.credentials.accessToken = credentials.access_token;
        if (credentials.refresh_token) {
          this.config.credentials.refreshToken = credentials.refresh_token;
        }
        if (credentials.expiry_date) {
          this.config.credentials.expiresAt = new Date(credentials.expiry_date);
        }

        // 更新 OAuth2 客户端凭据
        this.oauth2Client.setCredentials({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || this.config.credentials.refreshToken,
        });

        // 同步更新到 OAuth Server
        if (accountId) {
          await this.syncTokenToOAuthServer(accountId, credentials);
        }

        return {
          success: true,
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || undefined,
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
        };
      }

      return {
        success: false,
        error: 'Failed to refresh access token',
      };
    } catch (error: any) {
      console.error('❌ [GmailAdapter] Token refresh failed:', error);

      // 检查是否是 refresh_token 过期或无效
      if (error.message?.includes('invalid_grant') ||
          error.response?.data?.error === 'invalid_grant') {
        console.error('❌ [GmailAdapter] Refresh token is invalid or expired');
        return {
          success: false,
          error: 'Refresh token expired or invalid, re-authentication required',
          requiresReauth: true,
        };
      }

      // 检查是否是 OAuth 应用配置错误（unauthorized_client）
      if (error.message?.includes('unauthorized_client') ||
          error.response?.data?.error === 'unauthorized_client' ||
          error.cause?.message === 'unauthorized_client') {
        console.error('❌ [GmailAdapter] OAuth client configuration error (unauthorized_client)');
        return {
          success: false,
          error: 'OAuth application configuration error. Please re-authorize your account.',
          requiresReauth: true,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * 将刷新后的 token 同步到 OAuth Server
   * ✅ Phase 2.2 重访：直接使用 token ID，无需额外查询
   * @param tokenId Token ID（从 OAuth Server 的 user_tokens 表的 id 字段）
   */
  private async syncTokenToOAuthServer(tokenId: string, credentials: any): Promise<void> {
    try {
      const serverUrl = await this.getOAuthServerUrl();

      const expiresAt = credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : null;

      if (!expiresAt) {
        console.warn(`⚠️  [GmailAdapter] Cannot sync token: no expiry date in credentials`);
        return;
      }

      console.log(`📡 [GmailAdapter] Syncing refreshed token to OAuth Server (token ID: ${tokenId})`);

      // 使用新的异步更新端点（无需额外查询）
      const response = await fetch(`${serverUrl}/api/tokens/by-id/${tokenId}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: credentials.access_token,
          expires_at: expiresAt,
        }),
      });

      if (response.ok) {
        console.log(`✅ [GmailAdapter] Token synced to OAuth Server (token ID: ${tokenId})`);
      } else {
        console.warn(`⚠️  [GmailAdapter] Token sync failed (${response.status}), but local token is updated`);
      }
    } catch (error) {
      console.warn(`⚠️  [GmailAdapter] Error syncing token to OAuth Server:`, error);
      // 不抛出错误，因为本地已经更新了 token
    }
  }

  /**
   * 验证连接状态
   * @deprecated 此方法未在当前架构中使用。请使用 testConnection() 代替。
   */
  public async validateConnection(): Promise<boolean> {
    try {
      if (!this.gmailClient) {
        return false;
      }

      // 尝试获取用户配置文件来验证连接
      const response = await this.gmailClient.users.getProfile({ userId: 'me' });
      return response.status === 200;
    } catch (error) {
      console.error('Gmail connection validation failed:', error);
      return false;
    }
  }

  /**
   * 执行Gmail邮件搜索
   */
  public async search(request: SearchRequest): Promise<MessageResult[]> {
    try {
      // 如果有多个账户，需要为每个账户执行搜索并合并结果
      const accounts = request.accounts && request.accounts.length > 0 ? request.accounts : [null];

      if (accounts.length > 1) {
        // 并发搜索所有账户
        const searchPromises = accounts.map(async (accountId) => {
          try {
            // 为每个账户创建单独的搜索请求
            const accountRequest = { ...request, accounts: accountId ? [accountId] : [] };
            const accountResults = await this.searchSingleAccount(accountRequest, accountId);
            return accountResults;
          } catch (error) {
            console.error(`❌ [GmailAdapter] Failed to search account ${accountId}:`, error);
            return []; // 返回空数组，继续其他账户的搜索
          }
        });

        // 等待所有搜索完成
        const resultsArrays = await Promise.all(searchPromises);

        // 合并所有结果
        const allResults = resultsArrays.flat();

        return allResults;
      } else {
        // 单账户搜索
        return await this.searchSingleAccount(request, accounts[0]);
      }
    } catch (error) {
      console.error('Gmail search failed:', error);
      throw error;
    }
  }

  /**
   * 搜索单个账户
   */
  private async searchSingleAccount(request: SearchRequest, accountId: string | null): Promise<MessageResult[]> {
    try {
      // 检查账户是否变化
      const accountChanged = accountId && accountId !== this.currentAccountId;

      console.log('🔍 [GmailAdapter] searchSingleAccount - Account check:', {
        accountId,
        currentAccountId: this.currentAccountId,
        accountChanged,
        hasGmailClient: !!this.gmailClient,
      });

      if (accountChanged) {
        console.log('🔄 [GmailAdapter] Account changed, reinitializing client');
        // 清除旧的客户端
        this.gmailClient = null;
        this.oauth2Client = null;
        this.currentAccountId = null;
      }

      // 如果Gmail客户端未初始化，尝试异步初始化
      if (!this.gmailClient) {
        console.log('⚙️  [GmailAdapter] Gmail client not initialized, starting initialization...');
        console.log('📋 [GmailAdapter] Will call initializeClientAsync with accountId:', accountId);
        const initStartTime = Date.now();

        await this.initializeClientAsync(accountId ? [accountId] : undefined);

        // 记录当前账户
        if (accountId) {
          this.currentAccountId = accountId;
        }
      }

      if (!this.oauth2Client) {
        throw new Error('Gmail OAuth client not configured. Please configure clientId and clientSecret in platform settings.');
      }

      if (!this.gmailClient) {
        throw new Error('Gmail client not authenticated. Please authenticate your Gmail account first.');
      }

      // 执行搜索
      const results = await this.performSearch(request, accountId);

      return results;
    } catch (error: any) {
      console.error('Gmail search failed:', error);

      // 检查是否是认证错误
      if (error.code === 401 || error.status === 401 ||
          error.message?.includes('unauthorized') ||
          error.message?.includes('invalid_grant')) {

        // 尝试刷新 token
        const refreshResult = await this.refreshToken(accountId || undefined);

        if (refreshResult.success) {
          // 更新 Gmail 客户端（使用新的 token）
          if (this.oauth2Client) {
            this.gmailClient = google.gmail({ version: 'v1', auth: this.oauth2Client });
          }

          // 重试搜索（递归调用，但只重试一次）
          try {
            return await this.performSearch(request, accountId);
          } catch (retryError) {
            console.error('❌ [GmailAdapter] Retry after token refresh failed:', retryError);
            throw new Error('Search failed even after token refresh. Please try again or re-authorize.');
          }
        } else if (refreshResult.requiresReauth) {
          // Refresh token 也过期了，需要重新授权
          throw new Error('AUTHENTICATION_EXPIRED: Refresh token has expired. Please re-authorize your account.');
        } else {
          // 刷新失败，但不是因为 refresh token 过期
          throw new Error(`AUTHENTICATION_EXPIRED: Failed to refresh token: ${refreshResult.error}`);
        }
      }

      throw error;
    }
  }

  /**
   * 构建智能搜索查询
   * 如果用户使用了高级搜索语法，则保持不变
   * 否则自动扩展为多维度搜索（正文、发件人、收件人、抄送、主题）
   */
  private buildSmartQuery(userQuery: string): string {
    console.log('🔧 [buildSmartQuery] Input:', userQuery);

    // 检测是否包含 Gmail 高级搜索语法
    const hasAdvancedSyntax = /\b(from:|to:|cc:|bcc:|subject:|in:|is:|has:|label:|filename:)/.test(userQuery);
    console.log('🔧 [buildSmartQuery] Has advanced syntax:', hasAdvancedSyntax);

    if (hasAdvancedSyntax) {
      // 用户已经使用高级语法，保持不变
      console.log('🔧 [buildSmartQuery] Returning original query (advanced syntax)');
      return userQuery;
    }

    // 检测是否包含特殊字符（如 @, 空格等），需要用引号包裹
    const needsQuotes = /[@\s]/.test(userQuery);
    console.log('🔧 [buildSmartQuery] Needs quotes:', needsQuotes);

    const quotedQuery = needsQuotes ? `"${userQuery}"` : userQuery;
    console.log('🔧 [buildSmartQuery] Quoted query:', quotedQuery);

    // 自动扩展为多维度搜索
    // 根据 Gmail 官方文档，{ } 表示 OR 关系（任意匹配一个）
    // 使用 { } 语法比多个 OR 更简洁，且避免括号嵌套问题
    // 搜索：消息正文 OR 发件人 OR 收件人 OR 抄送人 OR 主题
    const result = `{${quotedQuery} from:${quotedQuery} to:${quotedQuery} cc:${quotedQuery} subject:${quotedQuery}}`;
    console.log('🔧 [buildSmartQuery] Final result:', result);

    return result;
  }

  /**
   * 执行实际的搜索操作（不包含重试逻辑）
   */
  private async performSearch(request: SearchRequest, accountId: string | null): Promise<MessageResult[]> {
    if (!this.gmailClient) {
      throw new Error('Gmail client not authenticated');
    }

    // 调试：查看原始请求
    console.log('🔍 [performSearch] request.query:', request.query);
    console.log('🔍 [performSearch] request.filters:', JSON.stringify(request.filters, null, 2));

    // 构建Gmail搜索查询 - 使用智能查询构建
    let query = this.buildSmartQuery(request.query);

    // 添加时间范围筛选
    if (request.filters?.dateRange) {
      const startDate = this.formatDateForGmail(request.filters.dateRange.start);
      const endDate = this.formatDateForGmail(request.filters.dateRange.end);
      query += ` after:${startDate} before:${endDate}`;
    }

    // 添加发送人筛选
    if (request.filters?.sender) {
      // 如果 sender 包含空格或特殊字符，需要用引号包裹
      const senderQuery = request.filters.sender.includes(' ') || request.filters.sender.includes('@')
        ? `from:"${request.filters.sender}"`
        : `from:${request.filters.sender}`;
      query += ` ${senderQuery}`;
    }

    // 计算需要获取的消息数量
    const page = request.pagination?.page || 1;
    const limit = request.pagination?.limit || 100;
    const maxResults = page === 1 ? limit + 1 : page * limit + 1;

    // 添加调试日志
    console.log('🔍 [GmailAdapter] Executing search with query:', query);

    // 执行搜索
    const searchResponse = await this.gmailClient.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(maxResults, 500),
    });

    if (!searchResponse.data.messages) {
      return [];
    }

    const totalMessages = searchResponse.data.messages.length;
    const hasNextPage = searchResponse.data.nextPageToken !== undefined || totalMessages > page * limit;

    // 计算分页范围
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const messagesToFetch = searchResponse.data.messages.slice(startIndex, endIndex);

    const results: MessageResult[] = [];
    const batchSize = 10;
    const totalBatches = Math.ceil(messagesToFetch.length / batchSize);

    for (let i = 0; i < messagesToFetch.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      const batch = messagesToFetch.slice(i, i + batchSize);

      const batchPromises = batch.map(async (message) => {
        if (!message.id) return null;

        try {
          const messageDetail = await this.gmailClient!.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full',
          });

          const gmailMessage = messageDetail.data as GmailMessage;
          return await this.convertGmailMessage(gmailMessage, accountId);
        } catch (error) {
          console.error(`Failed to get message details for ${message.id}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // 过滤掉 null 结果并添加到结果数组
      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * 将Gmail消息转换为统一的MessageResult格式
   */
  private async convertGmailMessage(gmailMessage: GmailMessage, accountId: string | null = null): Promise<MessageResult | null> {
    try {
      if (!gmailMessage.payload) {
        return null;
      }

      // 提取邮件头信息
      const headers = gmailMessage.payload.headers || [];
      const getHeader = (name: string): string => {
        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
        return header?.value || '';
      };

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const date = getHeader('Date');
      const to = getHeader('To');

      // 解析发送人信息
      const sender = this.parseSender(from);

      // 提取邮件内容
      const content = GmailHtmlCleaner.extractMessageContent(gmailMessage.payload);

      // 如果没有提取到内容，使用 snippet 并清理
      const finalContent = content || (gmailMessage.snippet ? GmailHtmlCleaner.cleanHtmlContent(gmailMessage.snippet) : '');

      // 生成深度链接
      const deepLink = this.getDeepLink(gmailMessage.id);

      // 创建消息结果
      const messageResult: MessageResult = {
        id: gmailMessage.id,
        platform: 'gmail',
        sender,
        content: finalContent,
        timestamp: date ? new Date(date) : new Date(parseInt(gmailMessage.internalDate || '0')),
        channel: to, // 使用收件人作为"频道"
        deepLink,
        snippet: gmailMessage.snippet ? GmailHtmlCleaner.cleanHtmlContent(gmailMessage.snippet) : '',
        messageType: 'other',
        accountId: accountId || undefined, // 添加账户ID
        metadata: {
          subject,
          threadId: gmailMessage.threadId,
          labelIds: gmailMessage.labelIds,
          to,
          cc: getHeader('Cc'),
          bcc: getHeader('Bcc'),
        },
      };

      return messageResult;
    } catch (error) {
      console.error('Failed to convert Gmail message:', error);
      return null;
    }
  }

  /**
   * 解析发送人信息
   */
  private parseSender(fromHeader: string): MessageSender {
    // 解析 "Name <email@example.com>" 格式
    const emailRegex = /<([^>]+)>/;
    const emailMatch = fromHeader.match(emailRegex);
    const email = emailMatch ? emailMatch[1] : fromHeader;

    let name = fromHeader;
    if (emailMatch) {
      name = fromHeader.replace(emailRegex, '').trim();
      // 移除引号
      name = name.replace(/^["']|["']$/g, '');
    }

    return {
      name: name || email,
      email,
      userId: email,
    };
  }

  /**
   * 格式化日期为Gmail搜索格式
   */
  private formatDateForGmail(date: Date): string {
    // Gmail使用 YYYY/MM/DD 格式
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * 生成Gmail深度链接
   */
  public getDeepLink(messageId: string, additionalParams?: Record<string, string>): string {
    try {
      // Gmail深度链接格式: https://mail.google.com/mail/u/0/#inbox/MESSAGE_ID
      // 或者使用线程ID: https://mail.google.com/mail/u/0/#inbox/THREAD_ID

      const baseUrl = 'https://mail.google.com/mail/u/0/#inbox/';

      // 如果提供了线程ID，优先使用线程ID
      if (additionalParams?.threadId) {
        return baseUrl + additionalParams.threadId;
      }

      return baseUrl + messageId;
    } catch (error) {
      console.error('Failed to generate Gmail deep link:', error);
      return 'https://mail.google.com/';
    }
  }

  /**
   * 获取Gmail用户信息
   * @deprecated 此方法未在当前架构中使用。实际用户信息通过 RemoteOAuthService 获取。
   */
  public async getUserInfo(): Promise<PlatformUserInfo> {
    try {
      if (!this.gmailClient || !this.oauth2Client) {
        throw new Error('Gmail client not initialized');
      }

      // 获取Gmail配置文件
      const profileResponse = await this.gmailClient.users.getProfile({ userId: 'me' });
      const profile = profileResponse.data;

      // 获取用户基本信息
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfoResponse = await oauth2.userinfo.get();
      const userInfo = userInfoResponse.data;

      return {
        id: userInfo.id || 'unknown',
        name: userInfo.name || userInfo.email || 'Unknown User',
        email: userInfo.email || profile.emailAddress || undefined,
        avatar: userInfo.picture || undefined,
        workspace: {
          id: profile.emailAddress || 'gmail',
          name: 'Gmail',
          domain: userInfo.email ? userInfo.email.split('@')[1] : undefined,
        },
      };
    } catch (error) {
      console.error('Failed to get Gmail user info:', error);
      throw error;
    }
  }

  /**
   * 断开连接并清理资源
   * @deprecated 此方法未在当前架构中使用。资源清理由 ServiceManager 统一管理。
   */
  public async disconnect(): Promise<void> {
    try {
      // 只有在有有效令牌时才尝试撤销
      if (this.oauth2Client && this.config.credentials.accessToken && this.config.credentials.accessToken !== 'test-access-token') {
        try {
          await this.oauth2Client.revokeToken(this.config.credentials.accessToken);
        } catch (revokeError) {
          // 撤销令牌失败不应该阻止断开连接
        }
      }

      this.oauth2Client = null;
      this.gmailClient = null;
    } catch (error) {
      console.error('Error during Gmail disconnect:', error);
    }
  }

  /**
   * 测试API连接
   */
  public async testConnection(): Promise<boolean> {
    try {
      if (!this.gmailClient) {
        return false;
      }

      // 尝试获取用户配置文件
      const response = await this.gmailClient.users.getProfile({ userId: 'me' });
      return response.status === 200;
    } catch (error) {
      console.error('Gmail connection test failed:', error);
      return false;
    }
  }
}