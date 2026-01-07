/**
 * Lark(飞书)平台适配器
 * 实现飞书API集成和消息搜索功能
 *
 * 实现方案：由于飞书 API 不提供直接的消息搜索接口，
 * 采用"获取消息列表 + 本地过滤"的方案。
 *
 * 第四阶段优化功能：
 * - 可配置的搜索范围限制
 * - 指数退避重试机制
 * - 详细的错误码处理
 * - 搜索进度实时通知
 *
 * 参考文档：
 * - 获取会话列表: https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/chat/list
 * - 获取消息列表: https://open.larksuite.com/document/server-docs/im-v1/message/list
 */

import * as lark from '@larksuiteoapi/node-sdk';
import { shell, BrowserWindow } from 'electron';
import { PlatformAdapter, PlatformConfig, PlatformType, AuthResult, PlatformUserInfo, LarkSearchConfig, LarkSearchProgress } from '../../../src/types/platform';
import { SearchRequest, MessageResult, MessageSender } from '../../../src/types/search';
import { ConfigurationService } from '../ConfigurationService';

// ========== 飞书 API 错误码常量 ==========

const LARK_ERROR_CODES = {
  /** 无权限访问会话 */
  NO_PERMISSION: 99991663,
  /** 消息已被撤回 */
  MESSAGE_RECALLED: 99991668,
  /** Token 过期 */
  TOKEN_EXPIRED: 99002000,
  /** 请求频率超限 */
  RATE_LIMIT_EXCEEDED: 99991429,
  /** 无效的 Token */
  INVALID_TOKEN: 99991401,
  /** 会话不存在 */
  CHAT_NOT_FOUND: 99991672,
  /** 用户不在会话中 */
  USER_NOT_IN_CHAT: 99991671,
} as const;

// ========== 默认搜索配置 ==========

const DEFAULT_SEARCH_CONFIG: LarkSearchConfig = {
  maxChatsToSearch: 50,
  maxPagesPerChat: 200,
  recentDaysOnly: 30,
  maxSearchResults: 500,
  enableChatFilter: true,
  maxRetries: 3,
  retryBaseDelay: 1000,
};

// ========== 飞书 API 类型定义 ==========

interface LarkMessage {
  message_id: string;
  msg_type: string;
  body: {
    content?: string;
  };
  create_time: string;
  update_time?: string;
  sender: {
    id: string;
    id_type: string;
    sender_type: string;
    tenant_key?: string;
  };
  chat_id?: string;
  parent_id?: string;
  root_id?: string;
  mentions?: Array<{
    key: string;
    id: string;
    id_type: string;
    name: string;
  }>;
}

interface LarkChat {
  chat_id: string;
  name: string;
  avatar?: string;
  description?: string;
  owner_id?: string;
  owner_id_type?: string;
  chat_mode?: string;
  chat_type?: 'p2p' | 'group';
  external?: boolean;
  tenant_key?: string;
}

interface LarkUser {
  user_id?: string;
  open_id?: string;
  union_id?: string;
  name?: string;
  en_name?: string;
  nickname?: string;
  email?: string;
  mobile?: string;
  avatar?: {
    avatar_72?: string;
    avatar_240?: string;
    avatar_640?: string;
    avatar_origin?: string;
  };
  department_ids?: string[];
  status?: {
    is_frozen?: boolean;
    is_resigned?: boolean;
    is_activated?: boolean;
  };
}

// ========== 缓存类型定义 ==========

interface ChatListCache {
  data: LarkChat[];
  timestamp: number;
}

// ========== LarkAdapter 实现 ==========

/**
 * Lark(飞书)平台适配器
 *
 * 提供飞书消息搜索、OAuth 认证、用户信息获取等功能。
 * 由于飞书 API 不支持原生消息搜索，本适配器采用"获取消息列表 + 本地过滤"的方案。
 *
 * @extends PlatformAdapter
 *
 * @example
 * ```typescript
 * const adapter = new LarkAdapter(config);
 *
 * // 设置进度回调
 * adapter.setProgressCallback((progress) => {
 *   console.log(`搜索进度: ${progress.currentChat}/${progress.totalChats}`);
 * });
 *
 * // 执行搜索
 * const results = await adapter.search({
 *   query: 'meeting notes',
 *   filters: {
 *     dateRange: { start: new Date('2025-01-01'), end: new Date() }
 *   }
 * });
 * ```
 *
 * @see {@link https://open.larksuite.com/document/ Lark开放平台文档}
 * @see {@link LarkSearchConfig} 搜索配置选项
 * @see {@link LarkSearchProgress} 搜索进度信息
 */
export class LarkAdapter extends PlatformAdapter {
  private larkClient: lark.Client | null = null;
  private configService?: ConfigurationService;

  // 缓存
  private chatListCache: ChatListCache | null = null;
  private messageCache = new Map<string, MessageResult>();
  private userCache = new Map<string, LarkUser>();

  // 搜索配置（可在运行时更新）
  private searchConfig: LarkSearchConfig = { ...DEFAULT_SEARCH_CONFIG };

  // 进度回调
  private progressCallback?: (progress: LarkSearchProgress) => void;

  // 配置常量
  private readonly CHAT_LIST_CACHE_TTL = 5 * 60 * 1000; // 5 分钟
  private readonly MAX_MESSAGE_CACHE = 1000;
  private readonly MAX_CONCURRENT = 5; // 并发搜索数
  private readonly PAGE_SIZE_CHATS = 100;
  private readonly PAGE_SIZE_MESSAGES = 50;

  /**
   * 创建 LarkAdapter 实例
   *
   * @param config - 平台配置，包含认证凭证和设置选项
   * @param configService - 可选的配置服务，用于获取 OAuth Server URL
   *
   * @example
   * ```typescript
   * const config: PlatformConfig = {
   *   id: 'my-lark',
   *   name: 'lark',
   *   displayName: 'My Lark Workspace',
   *   enabled: true,
   *   credentials: {
   *     accessToken: 'u-xxx',
   *     clientId: 'cli_xxx',
   *     clientSecret: 'xxx'
   *   },
   *   settings: {
   *     platformSpecific: {
   *       larkSearchConfig: {
   *         maxChatsToSearch: 50,
   *         maxPagesPerChat: 10
   *       }
   *     }
   *   }
   * };
   * const adapter = new LarkAdapter(config, configService);
   * ```
   */
  constructor(config: PlatformConfig, configService?: ConfigurationService) {
    super(config);
    this.configService = configService;

    // 从平台配置中读取自定义搜索配置
    if (config.settings?.platformSpecific?.larkSearchConfig) {
      this.searchConfig = {
        ...DEFAULT_SEARCH_CONFIG,
        ...config.settings.platformSpecific.larkSearchConfig,
      };
    }
  }

  /**
   * 更新搜索配置
   *
   * 可在运行时动态调整搜索行为，例如增加搜索范围或调整性能参数。
   *
   * @param config - 部分或完整的搜索配置，将与现有配置合并
   *
   * @example
   * ```typescript
   * // 搜索更多会话
   * adapter.updateSearchConfig({ maxChatsToSearch: 100 });
   *
   * // 扩展时间范围
   * adapter.updateSearchConfig({ recentDaysOnly: 90 });
   * ```
   */
  public updateSearchConfig(config: Partial<LarkSearchConfig>): void {
    this.searchConfig = { ...this.searchConfig, ...config };
  }

  /**
   * 获取当前搜索配置
   *
   * @returns 当前搜索配置的副本
   *
   * @example
   * ```typescript
   * const config = adapter.getSearchConfig();
   * console.log(`最多搜索 ${config.maxChatsToSearch} 个会话`);
   * ```
   */
  public getSearchConfig(): LarkSearchConfig {
    return { ...this.searchConfig };
  }

  /**
   * 设置搜索进度回调函数
   *
   * 设置后，搜索过程中会定期调用此回调函数报告进度。
   * 进度信息同时会通过 IPC 发送到渲染进程（事件名: `lark:search-progress`）。
   *
   * @param callback - 进度回调函数，接收 {@link LarkSearchProgress} 对象
   *
   * @example
   * ```typescript
   * adapter.setProgressCallback((progress) => {
   *   console.log(`阶段: ${progress.stage}`);
   *   console.log(`进度: ${progress.currentChat}/${progress.totalChats}`);
   *   console.log(`已找到: ${progress.matchedMessages} 条消息`);
   * });
   * ```
   */
  public setProgressCallback(callback: (progress: LarkSearchProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * 发送进度通知
   */
  private notifyProgress(progress: LarkSearchProgress): void {
    // 调用回调函数
    if (this.progressCallback) {
      this.progressCallback(progress);
    }

    // 同时通过 IPC 发送到渲染进程
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lark:search-progress', progress);
      }
    } catch (error) {
      // 忽略 IPC 发送错误
    }
  }

  /**
   * 从 OAuth Server 获取 token 信息，并使用 app 凭证获取 tenant_access_token
   * @param accountIds Token IDs（从 OAuth Server 的 user_tokens 表的 id 字段）
   */
  private async fetchTokensFromServer(accountIds?: string[]): Promise<Array<{
    accountId: string;
    accessToken: string;
    appId: string;
    appSecret: string;
    userIdentifier: string;
  }>> {
    try {
      const oauthServerUrl = this.configService
        ? await this.configService.getOAuthServerUrl()
        : process.env.OAUTH_SERVER_URL || 'http://localhost:3000';

      const tokens: Array<{
        accountId: string;
        accessToken: string;
        appId: string;
        appSecret: string;
        userIdentifier: string;
      }> = [];

      if (accountIds && accountIds.length > 0) {
        for (const tokenId of accountIds) {
          try {
            const fullTokenUrl = `${oauthServerUrl}/api/tokens/by-id/${tokenId}/full`;
            const fullTokenResponse = await fetch(fullTokenUrl);

            if (fullTokenResponse.ok) {
              const result = await fullTokenResponse.json();

              if (result.success && result.data) {
                const fullToken = result.data;

                // 验证平台是否正确
                if (fullToken.platform !== 'lark') {
                  console.error('❌ [LarkAdapter] CRITICAL ERROR: Received token for wrong platform!', {
                    expected: 'lark',
                    received: fullToken.platform,
                    token_id: tokenId
                  });
                  continue;
                }

                const appId = fullToken.client_id || '';
                const appSecret = fullToken.client_secret || '';

                // 使用 app 凭证获取 tenant_access_token
                const tenantToken = await this.getTenantAccessToken(appId, appSecret);

                if (!tenantToken) {
                  console.error(`❌ [LarkAdapter] Failed to get tenant_access_token for ${fullToken.user_identifier}`);
                  continue;
                }

                tokens.push({
                  accountId: tokenId,
                  accessToken: tenantToken,
                  appId,
                  appSecret,
                  userIdentifier: fullToken.user_identifier
                });
              }
            } else {
              console.error(`❌ [LarkAdapter] Failed to fetch token ${tokenId}: ${fullTokenResponse.status}`);
            }
          } catch (error) {
            console.error(`❌ [LarkAdapter] Error fetching token ${tokenId}:`, error);
          }
        }

        return tokens;
      }

      console.warn('⚠️  [LarkAdapter] No token IDs provided');
      return [];
    } catch (error) {
      console.error('❌ [LarkAdapter] Error fetching tokens from server:', error);
      return [];
    }
  }

  /**
   * 获取 tenant_access_token
   * @see https://open.larksuite.com/document/server-docs/authentication-management/access-token/tenant_access_token_internal
   */
  private async getTenantAccessToken(appId: string, appSecret: string): Promise<string | null> {
    try {
      const response = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret
        })
      });

      const data = await response.json();

      if (data.code !== 0) {
        console.error(`❌ [LarkAdapter] Failed to get tenant_access_token: ${data.msg}`);
        return null;
      }

      return data.tenant_access_token;
    } catch (error) {
      console.error('❌ [LarkAdapter] Error getting tenant_access_token:', error);
      return null;
    }
  }

  /**
   * 初始化 Lark Client
   */
  private initClient(accessToken: string, appId?: string, appSecret?: string): lark.Client {
    // 使用 user access token 模式
    return new lark.Client({
      appId: appId || this.config.credentials.clientId || '',
      appSecret: appSecret || this.config.credentials.clientSecret || '',
      disableTokenCache: true, // 我们自己管理 token
    });
  }

  /**
   * 获取平台类型
   */
  public getPlatformType(): PlatformType {
    return 'lark';
  }

  /**
   * 进行飞书企业应用认证
   */
  public async authenticate(): Promise<AuthResult> {
    try {
      const clientId = this.config.credentials.clientId;
      const redirectUri = encodeURIComponent('http://localhost:3000/auth/lark/callback');

      // 飞书 OAuth 授权 URL
      const authUrl = `https://open.larksuite.com/open-apis/authen/v1/authorize?app_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=im:chat:readonly%20im:message:readonly%20contact:user.base:readonly`;

      // 在默认浏览器中打开授权 URL
      await shell.openExternal(authUrl);

      return {
        success: false,
        error: 'Please complete the OAuth flow in your browser.',
      };
    } catch (error) {
      console.error('Lark authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * 使用授权码完成 OAuth 流程
   */
  public async completeOAuth(code: string): Promise<AuthResult> {
    try {
      const clientId = this.config.credentials.clientId;
      const clientSecret = this.config.credentials.clientSecret;

      if (!clientId || !clientSecret) {
        return {
          success: false,
          error: 'OAuth provider not configured. Please set clientId and clientSecret.',
        };
      }

      // 获取 app_access_token
      const appTokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: clientId,
          app_secret: clientSecret
        })
      });

      const appTokenData = await appTokenResponse.json();
      if (appTokenData.code !== 0) {
        return {
          success: false,
          error: `Failed to get app token: ${appTokenData.msg}`,
        };
      }

      const appAccessToken = appTokenData.app_access_token;

      // 使用授权码获取 user_access_token
      const userTokenResponse = await fetch('https://open.larksuite.com/open-apis/authen/v1/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appAccessToken}`
        },
        body: JSON.stringify({ code, grant_type: 'authorization_code' })
      });

      const userTokenData = await userTokenResponse.json();
      if (userTokenData.code !== 0) {
        return {
          success: false,
          error: `Failed to get user token: ${userTokenData.msg}`,
        };
      }

      const data = userTokenData.data;

      // 更新配置
      this.config.credentials.accessToken = data.access_token;
      this.config.credentials.refreshToken = data.refresh_token;
      this.config.credentials.expiresAt = new Date(Date.now() + data.expires_in * 1000);

      // 初始化客户端
      this.larkClient = this.initClient(data.access_token, clientId, clientSecret);

      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: this.config.credentials.expiresAt,
        userInfo: {
          id: data.open_id,
          name: data.name,
          email: data.email,
          avatar: data.avatar_url
        }
      };
    } catch (error) {
      console.error('Lark OAuth completion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth completion failed',
      };
    }
  }

  /**
   * 刷新访问令牌
   */
  public async refreshToken(): Promise<AuthResult> {
    try {
      const refreshToken = this.config.credentials.refreshToken;
      const clientId = this.config.credentials.clientId;
      const clientSecret = this.config.credentials.clientSecret;

      if (!refreshToken) {
        return {
          success: false,
          requiresReauth: true,
          error: 'No refresh token available',
        };
      }

      // 获取 app_access_token
      const appTokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: clientId,
          app_secret: clientSecret
        })
      });

      const appTokenData = await appTokenResponse.json();
      if (appTokenData.code !== 0) {
        return {
          success: false,
          requiresReauth: true,
          error: `Failed to get app token: ${appTokenData.msg}`,
        };
      }

      // 刷新 user_access_token
      const refreshResponse = await fetch('https://open.larksuite.com/open-apis/authen/v1/refresh_access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appTokenData.app_access_token}`
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      const refreshData = await refreshResponse.json();
      if (refreshData.code !== 0) {
        return {
          success: false,
          requiresReauth: true,
          error: `Token refresh failed: ${refreshData.msg}`,
        };
      }

      const data = refreshData.data;

      // 更新配置
      this.config.credentials.accessToken = data.access_token;
      this.config.credentials.refreshToken = data.refresh_token;
      this.config.credentials.expiresAt = new Date(Date.now() + data.expires_in * 1000);

      // 重新初始化客户端
      this.larkClient = this.initClient(data.access_token, clientId, clientSecret);

      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: this.config.credentials.expiresAt,
      };
    } catch (error) {
      console.error('Lark token refresh failed:', error);
      return {
        success: false,
        requiresReauth: true,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * 验证连接状态
   */
  public async validateConnection(): Promise<boolean> {
    try {
      const accessToken = this.config.credentials.accessToken;
      if (!accessToken) {
        return false;
      }

      // 尝试获取用户信息来验证连接
      const response = await fetch('https://open.larksuite.com/open-apis/authen/v1/user_info', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      return data.code === 0;
    } catch (error) {
      console.error('Lark connection validation failed:', error);
      return false;
    }
  }

  /**
   * 获取所有会话列表（带缓存）
   */
  private async getAllChats(accessToken: string): Promise<LarkChat[]> {
    const now = Date.now();

    // 检查缓存
    if (this.chatListCache && (now - this.chatListCache.timestamp) < this.CHAT_LIST_CACHE_TTL) {
      console.log('📋 [LarkAdapter] Using cached chat list');
      return this.chatListCache.data;
    }

    const allChats: LarkChat[] = [];
    let pageToken = '';
    let pageCount = 0;

    do {
      pageCount++;

      const url = new URL('https://open.larksuite.com/open-apis/im/v1/chats');
      url.searchParams.set('page_size', this.PAGE_SIZE_CHATS.toString());
      if (pageToken) {
        url.searchParams.set('page_token', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();

      if (data.code !== 0) {
        console.error(`❌ [LarkAdapter] Failed to fetch chats: ${data.msg}`);
        break;
      }

      if (data.data?.items && data.data.items.length > 0) {
        allChats.push(...data.data.items);
      }

      // 检查是否还有更多数据
      if (!data.data?.has_more) {
        break;
      }

      pageToken = data.data.page_token || '';
    } while (pageToken);

    // 更新缓存
    this.chatListCache = {
      data: allChats,
      timestamp: now
    };

    return allChats;
  }

  /**
   * 从消息体中提取可搜索的文本内容
   */
  private extractMessageContent(message: LarkMessage): string {
    try {
      const body = message.body;
      if (!body || !body.content) {
        return '';
      }

      // 解析 JSON 内容
      let content: any;
      try {
        content = JSON.parse(body.content);
      } catch {
        // 如果不是 JSON，直接返回
        return body.content;
      }

      // 根据消息类型提取文本
      switch (message.msg_type) {
        case 'text':
          // 纯文本消息
          return content.text || '';

        case 'post':
          // 富文本消息
          const postContent: string[] = [];
          if (content.title) postContent.push(content.title);
          if (content.content) {
            const extractText = (obj: any): string => {
              if (typeof obj === 'string') return obj;
              if (Array.isArray(obj)) return obj.map(extractText).join(' ');
              if (obj && typeof obj === 'object') {
                if (obj.text) return obj.text;
                return Object.values(obj).map(extractText).join(' ');
              }
              return '';
            };
            postContent.push(extractText(content.content));
          }
          return postContent.join(' ');

        case 'image':
          // 图片消息
          return content.image_key || '[图片]';

        case 'file':
          // 文件消息
          return content.file_name || '[文件]';

        case 'audio':
        case 'video':
        case 'media':
          // 媒体消息
          return content.file_name || content.title || '[媒体]';

        case 'sticker':
          // 表情消息
          return '[表情]';

        case 'share_chat':
          // 分享群聊
          return content.chat_name || '[群聊分享]';

        case 'share_user':
          // 分享用户
          return content.user_name || '[用户分享]';

        default:
          // 其他类型：尝试提取 text 字段或返回 JSON 字符串
          return content.text || JSON.stringify(content);
      }
    } catch (error) {
      console.error('[LarkAdapter] Failed to extract message content:', error);
      return '';
    }
  }

  /**
   * 系统消息类型列表（这些消息会被过滤掉）
   */
  private readonly SYSTEM_MESSAGE_TYPES = [
    'system',           // 系统消息
    'share_calendar_event', // 日历分享
    'general_calendar', // 日历消息
    'hongbao',          // 红包
    'merge_forward',    // 合并转发
  ];

  /**
   * 检查消息内容是否为系统模板消息
   * 系统模板消息通常包含 template 字段，如邀请成员、撤回消息等通知
   */
  private isSystemTemplateMessage(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      // 检查是否包含 template 字段（系统消息的典型特征）
      return typeof parsed.template === 'string' && parsed.template.includes('{');
    } catch {
      return false;
    }
  }

  /**
   * 检查消息是否匹配搜索条件
   */
  private messageMatchesQuery(message: LarkMessage, request: SearchRequest): boolean {
    // 0. 过滤系统消息类型
    if (this.SYSTEM_MESSAGE_TYPES.includes(message.msg_type)) {
      return false;
    }

    // 0.1 过滤系统模板消息（如邀请成员加入群组等通知）
    if (message.body?.content && this.isSystemTemplateMessage(message.body.content)) {
      return false;
    }

    // 1. 关键词匹配（大小写不敏感）
    const content = this.extractMessageContent(message);
    const queryLower = request.query.toLowerCase();

    if (!content.toLowerCase().includes(queryLower)) {
      return false;
    }

    // 2. 发送人过滤（如果指定）
    if (request.filters?.sender) {
      const sender = request.filters.sender.toLowerCase();
      const senderId = message.sender?.id || '';

      if (!senderId.toLowerCase().includes(sender)) {
        return false;
      }
    }

    // 3. 消息类型过滤（如果指定）
    if (request.filters?.messageType && request.filters.messageType !== 'all') {
      const typeMap: Record<string, string[]> = {
        'text': ['text', 'post'],
        'file': ['file', 'media', 'audio', 'video'],
        'image': ['image']
      };

      const allowedTypes = typeMap[request.filters.messageType] || [];
      if (!allowedTypes.includes(message.msg_type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 映射飞书消息类型到统一类型
   */
  private mapLarkMessageType(larkType: string): 'text' | 'file' | 'image' | 'other' {
    switch (larkType) {
      case 'text':
      case 'post':
        return 'text';
      case 'image':
        return 'image';
      case 'file':
      case 'audio':
      case 'video':
      case 'media':
        return 'file';
      default:
        return 'other';
    }
  }

  /**
   * 获取用户信息（带缓存）
   */
  private async fetchUserInfo(accessToken: string, userId: string): Promise<LarkUser | null> {
    // 检查缓存
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    try {
      const url = new URL('https://open.larksuite.com/open-apis/contact/v3/users/' + userId);
      url.searchParams.set('user_id_type', 'open_id');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();

      if (data.code === 0 && data.data?.user) {
        const user = data.data.user as LarkUser;
        this.userCache.set(userId, user);
        return user;
      }
    } catch {
      // Silently ignore user info fetch errors
    }

    return null;
  }

  /**
   * 将飞书消息转换为统一的 MessageResult 格式
   */
  private async convertLarkMessage(
    message: LarkMessage,
    chatId: string,
    chatName: string,
    accessToken: string,
    accountId: string
  ): Promise<MessageResult> {
    const cacheKey = `${chatId}_${message.message_id}`;

    // 检查缓存
    if (this.messageCache.has(cacheKey)) {
      return this.messageCache.get(cacheKey)!;
    }

    // 提取发送者信息
    let sender: MessageSender = {
      name: 'Unknown',
      userId: message.sender?.id || ''
    };

    // 尝试获取用户详细信息
    if (message.sender?.id) {
      const userInfo = await this.fetchUserInfo(accessToken, message.sender.id);
      if (userInfo) {
        sender = {
          name: userInfo.name || userInfo.en_name || 'Unknown',
          userId: userInfo.open_id || message.sender.id,
          email: userInfo.email,
          avatar: userInfo.avatar?.avatar_72 || userInfo.avatar?.avatar_240
        };
      }
    }

    // 提取消息内容
    const content = this.extractMessageContent(message);

    // 生成摘要
    const snippet = content.length > 200
      ? content.substring(0, 200) + '...'
      : content;

    // 消息时间
    const timestamp = new Date(parseInt(message.create_time));

    // 生成深度链接
    const deepLink = this.getDeepLink(message.message_id, {
      chat_id: chatId
    });

    const result: MessageResult = {
      id: message.message_id,
      platform: 'lark',
      sender,
      content,
      snippet,
      timestamp,
      deepLink,
      messageType: this.mapLarkMessageType(message.msg_type),
      channel: chatName,
      accountId,
      metadata: {
        msg_type: message.msg_type,
        chat_id: chatId,
        parent_id: message.parent_id,
        root_id: message.root_id
      }
    };

    // 添加到缓存（LRU 策略）
    if (this.messageCache.size >= this.MAX_MESSAGE_CACHE) {
      const firstKey = this.messageCache.keys().next().value;
      if (firstKey) {
        this.messageCache.delete(firstKey);
      }
    }
    this.messageCache.set(cacheKey, result);

    return result;
  }

  /**
   * 在单个会话中搜索消息
   */
  private async searchInChat(
    chat: LarkChat,
    request: SearchRequest,
    accessToken: string,
    accountId: string
  ): Promise<MessageResult[]> {
    const matchedMessages: MessageResult[] = [];
    let pageToken = '';
    let pageCount = 0;

    // 转换时间参数（毫秒时间戳）
    const startTime = request.filters?.dateRange?.start
      ? request.filters.dateRange.start.getTime().toString()
      : undefined;

    const endTime = request.filters?.dateRange?.end
      ? request.filters.dateRange.end.getTime().toString()
      : undefined;

    try {
      do {
        pageCount++;

        const url = new URL('https://open.larksuite.com/open-apis/im/v1/messages');
        url.searchParams.set('container_id', chat.chat_id);
        url.searchParams.set('container_id_type', 'chat');
        url.searchParams.set('page_size', this.PAGE_SIZE_MESSAGES.toString());

        if (startTime) {
          url.searchParams.set('start_time', startTime);
        }
        if (endTime) {
          url.searchParams.set('end_time', endTime);
        }
        if (pageToken) {
          url.searchParams.set('page_token', pageToken);
        }

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        const data = await response.json();

        if (data.code !== 0) {
          // 处理特定错误码
          if (data.code === 99991663) {
            console.warn(`⚠️  [LarkAdapter] No permission to access chat ${chat.chat_id}, skipping`);
            return [];
          }
          console.error(`❌ [LarkAdapter] Failed to fetch messages from chat ${chat.chat_id}: ${data.msg}`);
          break;
        }

        // 本地过滤匹配的消息
        if (data.data?.items) {
          for (const message of data.data.items) {
            if (this.messageMatchesQuery(message, request)) {
              const converted = await this.convertLarkMessage(
                message,
                chat.chat_id,
                chat.name || '',
                accessToken,
                accountId
              );
              matchedMessages.push(converted);
            }
          }
        }

        // 检查是否还有更多消息
        if (!data.data?.has_more) {
          break;
        }

        pageToken = data.data.page_token || '';

        // 限制每个会话的最大页数，避免搜索时间过长
        if (pageCount >= this.searchConfig.maxPagesPerChat) {
          console.log(`⏹️  [LarkAdapter] Reached max pages (${this.searchConfig.maxPagesPerChat}) for chat ${chat.chat_id}`);
          break;
        }
      } while (pageToken);

      if (matchedMessages.length > 0) {
        console.log(`  ✅ Chat "${chat.name}": found ${matchedMessages.length} messages (searched ${pageCount} pages)`);
      }
    } catch (error: any) {
      // 处理 API 限流
      if (error.code === 99991429) {
        console.warn(`⚠️  [LarkAdapter] Rate limited for chat ${chat.chat_id}, skipping`);
        return [];
      }
      console.error(`❌ [LarkAdapter] Error searching chat ${chat.chat_id}:`, error);
    }

    return matchedMessages;
  }

  /**
   * 对单个账户执行搜索（带进度通知和优化配置）
   */
  private async searchSingleAccount(
    tokenData: {
      accountId: string;
      accessToken: string;
      appId: string;
      appSecret: string;
      userIdentifier: string;
    },
    request: SearchRequest
  ): Promise<MessageResult[]> {
    console.log(`🔍 [LarkAdapter] Searching account: ${tokenData.userIdentifier}`);

    const allResults: MessageResult[] = [];

    // 发送初始进度通知
    this.notifyProgress({
      stage: 'fetching_chats',
      totalChats: 0,
      processedChats: 0,
      foundMessages: 0,
      currentAccount: tokenData.userIdentifier,
      percentage: 0,
    });

    try {
      // 获取所有会话列表（带重试）
      const chats = await this.retryWithBackoff(
        () => this.getAllChats(tokenData.accessToken),
        `Fetching chats for ${tokenData.userIdentifier}`
      );

      // 应用过滤器
      const chatsToSearch = this.filterChats(chats);
      const totalChats = chatsToSearch.length;

      // 发送搜索开始进度通知
      this.notifyProgress({
        stage: 'searching',
        totalChats,
        processedChats: 0,
        foundMessages: 0,
        currentAccount: tokenData.userIdentifier,
        percentage: 5, // 获取会话列表完成后为 5%
      });

      // 分批并发搜索
      const chatBatches = this.chunkArray(chatsToSearch, this.MAX_CONCURRENT);
      let processedChats = 0;

      for (const batch of chatBatches) {
        // 早停检查
        if (allResults.length >= this.searchConfig.maxSearchResults) {
          console.log(`⏹️  [LarkAdapter] Reached max results (${this.searchConfig.maxSearchResults}), stopping search`);
          break;
        }

        const searchPromises = batch.map(async (chat) => {
          try {
            // 带重试的搜索
            return await this.retryWithBackoff(
              () => this.searchInChat(chat, request, tokenData.accessToken, tokenData.accountId),
              `Searching chat ${chat.name || chat.chat_id}`
            );
          } catch (error: any) {
            const action = this.handleApiError(error, `Search chat ${chat.name || chat.chat_id}`);
            if (action === 'skip') {
              return [];
            }
            // 对于 throw 的情况，我们选择记录错误但继续搜索其他会话
            console.error(`❌ [LarkAdapter] Skipping chat ${chat.chat_id} due to error`);
            return [];
          }
        });

        const batchResults = await Promise.all(searchPromises);
        const flatResults = batchResults.flat();
        allResults.push(...flatResults);

        // 更新进度
        processedChats += batch.length;
        const percentage = Math.min(95, 5 + Math.round((processedChats / totalChats) * 90));

        this.notifyProgress({
          stage: 'searching',
          totalChats,
          processedChats,
          foundMessages: allResults.length,
          currentChat: batch[batch.length - 1]?.name || batch[batch.length - 1]?.chat_id,
          currentAccount: tokenData.userIdentifier,
          percentage,
        });
      }

      // 发送完成通知
      this.notifyProgress({
        stage: 'completed',
        totalChats,
        processedChats: totalChats,
        foundMessages: allResults.length,
        currentAccount: tokenData.userIdentifier,
        percentage: 100,
      });

      console.log(`🎉 [LarkAdapter] Account ${tokenData.userIdentifier}: found ${allResults.length} messages`);
    } catch (error: any) {
      console.error(`❌ [LarkAdapter] Error searching account ${tokenData.userIdentifier}:`, error);

      // 发送错误通知
      this.notifyProgress({
        stage: 'error',
        totalChats: 0,
        processedChats: 0,
        foundMessages: allResults.length,
        currentAccount: tokenData.userIdentifier,
        percentage: 0,
        error: this.getErrorMessage(this.extractErrorCode(error), error.message),
      });
    }

    return allResults;
  }

  /**
   * 执行飞书消息搜索（支持多账户）
   */
  public async search(request: SearchRequest): Promise<MessageResult[]> {
    console.log(`🔍 [LarkAdapter] Starting search for: "${request.query}"`);

    try {
      // 从 OAuth 服务器获取所有选中账户的 tokens
      const tokensData = await this.fetchTokensFromServer(request.accounts);

      if (tokensData.length === 0) {
        throw new Error('No valid tokens available for selected accounts');
      }

      // 并行搜索所有账户
      const searchPromises = tokensData.map(tokenData =>
        this.searchSingleAccount(tokenData, request)
      );

      const allResults = await Promise.all(searchPromises);

      // 合并所有结果
      const combinedResults = allResults.flat();

      // 按时间戳降序排序（最新的在前）
      combinedResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      console.log(`🎉 [LarkAdapter] Total found: ${combinedResults.length} messages`);

      return combinedResults;
    } catch (error) {
      console.error('❌ [LarkAdapter] Search failed:', error);
      throw error;
    }
  }

  /**
   * 生成飞书深度链接
   */
  public getDeepLink(messageId: string, additionalParams?: Record<string, string>): string {
    try {
      const chatId = additionalParams?.chat_id;

      if (chatId && messageId) {
        // 飞书客户端深度链接格式
        // 注意：实际格式可能需要根据飞书文档调整
        return `https://applink.larksuite.com/client/chat/open?openChatId=${chatId}&messageId=${messageId}`;
      }

      // 备选：网页版链接
      if (chatId) {
        return `https://www.larksuite.com/messenger/${chatId}`;
      }

      // 最后的备选方案
      return 'https://www.larksuite.com/';
    } catch (error) {
      console.error('[LarkAdapter] Failed to generate deep link:', error);
      return 'https://www.larksuite.com/';
    }
  }

  /**
   * 获取飞书用户信息
   */
  public async getUserInfo(): Promise<PlatformUserInfo> {
    try {
      const accessToken = this.config.credentials.accessToken;
      if (!accessToken) {
        throw new Error('Access token not available');
      }

      const response = await fetch('https://open.larksuite.com/open-apis/authen/v1/user_info', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();

      if (data.code !== 0) {
        throw new Error(`Failed to get user info: ${data.msg}`);
      }

      const user = data.data;
      return {
        id: user.open_id || user.user_id,
        name: user.name,
        email: user.email,
        avatar: user.avatar_url
      };
    } catch (error) {
      console.error('[LarkAdapter] Failed to get user info:', error);
      throw error;
    }
  }

  /**
   * 断开连接并清理资源
   */
  public async disconnect(): Promise<void> {
    this.larkClient = null;
    this.chatListCache = null;
    this.messageCache.clear();
    this.userCache.clear();
    console.log('🧹 [LarkAdapter] Disconnected and cleaned up');
  }

  /**
   * 测试 API 连接
   */
  public async testConnection(): Promise<boolean> {
    return this.validateConnection();
  }

  /**
   * 将数组分成指定大小的块
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 睡眠工具方法
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带指数退避的重试机制
   * @param fn 要执行的异步函数
   * @param context 上下文信息（用于日志）
   * @returns 执行结果
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    const { maxRetries, retryBaseDelay } = this.searchConfig;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const errorCode = this.extractErrorCode(error);

        // 判断是否应该重试
        if (!this.shouldRetry(errorCode, attempt)) {
          throw error;
        }

        // 计算退避延迟
        const delay = this.calculateBackoffDelay(attempt, errorCode);
        console.log(`⏳ [LarkAdapter] ${context} failed (attempt ${attempt + 1}/${maxRetries}), retrying after ${delay}ms...`);
        console.log(`   Error: ${this.getErrorMessage(errorCode, error.message)}`);

        await this.sleep(delay);
      }
    }

    throw lastError || new Error(`${context} failed after ${maxRetries} retries`);
  }

  /**
   * 从错误对象中提取错误码
   */
  private extractErrorCode(error: any): number | null {
    if (typeof error?.code === 'number') {
      return error.code;
    }
    if (typeof error?.error?.code === 'number') {
      return error.error.code;
    }
    if (typeof error?.data?.code === 'number') {
      return error.data.code;
    }
    return null;
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(errorCode: number | null, attempt: number): boolean {
    // 如果已经到达最大重试次数，不再重试
    if (attempt >= this.searchConfig.maxRetries - 1) {
      return false;
    }

    // 这些错误不应该重试
    const noRetryErrors: number[] = [
      LARK_ERROR_CODES.NO_PERMISSION,
      LARK_ERROR_CODES.MESSAGE_RECALLED,
      LARK_ERROR_CODES.CHAT_NOT_FOUND,
      LARK_ERROR_CODES.USER_NOT_IN_CHAT,
    ];

    if (errorCode !== null && noRetryErrors.includes(errorCode)) {
      return false;
    }

    // 这些错误应该重试
    const retryableErrors: number[] = [
      LARK_ERROR_CODES.RATE_LIMIT_EXCEEDED,
      LARK_ERROR_CODES.TOKEN_EXPIRED,
      LARK_ERROR_CODES.INVALID_TOKEN,
    ];

    // 如果是可重试的错误码，或者是网络错误（无错误码），则重试
    if (errorCode === null || retryableErrors.includes(errorCode)) {
      return true;
    }

    return false;
  }

  /**
   * 计算退避延迟时间
   */
  private calculateBackoffDelay(attempt: number, errorCode: number | null): number {
    const baseDelay = this.searchConfig.retryBaseDelay;

    // 对于限流错误，使用更长的延迟
    if (errorCode === LARK_ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      return baseDelay * Math.pow(2, attempt + 1); // 2s, 4s, 8s
    }

    // 对于其他错误，使用标准的指数退避
    return baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
  }

  /**
   * 根据错误码获取用户友好的错误消息
   */
  private getErrorMessage(errorCode: number | null, fallbackMessage: string): string {
    switch (errorCode) {
      case LARK_ERROR_CODES.NO_PERMISSION:
        return '无权限访问该会话';
      case LARK_ERROR_CODES.MESSAGE_RECALLED:
        return '消息已被撤回';
      case LARK_ERROR_CODES.TOKEN_EXPIRED:
        return 'Token 已过期，需要重新授权';
      case LARK_ERROR_CODES.RATE_LIMIT_EXCEEDED:
        return '请求频率超限，请稍后重试';
      case LARK_ERROR_CODES.INVALID_TOKEN:
        return 'Token 无效，请重新授权';
      case LARK_ERROR_CODES.CHAT_NOT_FOUND:
        return '会话不存在或已被删除';
      case LARK_ERROR_CODES.USER_NOT_IN_CHAT:
        return '用户不在该会话中';
      default:
        return fallbackMessage || '未知错误';
    }
  }

  /**
   * 处理 API 错误并决定下一步操作
   * @returns 'skip' - 跳过该操作继续执行，'retry' - 需要重试，'throw' - 抛出错误
   */
  private handleApiError(error: any, context: string): 'skip' | 'retry' | 'throw' {
    const errorCode = this.extractErrorCode(error);
    const errorMessage = this.getErrorMessage(errorCode, error.message);

    switch (errorCode) {
      case LARK_ERROR_CODES.NO_PERMISSION:
        console.warn(`⚠️  [LarkAdapter] ${context}: ${errorMessage}`);
        return 'skip';

      case LARK_ERROR_CODES.MESSAGE_RECALLED:
        console.warn(`⚠️  [LarkAdapter] ${context}: ${errorMessage}`);
        return 'skip';

      case LARK_ERROR_CODES.CHAT_NOT_FOUND:
      case LARK_ERROR_CODES.USER_NOT_IN_CHAT:
        console.warn(`⚠️  [LarkAdapter] ${context}: ${errorMessage}`);
        return 'skip';

      case LARK_ERROR_CODES.TOKEN_EXPIRED:
      case LARK_ERROR_CODES.INVALID_TOKEN:
        console.error(`❌ [LarkAdapter] ${context}: ${errorMessage}`);
        return 'throw';

      case LARK_ERROR_CODES.RATE_LIMIT_EXCEEDED:
        console.warn(`⏳ [LarkAdapter] ${context}: ${errorMessage}`);
        return 'retry';

      default:
        console.error(`❌ [LarkAdapter] ${context}: ${errorMessage}`, error);
        return 'throw';
    }
  }

  /**
   * 过滤会话列表（根据配置）
   */
  private filterChats(chats: LarkChat[]): LarkChat[] {
    if (!this.searchConfig.enableChatFilter) {
      return chats.slice(0, this.searchConfig.maxChatsToSearch);
    }

    let filteredChats = [...chats];

    // 限制搜索的会话数量
    filteredChats = filteredChats.slice(0, this.searchConfig.maxChatsToSearch);

    return filteredChats;
  }
}
