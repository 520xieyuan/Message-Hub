/**
 * SlackAdapter单元测试
 * 测试Slack平台适配器的核心功能
 */

import { SlackAdapter } from '../SlackAdapter';
import { PlatformConfig } from '../../../../src/types/platform';
import { SearchRequest } from '../../../../src/types/search';

// Mock Slack Web API
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    auth: {
      test: jest.fn().mockResolvedValue({ ok: true, user_id: 'U123456', user: 'testuser' }),
    },
    search: {
      messages: jest.fn().mockResolvedValue({
        ok: true,
        messages: {
          matches: [
            {
              type: 'message',
              ts: '1234567890.123456',
              user: 'U123456',
              text: 'Test message content',
              channel: { id: 'C123456', name: 'general' },
              permalink: 'https://test.slack.com/archives/C123456/p1234567890123456',
            },
          ],
        },
      }),
    },
    users: {
      info: jest.fn().mockResolvedValue({
        ok: true,
        user: {
          id: 'U123456',
          name: 'testuser',
          real_name: 'Test User',
          profile: {
            email: 'test@example.com',
            image_72: 'https://example.com/avatar.jpg',
            display_name: 'Test User',
          },
        },
      }),
    },
    team: {
      info: jest.fn().mockResolvedValue({
        ok: true,
        team: {
          id: 'T123456',
          name: 'Test Team',
          domain: 'testteam',
        },
      }),
    },
  })),
}));

jest.mock('@slack/oauth', () => ({
  InstallProvider: jest.fn().mockImplementation(() => ({
    generateInstallUrl: jest.fn().mockResolvedValue('https://slack.com/oauth/v2/authorize?...'),
  })),
}));

describe('SlackAdapter', () => {
  let slackAdapter: SlackAdapter;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    mockConfig = {
      id: 'slack-test',
      name: 'slack',
      displayName: 'Slack Test',
      enabled: true,
      credentials: {
        accessToken: 'xoxb-test-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        additional: {
          teamId: 'T123456',
          domain: 'testteam',
        },
      },
      settings: {
        maxResults: 20,
        timeout: 5000,
      },
      connectionStatus: {
        connected: false,
        lastChecked: new Date(),
      },
      lastUpdated: new Date(),
    };

    slackAdapter = new SlackAdapter(mockConfig);
  });

  describe('基本功能', () => {
    test('应该返回正确的平台类型', () => {
      expect(slackAdapter.getPlatformType()).toBe('slack');
    });

    test('应该能够测试连接', async () => {
      const result = await slackAdapter.testConnection();
      expect(result).toBe(true);
    });

    test('应该能够验证连接状态', async () => {
      const result = await slackAdapter.validateConnection();
      expect(result).toBe(true);
    });
  });

  describe('用户信息', () => {
    test('应该能够获取用户信息', async () => {
      const userInfo = await slackAdapter.getUserInfo();
      
      expect(userInfo).toEqual({
        id: 'U123456',
        name: 'Test User',
        email: 'test@example.com',
        avatar: 'https://example.com/avatar.jpg',
        workspace: {
          id: 'T123456',
          name: 'Test Team',
          domain: 'testteam',
        },
      });
    });
  });

  describe('消息搜索', () => {
    test('应该能够执行基本搜索', async () => {
      const searchRequest: SearchRequest = {
        query: 'test message',
        pagination: { page: 1, limit: 10 },
      };

      const results = await slackAdapter.search(searchRequest);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: '1234567890.123456',
        platform: 'slack',
        content: 'Test message content',
        channel: 'general',
        sender: {
          name: 'Test User',
          email: 'test@example.com',
          userId: 'U123456',
        },
      });
    });

    test('应该能够处理带筛选条件的搜索', async () => {
      const searchRequest: SearchRequest = {
        query: 'test',
        filters: {
          dateRange: {
            start: new Date('2023-01-01'),
            end: new Date('2023-12-31'),
          },
          sender: 'testuser',
        },
        pagination: { page: 1, limit: 10 },
      };

      const results = await slackAdapter.search(searchRequest);
      expect(results).toHaveLength(1);
    });
  });

  describe('深度链接', () => {
    test('应该能够生成Slack深度链接', () => {
      const messageId = '1234567890.123456';
      const additionalParams = { channel: 'C123456' };
      
      const deepLink = slackAdapter.getDeepLink(messageId, additionalParams);
      
      expect(deepLink).toBe('slack://channel?team=T123456&id=C123456&message=1234567890.123456');
    });

    test('应该能够生成网页版链接作为备选', () => {
      // 创建没有teamId的配置
      const configWithoutTeamId = {
        ...mockConfig,
        credentials: {
          ...mockConfig.credentials,
          additional: {
            domain: 'testteam',
          },
        },
      };
      
      const adapter = new SlackAdapter(configWithoutTeamId);
      const messageId = '1234567890.123456';
      const additionalParams = { channel: 'C123456' };
      
      const deepLink = adapter.getDeepLink(messageId, additionalParams);
      
      expect(deepLink).toBe('https://testteam.slack.com/archives/C123456/p1234567890123456');
    });
  });

  describe('令牌管理', () => {
    test('应该能够刷新令牌', async () => {
      const result = await slackAdapter.refreshToken();
      
      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('xoxb-test-token');
    });
  });

  describe('资源清理', () => {
    test('应该能够断开连接', async () => {
      await expect(slackAdapter.disconnect()).resolves.not.toThrow();
    });
  });
});