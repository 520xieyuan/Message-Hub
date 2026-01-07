/**
 * Gmail适配器使用示例
 * 演示如何使用GmailAdapter进行邮件搜索和认证
 */

import { GmailAdapter } from '../GmailAdapter';
import { PlatformConfig } from '../../../../src/types/platform';
import { SearchRequest } from '../../../../src/types/search';

/**
 * Gmail适配器使用示例
 */
export class GmailUsageExample {
  private adapter: GmailAdapter;

  constructor() {
    // 创建Gmail平台配置
    const config: PlatformConfig = {
      id: 'gmail-example',
      name: 'gmail',
      displayName: 'Gmail Example',
      enabled: true,
      credentials: {
        accessToken: '', // 将在认证后设置
        refreshToken: '',
        clientId: 'your-google-client-id.apps.googleusercontent.com',
        clientSecret: 'your-google-client-secret',
      },
      settings: {
        maxResults: 20,
        timeout: 10000,
        enableCache: true,
        cacheExpiry: 300, // 5分钟
      },
      connectionStatus: {
        connected: false,
        lastChecked: new Date(),
      },
      lastUpdated: new Date(),
    };

    this.adapter = new GmailAdapter(config);
  }

  /**
   * 演示Gmail认证流程
   */
  async demonstrateAuthentication(): Promise<void> {
    console.log('=== Gmail认证流程演示 ===');

    try {
      // 1. 启动OAuth认证流程
      console.log('1. 启动OAuth认证...');
      const authResult = await this.adapter.authenticate();
      
      if (!authResult.success) {
        console.log('认证URL已在浏览器中打开，请完成授权流程');
        console.log('错误信息:', authResult.error);
        
        // 在实际应用中，这里需要等待用户完成OAuth流程并获取授权码
        // 然后调用 completeOAuth 方法
        console.log('请在获取授权码后调用 completeOAuth 方法');
        return;
      }

      console.log('认证成功!');
      console.log('用户信息:', authResult.userInfo);

    } catch (error) {
      console.error('认证失败:', error);
    }
  }

  /**
   * 演示完成OAuth认证
   */
  async demonstrateOAuthCompletion(authorizationCode: string): Promise<void> {
    console.log('=== 完成OAuth认证 ===');

    try {
      const result = await this.adapter.completeOAuth(authorizationCode);
      
      if (result.success) {
        console.log('OAuth认证完成!');
        console.log('访问令牌已获取');
        console.log('用户信息:', result.userInfo);
      } else {
        console.error('OAuth认证失败:', result.error);
      }
    } catch (error) {
      console.error('OAuth完成过程中出错:', error);
    }
  }

  /**
   * 演示连接验证
   */
  async demonstrateConnectionValidation(): Promise<void> {
    console.log('=== 连接验证演示 ===');

    try {
      const isValid = await this.adapter.validateConnection();
      console.log('连接状态:', isValid ? '有效' : '无效');

      const canConnect = await this.adapter.testConnection();
      console.log('连接测试:', canConnect ? '成功' : '失败');
    } catch (error) {
      console.error('连接验证失败:', error);
    }
  }

  /**
   * 演示基本邮件搜索
   */
  async demonstrateBasicSearch(): Promise<void> {
    console.log('=== 基本邮件搜索演示 ===');

    try {
      const searchRequest: SearchRequest = {
        query: 'important meeting',
        pagination: {
          page: 1,
          limit: 10,
        },
      };

      console.log('搜索查询:', searchRequest.query);
      const results = await this.adapter.search(searchRequest);
      
      console.log(`找到 ${results.length} 封邮件:`);
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.sender.name} - ${result.metadata?.subject}`);
        console.log(`   时间: ${result.timestamp.toLocaleString()}`);
        console.log(`   摘要: ${result.snippet}`);
        console.log(`   链接: ${result.deepLink}`);
        console.log('');
      });
    } catch (error) {
      console.error('搜索失败:', error);
    }
  }

  /**
   * 演示高级搜索（带筛选条件）
   */
  async demonstrateAdvancedSearch(): Promise<void> {
    console.log('=== 高级邮件搜索演示 ===');

    try {
      const searchRequest: SearchRequest = {
        query: 'project update',
        filters: {
          dateRange: {
            start: new Date('2024-01-01'),
            end: new Date('2024-12-31'),
          },
          sender: 'manager@company.com',
        },
        pagination: {
          page: 1,
          limit: 5,
        },
      };

      console.log('搜索查询:', searchRequest.query);
      console.log('筛选条件:');
      console.log('- 时间范围:', searchRequest.filters?.dateRange);
      console.log('- 发送人:', searchRequest.filters?.sender);

      const results = await this.adapter.search(searchRequest);
      
      console.log(`找到 ${results.length} 封邮件:`);
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.sender.name} (${result.sender.email})`);
        console.log(`   主题: ${result.metadata?.subject}`);
        console.log(`   时间: ${result.timestamp.toLocaleString()}`);
        console.log(`   收件人: ${result.channel}`);
        console.log('');
      });
    } catch (error) {
      console.error('高级搜索失败:', error);
    }
  }

  /**
   * 演示用户信息获取
   */
  async demonstrateUserInfo(): Promise<void> {
    console.log('=== 用户信息获取演示 ===');

    try {
      const userInfo = await this.adapter.getUserInfo();
      
      console.log('用户信息:');
      console.log('- ID:', userInfo.id);
      console.log('- 姓名:', userInfo.name);
      console.log('- 邮箱:', userInfo.email);
      console.log('- 头像:', userInfo.avatar);
      console.log('- 工作区:', userInfo.workspace);
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  }

  /**
   * 演示深度链接生成
   */
  demonstrateDeepLinks(): void {
    console.log('=== 深度链接生成演示 ===');

    // 基本消息链接
    const messageId = '1234567890abcdef';
    const basicLink = this.adapter.getDeepLink(messageId);
    console.log('基本消息链接:', basicLink);

    // 带线程ID的链接
    const threadId = 'thread-1234567890';
    const threadLink = this.adapter.getDeepLink(messageId, { threadId });
    console.log('线程链接:', threadLink);
  }

  /**
   * 演示令牌刷新
   */
  async demonstrateTokenRefresh(): Promise<void> {
    console.log('=== 令牌刷新演示 ===');

    try {
      const refreshResult = await this.adapter.refreshToken();
      
      if (refreshResult.success) {
        console.log('令牌刷新成功!');
        console.log('新的访问令牌已获取');
      } else {
        console.error('令牌刷新失败:', refreshResult.error);
      }
    } catch (error) {
      console.error('令牌刷新过程中出错:', error);
    }
  }

  /**
   * 演示资源清理
   */
  async demonstrateCleanup(): Promise<void> {
    console.log('=== 资源清理演示 ===');

    try {
      await this.adapter.disconnect();
      console.log('Gmail适配器已断开连接');
    } catch (error) {
      console.error('断开连接失败:', error);
    }
  }

  /**
   * 运行完整演示
   */
  async runFullDemo(): Promise<void> {
    console.log('开始Gmail适配器完整演示...\n');

    // 注意：在实际使用中，需要先完成认证流程
    await this.demonstrateAuthentication();
    await this.demonstrateConnectionValidation();
    
    // 以下功能需要有效的认证令牌
    // await this.demonstrateBasicSearch();
    // await this.demonstrateAdvancedSearch();
    // await this.demonstrateUserInfo();
    
    this.demonstrateDeepLinks();
    
    // await this.demonstrateTokenRefresh();
    await this.demonstrateCleanup();

    console.log('\nGmail适配器演示完成!');
  }
}

// 使用示例
async function runExample(): Promise<void> {
  const example = new GmailUsageExample();
  await example.runFullDemo();
}

// 如果直接运行此文件，执行演示
if (require.main === module) {
  runExample().catch(console.error);
}