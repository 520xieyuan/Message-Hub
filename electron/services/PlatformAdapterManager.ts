/**
 * 平台适配器管理器
 * 负责管理所有平台适配器的生命周期和操作
 */

import { PlatformAdapter, PlatformConfig, AuthResult, PlatformUserInfo } from '../../src/types/platform';
import { SearchRequest, SearchResponse, MessageResult, PlatformSearchStatus } from '../../src/types/search';
import { PlatformAdapterFactory } from './PlatformAdapterFactory';
import { ConfigurationService } from './ConfigurationService';

export class PlatformAdapterManager {
  private factory: PlatformAdapterFactory;
  private configService: ConfigurationService;
  private activeAdapters: Map<string, PlatformAdapter> = new Map();

  constructor(configService: ConfigurationService) {
    this.factory = PlatformAdapterFactory.getInstance();
    this.configService = configService;

    // 设置 ConfigurationService 到工厂
    this.factory.setConfigurationService(configService);
  }

  /**
   * 初始化管理器，加载所有已配置的平台
   * 注意：platforms 现在从 OAuth Server 动态管理，但仍需要创建基本的 adapter 实例
   */
  public async initialize(): Promise<void> {
    try {
      // 创建基本的 Slack adapter 配置
      const slackConfig: PlatformConfig = {
        id: 'slack-default',
        name: 'slack',
        displayName: 'Slack',
        enabled: true,
        credentials: {
          accessToken: '',
          refreshToken: '',
          clientId: process.env.SLACK_CLIENT_ID || '',
          clientSecret: process.env.SLACK_CLIENT_SECRET || ''
        },
        settings: {
          searchScope: ['search:read', 'users:read', 'channels:read'],
          maxResults: 100,
          timeout: 30000
        },
        connectionStatus: {
          connected: false,
          lastChecked: new Date()
        },
        lastUpdated: new Date()
      };

      // 创建基本的 Gmail adapter 配置
      const gmailConfig: PlatformConfig = {
        id: 'gmail-default',
        name: 'gmail',
        displayName: 'Gmail',
        enabled: true,
        credentials: {
          accessToken: '',
          refreshToken: '',
          clientId: process.env.GMAIL_CLIENT_ID || '',
          clientSecret: process.env.GMAIL_CLIENT_SECRET || ''
        },
        settings: {
          searchScope: ['https://www.googleapis.com/auth/gmail.readonly'],
          maxResults: 100,
          timeout: 30000
        },
        connectionStatus: {
          connected: false,
          lastChecked: new Date()
        },
        lastUpdated: new Date()
      };

      // 创建基本的 Lark adapter 配置
      const larkConfig: PlatformConfig = {
        id: 'lark-default',
        name: 'lark',
        displayName: 'Lark',
        enabled: true,
        credentials: {
          accessToken: '',
          refreshToken: '',
          clientId: process.env.LARK_APP_ID || '',
          clientSecret: process.env.LARK_APP_SECRET || ''
        },
        settings: {
          searchScope: ['im:chat:readonly', 'im:message:readonly'],
          maxResults: 100,
          timeout: 30000
        },
        connectionStatus: {
          connected: false,
          lastChecked: new Date()
        },
        lastUpdated: new Date()
      };

      // 加载 adapters（tokens 会在搜索时动态获取）
      await this.loadAdapter(slackConfig);
      await this.loadAdapter(gmailConfig);

      // 加载 Lark adapter（使用 try-catch 避免影响其他平台）
      try {
        await this.loadAdapter(larkConfig);
      } catch (error) {
        console.error('Failed to initialize Lark adapter:', error);
        // 不抛出错误，继续初始化其他平台
      }

      console.log('Platform adapters initialized (tokens will be fetched dynamically from OAuth Server)');
    } catch (error) {
      console.error('Failed to initialize platform adapters:', error);
      throw error;
    }
  }

  /**
   * 加载平台适配器
   * @param config 平台配置
   */
  public async loadAdapter(config: PlatformConfig): Promise<void> {
    try {
      console.log(`🔍 [PlatformAdapterManager] Loading adapter for ${config.name} (${config.id}):`, {
        hasAccessToken: !!config.credentials.accessToken,
        tokenPrefix: config.credentials.accessToken?.substring(0, 10),
        hasAdditional: !!config.credentials.additional,
        teamId: config.credentials.additional?.teamId,
        additionalKeys: config.credentials.additional ? Object.keys(config.credentials.additional) : []
      });

      const adapter = this.factory.createAdapter(config);

      // 总是加载适配器，即使连接验证失败
      // 这样搜索服务就能找到适配器，即使它可能需要重新认证
      this.activeAdapters.set(config.id, adapter);
      console.log(`✅ [PlatformAdapterManager] Loaded adapter for platform: ${config.name}`);

      // 尝试验证连接，但不因为失败而阻止加载
      try {
        const isConnected = await adapter.validateConnection();
        if (!isConnected) {
          console.warn(`Connection validation failed for platform: ${config.name}, but adapter is still loaded`);
        }
      } catch (validationError) {
        console.warn(`Connection validation error for platform ${config.name}:`, validationError);
        // 继续，不阻止适配器加载
      }
    } catch (error) {
      console.error(`Failed to load adapter for platform ${config.name}:`, error);
      // 对于关键错误，仍然抛出
      throw error;
    }
  }

  /**
   * 卸载平台适配器
   * @param configId 配置ID
   */
  public async unloadAdapter(configId: string): Promise<void> {
    const adapter = this.activeAdapters.get(configId);
    if (adapter) {
      await adapter.disconnect();
      this.activeAdapters.delete(configId);
    }

    await this.factory.removeAdapter(configId);
  }

  /**
   * 重新加载平台适配器
   * @param configId 配置ID
   */
  public async reloadAdapter(configId: string): Promise<void> {
    await this.unloadAdapter(configId);
    // Platform configs 现在从 OAuth Server 管理，不再从本地配置重新加载
  }

  /**
   * 执行跨平台搜索
   * @param request 搜索请求
   * @returns 搜索响应
   */
  public async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    const platformStatus: Record<string, PlatformSearchStatus> = {};
    const allResults: MessageResult[] = [];

    // 确定要搜索的平台
    const targetPlatforms = request.platforms || Array.from(this.activeAdapters.keys());
    const searchPromises: Promise<void>[] = [];

    for (const configId of targetPlatforms) {
      const adapter = this.activeAdapters.get(configId);
      if (!adapter) {
        platformStatus[configId] = {
          platform: configId,
          success: false,
          resultCount: 0,
          error: 'Platform adapter not found or not active',
          searchTime: 0
        };
        continue;
      }

      const searchPromise = this.searchSinglePlatform(adapter, request, configId)
        .then(result => {
          platformStatus[configId] = result.status;
          allResults.push(...result.results);
        })
        .catch(error => {
          platformStatus[configId] = {
            platform: configId,
            success: false,
            resultCount: 0,
            error: error.message,
            searchTime: 0
          };
        });

      searchPromises.push(searchPromise);
    }

    // 等待所有平台搜索完成
    await Promise.allSettled(searchPromises);

    // 按时间戳排序结果
    allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // 应用分页
    const { page = 1, limit = 100 } = request.pagination || {};
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = allResults.slice(startIndex, endIndex);

    const totalTime = Date.now() - startTime;

    return {
      results: paginatedResults,
      totalCount: allResults.length,
      hasMore: endIndex < allResults.length,
      searchTime: totalTime,
      platformStatus
    };
  }

  /**
   * 搜索单个平台
   * @param adapter 平台适配器
   * @param request 搜索请求
   * @param configId 配置ID
   * @returns 搜索结果和状态
   */
  private async searchSinglePlatform(
    adapter: PlatformAdapter,
    request: SearchRequest,
    configId: string
  ): Promise<{ results: MessageResult[]; status: PlatformSearchStatus }> {
    const startTime = Date.now();

    try {
      const results = await adapter.search(request);
      const searchTime = Date.now() - startTime;

      return {
        results,
        status: {
          platform: configId,
          success: true,
          resultCount: results.length,
          searchTime
        }
      };
    } catch (error) {
      const searchTime = Date.now() - startTime;
      throw new Error(`Search failed for platform ${configId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 认证平台
   * @param configId 配置ID
   * @returns 认证结果
   */
  public async authenticatePlatform(configId: string): Promise<AuthResult> {
    const adapter = this.activeAdapters.get(configId);
    if (!adapter) {
      throw new Error(`Platform adapter not found: ${configId}`);
    }

    return await adapter.authenticate();
  }

  /**
   * 刷新平台令牌
   * @param configId 配置ID
   * @returns 认证结果
   */
  public async refreshPlatformToken(configId: string): Promise<AuthResult> {
    const adapter = this.activeAdapters.get(configId);
    if (!adapter) {
      throw new Error(`Platform adapter not found: ${configId}`);
    }

    return await adapter.refreshToken();
  }

  /**
   * 获取平台用户信息
   * @param configId 配置ID
   * @returns 用户信息
   */
  public async getPlatformUserInfo(configId: string): Promise<PlatformUserInfo> {
    const adapter = this.activeAdapters.get(configId);
    if (!adapter) {
      throw new Error(`Platform adapter not found: ${configId}`);
    }

    return await adapter.getUserInfo();
  }

  /**
   * 测试平台连接
   * @param configId 配置ID
   * @returns 连接是否成功
   */
  public async testPlatformConnection(configId: string): Promise<boolean> {
    const adapter = this.activeAdapters.get(configId);
    if (!adapter) {
      return false;
    }

    return await adapter.testConnection();
  }

  /**
   * 验证所有平台连接
   * @returns 连接状态映射
   */
  public async validateAllConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    const validationPromises: Promise<void>[] = [];

    for (const [configId, adapter] of this.activeAdapters) {
      const validationPromise = adapter.validateConnection()
        .then(isValid => {
          results[configId] = isValid;
        })
        .catch(() => {
          results[configId] = false;
        });

      validationPromises.push(validationPromise);
    }

    await Promise.allSettled(validationPromises);
    return results;
  }

  /**
   * 获取活跃的适配器列表
   * @returns 活跃适配器的配置ID数组
   */
  public getActiveAdapters(): string[] {
    return Array.from(this.activeAdapters.keys());
  }

  /**
   * 获取指定适配器
   * @param identifier 配置ID或平台名称
   * @returns 适配器实例或undefined
   */
  public getAdapter(identifier: string): PlatformAdapter | undefined {
    // 首先尝试按配置ID查找
    let adapter = this.activeAdapters.get(identifier);
    if (adapter) {
      return adapter;
    }

    // 如果按配置ID找不到，尝试按平台名称查找
    // 例如：identifier = "slack" 应该找到 "slack-default"
    for (const [configId, adapterInstance] of this.activeAdapters) {
      // 检查 configId 是否以平台名称开头
      if (configId.startsWith(identifier + '-') || configId === identifier) {
        return adapterInstance;
      }
    }

    return undefined;
  }

  /**
   * 清理所有适配器
   */
  public async cleanup(): Promise<void> {
    const disconnectPromises = Array.from(this.activeAdapters.values()).map(adapter =>
      adapter.disconnect()
    );

    await Promise.allSettled(disconnectPromises);
    this.activeAdapters.clear();
    await this.factory.clearAll();
  }
}