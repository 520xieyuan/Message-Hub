/**
 * Slack适配器使用示例
 * 演示如何使用SlackAdapter进行消息搜索和认证
 */

import { SlackAdapter } from '../SlackAdapter';
import { PlatformConfig } from '../../../../src/types/platform';
import { SearchRequest } from '../../../../src/types/search';

/**
 * 创建Slack适配器配置示例
 */
function createSlackConfig(): PlatformConfig {
  return {
    id: 'slack-workspace-1',
    name: 'slack',
    displayName: 'My Slack Workspace',
    enabled: true,
    credentials: {
      accessToken: 'xoxb-your-bot-token-here',
      clientId: 'your-slack-app-client-id',
      clientSecret: 'your-slack-app-client-secret',
      additional: {
        teamId: 'T1234567890',
        domain: 'myworkspace',
      },
    },
    settings: {
      maxResults: 50,
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
}

/**
 * 基本搜索示例
 */
async function basicSearchExample() {
  const config = createSlackConfig();
  const slackAdapter = new SlackAdapter(config);

  try {
    // 测试连接
    const isConnected = await slackAdapter.testConnection();
    if (!isConnected) {
      console.log('Slack连接失败，请检查访问令牌');
      return;
    }

    // 执行基本搜索
    const searchRequest: SearchRequest = {
      query: 'meeting notes',
      pagination: {
        page: 1,
        limit: 10,
      },
    };

    const results = await slackAdapter.search(searchRequest);
    
    console.log(`找到 ${results.length} 条消息:`);
    results.forEach((message, index) => {
      console.log(`${index + 1}. [${message.channel}] ${message.sender.name}: ${message.snippet}`);
      console.log(`   时间: ${message.timestamp.toLocaleString()}`);
      console.log(`   链接: ${message.deepLink}`);
      console.log('');
    });

  } catch (error) {
    console.error('搜索失败:', error);
  } finally {
    await slackAdapter.disconnect();
  }
}

/**
 * 高级搜索示例
 */
async function advancedSearchExample() {
  const config = createSlackConfig();
  const slackAdapter = new SlackAdapter(config);

  try {
    // 带筛选条件的搜索
    const searchRequest: SearchRequest = {
      query: 'project update',
      filters: {
        dateRange: {
          start: new Date('2023-10-01'),
          end: new Date('2023-10-31'),
        },
        sender: 'john.doe',
      },
      pagination: {
        page: 1,
        limit: 20,
      },
    };

    const results = await slackAdapter.search(searchRequest);
    
    console.log(`在指定时间范围内找到 ${results.length} 条来自 john.doe 的消息:`);
    results.forEach((message) => {
      console.log(`- ${message.content.substring(0, 100)}...`);
    });

  } catch (error) {
    console.error('高级搜索失败:', error);
  } finally {
    await slackAdapter.disconnect();
  }
}

/**
 * OAuth认证流程示例
 */
async function oauthExample() {
  const config = createSlackConfig();
  const slackAdapter = new SlackAdapter(config);

  try {
    // 开始OAuth认证流程
    console.log('开始Slack OAuth认证...');
    const authResult = await slackAdapter.authenticate();
    
    if (!authResult.success) {
      console.log('认证失败:', authResult.error);
      
      // 如果需要用户完成OAuth流程，这里会提示用户
      if (authResult.error?.includes('authorization code')) {
        console.log('请在浏览器中完成认证，然后提供授权码');
        
        // 在实际应用中，这里会等待用户输入授权码
        const authorizationCode = 'user-provided-auth-code';
        const completeResult = await slackAdapter.completeOAuth(authorizationCode);
        
        if (completeResult.success) {
          console.log('认证成功!');
          console.log('用户信息:', completeResult.userInfo);
        } else {
          console.log('认证完成失败:', completeResult.error);
        }
      }
    }

  } catch (error) {
    console.error('OAuth流程失败:', error);
  } finally {
    await slackAdapter.disconnect();
  }
}

/**
 * 用户信息获取示例
 */
async function getUserInfoExample() {
  const config = createSlackConfig();
  const slackAdapter = new SlackAdapter(config);

  try {
    const userInfo = await slackAdapter.getUserInfo();
    
    console.log('当前用户信息:');
    console.log(`- 姓名: ${userInfo.name}`);
    console.log(`- 邮箱: ${userInfo.email || '未提供'}`);
    console.log(`- 工作区: ${userInfo.workspace?.name || '未知'}`);
    console.log(`- 头像: ${userInfo.avatar || '无'}`);

  } catch (error) {
    console.error('获取用户信息失败:', error);
  } finally {
    await slackAdapter.disconnect();
  }
}

/**
 * 深度链接生成示例
 */
function deepLinkExample() {
  const config = createSlackConfig();
  const slackAdapter = new SlackAdapter(config);

  // 生成不同类型的深度链接
  const messageId = '1634567890.123456';
  const channelId = 'C1234567890';

  // Slack应用深度链接
  const appLink = slackAdapter.getDeepLink(messageId, { channel: channelId });
  console.log('Slack应用链接:', appLink);

  // 如果没有足够信息，会生成网页版链接
  const webLink = slackAdapter.getDeepLink(messageId, { channel: channelId });
  console.log('网页版链接:', webLink);
}

// 导出示例函数供其他模块使用
export {
  basicSearchExample,
  advancedSearchExample,
  oauthExample,
  getUserInfoExample,
  deepLinkExample,
  createSlackConfig,
};

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
  console.log('=== Slack适配器使用示例 ===\n');
  
  console.log('1. 深度链接生成示例:');
  deepLinkExample();
  
  console.log('\n2. 其他示例需要有效的Slack访问令牌才能运行');
  console.log('请在配置中设置正确的访问令牌后运行相应的示例函数');
}