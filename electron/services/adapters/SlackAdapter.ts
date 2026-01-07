/**
 * Slack平台适配器
 * 实现Slack API集成和消息搜索功能
 */

import { WebClient } from '@slack/web-api';
import { InstallProvider } from '@slack/oauth';
import { shell } from 'electron';
import { PlatformAdapter, PlatformConfig, PlatformType, AuthResult, PlatformUserInfo } from '../../../src/types/platform';
import { SearchRequest, MessageResult, MessageSender } from '../../../src/types/search';
import { ConfigurationService } from '../ConfigurationService';

interface SlackMessage {
  type: string;
  ts: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  attachments?: Array<{
    fallback?: string;
    text?: string;
    pretext?: string;
    title?: string;
    fields?: Array<{
      title?: string;
      value?: string;
    }>;
  }>;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    elements?: Array<any>;
  }>;
  channel?: {
    id: string;
    name: string;
  };
  permalink?: string;
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    email?: string;
    image_72?: string;
    display_name?: string;
  };
}

interface SlackTeam {
  id: string;
  name: string;
  domain?: string;
}

export class SlackAdapter extends PlatformAdapter {
  private webClient: WebClient | null = null;
  private installProvider: InstallProvider | null = null;
  private configService?: ConfigurationService;

  constructor(config: PlatformConfig, configService?: ConfigurationService) {
    super(config);
    this.configService = configService;
    // 初始化OAuth提供者（用于认证流程）
    if (this.config.credentials.clientId && this.config.credentials.clientSecret) {
      this.installProvider = new InstallProvider({
        clientId: this.config.credentials.clientId,
        clientSecret: this.config.credentials.clientSecret,
        stateSecret: 'slack-oauth-state-secret',
      });
    }
  }

  /**
   * 从OAuth服务器获取token和team信息
   * ✅ Phase 2.3: 优化为直接使用 token IDs（仅 1 次请求）
   * @param accountIds Token IDs（从 OAuth Server 的 user_tokens 表的 id 字段）
   * @returns 返回token数据数组，每个元素包含accountId、accessToken和teamId
   */
  private async fetchTokensFromServer(accountIds?: string[]): Promise<Array<{ accountId: string; accessToken: string; teamId: string }>> {
    try {
      const oauthServerUrl = this.configService
        ? await this.configService.getOAuthServerUrl()
        : process.env.OAUTH_SERVER_URL || 'http://localhost:3000';

      const tokens: Array<{ accountId: string; accessToken: string; teamId: string }> = [];

      // ✅ 优化：直接使用 token IDs，无需查询列表
      if (accountIds && accountIds.length > 0) {
        console.log(`📡 [SlackAdapter] Fetching ${accountIds.length} tokens by IDs`);

        for (const tokenId of accountIds) {
          try {
            // 使用新 API：直接通过 token ID 获取完整令牌（仅 1 次请求）
            const fullTokenUrl = `${oauthServerUrl}/api/tokens/by-id/${tokenId}/full`;
            const fullTokenResponse = await fetch(fullTokenUrl);

            if (fullTokenResponse.ok) {
              const result = await fullTokenResponse.json();

              if (result.success && result.data) {
                const fullToken = result.data;

                // 验证平台是否正确
                if (fullToken.platform !== 'slack') {
                  console.error('❌ [SlackAdapter] CRITICAL ERROR: Received token for wrong platform!', {
                    expected: 'slack',
                    received: fullToken.platform,
                    token_id: tokenId
                  });
                  continue;
                }

                // 从user_info中提取team_id
                let teamId = '';
                if (fullToken.user_info) {
                  try {
                    const userInfo = typeof fullToken.user_info === 'string'
                      ? JSON.parse(fullToken.user_info)
                      : fullToken.user_info;
                    teamId = userInfo.team_id || '';
                  } catch (e) {
                    console.error('Failed to parse user_info:', e);
                  }
                }

                tokens.push({
                  accountId: fullToken.user_identifier,
                  accessToken: fullToken.access_token,
                  teamId
                });

                console.log(`✅ [SlackAdapter] Token fetched for ${fullToken.user_identifier} (1 request)`);
              }
            } else {
              console.error(`❌ [SlackAdapter] Failed to fetch token ${tokenId}: ${fullTokenResponse.status}`);
            }
          } catch (error) {
            console.error(`❌ [SlackAdapter] Error fetching token ${tokenId}:`, error);
          }
        }

        return tokens;
      }

      // 如果没有指定 token IDs，返回空数组（前端应该总是传递 token IDs）
      console.warn('⚠️  [SlackAdapter] No token IDs provided');
      return [];
    } catch (error) {
      console.error('❌ [SlackAdapter] Error fetching tokens from server:', error);
      return [];
    }
  }

  /**
   * 获取平台类型
   */
  public getPlatformType(): PlatformType {
    return 'slack';
  }

  /**
   * 进行Slack OAuth认证
   */
  public async authenticate(): Promise<AuthResult> {
    try {
      if (!this.installProvider) {
        return {
          success: false,
          error: 'OAuth provider not configured. Please set clientId and clientSecret.',
        };
      }

      // 生成OAuth授权URL
      const authUrl = await this.installProvider.generateInstallUrl({
        scopes: ['search:read', 'users:read', 'channels:read', 'groups:read', 'im:read', 'mpim:read'],
        userScopes: ['search:read'],
      });

      // 在默认浏览器中打开授权URL
      await shell.openExternal(authUrl);

      // 注意：在实际实现中，需要设置一个本地服务器来接收OAuth回调
      // 这里返回一个提示，实际的令牌交换需要在回调处理中完成
      return {
        success: false,
        error: 'Please complete the OAuth flow in your browser and provide the authorization code.',
      };
    } catch (error) {
      console.error('Slack authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * 使用授权码完成OAuth流程
   */
  public async completeOAuth(code: string, state?: string): Promise<AuthResult> {
    try {
      if (!this.installProvider) {
        return {
          success: false,
          error: 'OAuth provider not configured',
        };
      }

      // 使用WebClient直接进行OAuth令牌交换
      const oauthClient = new WebClient();
      const result = await oauthClient.oauth.v2.access({
        client_id: this.config.credentials.clientId!,
        client_secret: this.config.credentials.clientSecret!,
        code: code,
      });

      if (result.ok && result.access_token) {
        // 更新配置中的访问令牌
        this.config.credentials.accessToken = result.access_token;

        // 保存团队信息
        if (result.team) {
          this.config.credentials.additional = {
            ...this.config.credentials.additional,
            teamId: (result.team as any).id,
            domain: (result.team as any).name,
          };
        }

        // 重新初始化客户端
        this.webClient = new WebClient(result.access_token);

        // 获取用户信息
        const userInfo = await this.getUserInfo();

        return {
          success: true,
          accessToken: result.access_token,
          userInfo,
        };
      }

      return {
        success: false,
        error: 'Failed to obtain access token: ' + result.error,
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
   */
  public async refreshToken(): Promise<AuthResult> {
    // Slack的bot tokens通常不会过期，但用户tokens可能需要刷新
    // 对于bot tokens，我们只需要验证当前token是否仍然有效
    try {
      const isValid = await this.testConnection();
      if (isValid) {
        return {
          success: true,
          accessToken: this.config.credentials.accessToken,
        };
      }

      // 如果token无效，需要重新认证
      return {
        success: false,
        error: 'Token is invalid, re-authentication required',
      };
    } catch (error) {
      console.error('Token refresh failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * 验证连接状态
   */
  public async validateConnection(): Promise<boolean> {
    try {
      if (!this.webClient) {
        return false;
      }

      const result = await this.webClient.auth.test();
      return result.ok === true;
    } catch (error) {
      console.error('Slack connection validation failed:', error);
      return false;
    }
  }

  /**
   * 构建智能搜索查询
   * 如果用户使用了高级搜索语法，则保持不变
   * 否则自动扩展为多维度搜索（消息内容、发送人）
   */
  private buildSmartQuery(userQuery: string): string {
    // 检测是否包含 Slack 高级搜索语法
    const hasAdvancedSyntax = /\b(from:|in:|to:|on:|before:|after:|during:)/.test(userQuery);

    if (hasAdvancedSyntax) {
      // 用户已经使用高级语法，保持不变
      return userQuery;
    }

    // Slack 的搜索默认会同时搜索消息内容和发送人
    // 不需要显式添加 OR from: 语法
    // 直接返回原始查询即可
    return userQuery;
  }

  /**
   * 对单个账户执行搜索
   */
  private async searchSingleAccount(
    tokenData: { accountId: string; accessToken: string; teamId: string },
    request: SearchRequest
  ): Promise<MessageResult[]> {
    try {
      // 为这个账户创建WebClient
      const webClient = new WebClient(tokenData.accessToken);

      // 构建搜索查询 - 使用智能查询构建
      let query = this.buildSmartQuery(request.query);

      // 添加时间范围筛选
      if (request.filters?.dateRange) {
        const startDate = Math.floor(request.filters.dateRange.start.getTime() / 1000);
        const endDate = Math.floor(request.filters.dateRange.end.getTime() / 1000);
        query += ` after:${startDate} before:${endDate}`;
      }

      // 添加发送人筛选
      if (request.filters?.sender) {
        query += ` from:${request.filters.sender}`;
      }

      console.log(`🔍 [SlackAdapter] Executing search with query: "${query}"`);

      // 执行搜索
      const searchResult = await webClient.search.messages({
        query,
        count: request.pagination?.limit || 100,
        page: request.pagination?.page || 1,
      });

      console.log(`🔍 [SlackAdapter] Search result:`, {
        ok: searchResult.ok,
        messageCount: searchResult.messages?.matches?.length || 0,
        error: searchResult.error || 'none'
      });

      if (!searchResult.ok || !searchResult.messages) {
        console.error('Search failed for account', tokenData.accountId, ':', searchResult.error);
        return [];
      }

      // 获取用户信息缓存
      const userCache = new Map<string, SlackUser>();
      const getUserInfo = async (userId: string): Promise<SlackUser | null> => {
        if (userCache.has(userId)) {
          return userCache.get(userId)!;
        }

        try {
          const userResult = await webClient.users.info({ user: userId });
          if (userResult.ok && userResult.user) {
            const user = userResult.user as SlackUser;
            userCache.set(userId, user);
            return user;
          }
        } catch (error) {
          console.error('Failed to get user info:', error);
        }
        return null;
      };

      // 转换搜索结果
      const results: MessageResult[] = [];

      if (searchResult.messages.matches) {
        for (const match of searchResult.messages.matches) {
          const message = match as any;

          // 提取消息的 team ID
          const messageTeamId = message.team || message.team_id;

          // 过滤：只返回当前 team 的消息
          if (tokenData.teamId && messageTeamId && messageTeamId !== tokenData.teamId) {
            continue;
          }

          // 获取发送人信息
          let sender: MessageSender = {
            name: 'Unknown User',
            userId: message.user,
          };

          if (message.user) {
            const userInfo = await getUserInfo(message.user);
            if (userInfo) {
              sender = {
                name: userInfo.real_name || userInfo.name,
                displayName: userInfo.profile?.display_name,
                email: userInfo.profile?.email,
                avatar: userInfo.profile?.image_72,
                userId: userInfo.id,
              };
            }
          }

          // 优先使用 Slack API 返回的 permalink，这是最准确的链接
          // 如果没有 permalink，则生成深度链接
          const deepLink = message.permalink || this.getDeepLink(message.ts, {
            channel: message.channel?.id || '',
            team: messageTeamId || tokenData.teamId,
          });

          // 提取消息内容
          const content = this.extractMessageContent(message);

          // 创建消息结果
          const messageResult: MessageResult = {
            id: message.ts,
            platform: 'slack',
            sender,
            content,
            timestamp: new Date(parseFloat(message.ts) * 1000),
            channel: message.channel?.name,
            deepLink,
            snippet: this.generateSnippet(content),
            messageType: 'text',
            metadata: {
              channelId: message.channel?.id,
              permalink: message.permalink,
              hasAttachments: (message.attachments && message.attachments.length > 0) || false,
              hasBlocks: (message.blocks && message.blocks.length > 0) || false,
              accountId: tokenData.accountId,
              teamId: tokenData.teamId,
            },
          };

          results.push(messageResult);
        }
      }

      return results;
    } catch (error) {
      console.error('Search failed for account', tokenData.accountId, ':', error);
      return [];
    }
  }

  /**
   * 执行Slack消息搜索（支持多账户）
   */
  public async search(request: SearchRequest): Promise<MessageResult[]> {
    try {
      // 从OAuth服务器获取所有选中账户的tokens
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

      return combinedResults;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * 提取Slack消息内容
   * 支持 text, attachments, blocks 等多种格式
   */
  private extractMessageContent(message: SlackMessage): string {
    const parts: string[] = [];

    // 1. 提取主文本
    if (message.text && message.text.trim()) {
      parts.push(message.text.trim());
    }

    // 2. 提取 attachments 内容
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        // Pretext
        if (attachment.pretext) {
          parts.push(attachment.pretext);
        }

        // Title
        if (attachment.title) {
          parts.push(attachment.title);
        }

        // Text
        if (attachment.text) {
          parts.push(attachment.text);
        }

        // Fallback (如果其他都没有)
        if (!attachment.pretext && !attachment.title && !attachment.text && attachment.fallback) {
          parts.push(attachment.fallback);
        }

        // Fields
        if (attachment.fields && attachment.fields.length > 0) {
          for (const field of attachment.fields) {
            if (field.title) {
              parts.push(`${field.title}: ${field.value || ''}`);
            } else if (field.value) {
              parts.push(field.value);
            }
          }
        }
      }
    }

    // 3. 提取 blocks 内容
    if (message.blocks && message.blocks.length > 0) {
      for (const block of message.blocks) {
        if (block.type === 'section' && block.text) {
          parts.push(block.text.text);
        } else if (block.type === 'rich_text' && block.elements) {
          // 处理 rich_text 块
          for (const element of block.elements) {
            if (element.elements) {
              for (const subElement of element.elements) {
                if (subElement.text) {
                  parts.push(subElement.text);
                }
              }
            }
          }
        }
      }
    }

    // 合并所有部分
    const content = parts.join('\n').trim();

    // 如果仍然没有内容，返回占位符
    return content || '[消息内容为空或无法显示]';
  }

  /**
   * 生成消息摘要
   */
  private generateSnippet(content: string, maxLength: number = 150): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * 生成Slack深度链接
   */
  public getDeepLink(messageId: string, additionalParams?: Record<string, string>): string {
    try {
      // Slack深度链接格式: slack://channel?team=TEAM_ID&id=CHANNEL_ID&message=MESSAGE_TS
      // 优先使用传入的 team ID，否则使用配置中的
      const teamId = additionalParams?.team || this.config.credentials.additional?.teamId;
      const channelId = additionalParams?.channel;

      if (teamId && channelId) {
        return `slack://channel?team=${teamId}&id=${channelId}&message=${messageId}`;
      }

      // 如果没有足够的信息生成深度链接，返回网页版链接
      const domain = this.config.credentials.additional?.domain;
      if (domain && channelId) {
        return `https://${domain}.slack.com/archives/${channelId}/p${messageId.replace('.', '')}`;
      }

      // 最后的备选方案：返回Slack主页
      return 'https://slack.com/';
    } catch (error) {
      console.error('Failed to generate deep link:', error);
      return 'https://slack.com/';
    }
  }

  /**
   * 获取Slack用户信息
   */
  public async getUserInfo(): Promise<PlatformUserInfo> {
    try {
      if (!this.webClient) {
        throw new Error('Slack client not initialized');
      }

      // 获取当前用户信息
      const authResult = await this.webClient.auth.test();
      if (!authResult.ok) {
        throw new Error('Failed to get auth info: ' + authResult.error);
      }

      // 获取团队信息
      const teamInfo = await this.webClient.team.info();
      let workspace;
      if (teamInfo.ok && teamInfo.team) {
        const team = teamInfo.team as SlackTeam;
        workspace = {
          id: team.id,
          name: team.name,
          domain: team.domain,
        };
      }

      // 获取用户详细信息
      if (authResult.user_id) {
        const userResult = await this.webClient.users.info({ user: authResult.user_id });
        if (userResult.ok && userResult.user) {
          const user = userResult.user as SlackUser;
          return {
            id: user.id,
            name: user.real_name || user.name,
            email: user.profile?.email,
            avatar: user.profile?.image_72,
            workspace,
          };
        }
      }

      // 如果无法获取详细用户信息，返回基本信息
      return {
        id: authResult.user_id || 'unknown',
        name: authResult.user || 'Unknown User',
        workspace,
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw error;
    }
  }

  /**
   * 断开连接并清理资源
   */
  public async disconnect(): Promise<void> {
    try {
      this.webClient = null;
      this.installProvider = null;
      console.log('Slack adapter disconnected');
    } catch (error) {
      console.error('Error during Slack disconnect:', error);
    }
  }

  /**
   * 测试API连接
   */
  public async testConnection(): Promise<boolean> {
    try {
      if (!this.webClient) {
        return false;
      }

      const result = await this.webClient.auth.test();
      return result.ok === true;
    } catch (error) {
      console.error('Slack connection test failed:', error);
      return false;
    }
  }
}