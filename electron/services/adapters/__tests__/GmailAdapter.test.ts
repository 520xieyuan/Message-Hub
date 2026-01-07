/**
 * Gmail适配器单元测试
 */

import { GmailAdapter } from '../GmailAdapter';
import { PlatformConfig } from '../../../../src/types/platform';

describe('GmailAdapter', () => {
  let mockConfig: PlatformConfig;
  let gmailAdapter: GmailAdapter;

  beforeEach(() => {
    mockConfig = {
      id: 'test-gmail-1',
      name: 'gmail',
      displayName: 'Test Gmail',
      enabled: true,
      credentials: {
        accessToken: '', // 空的访问令牌，避免初始化客户端
        refreshToken: 'test-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
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

    gmailAdapter = new GmailAdapter(mockConfig);
  });

  afterEach(async () => {
    await gmailAdapter.disconnect();
  });

  describe('基本功能', () => {
    test('应该正确返回平台类型', () => {
      expect(gmailAdapter.getPlatformType()).toBe('gmail');
    });

    test('应该能够创建适配器实例', () => {
      expect(gmailAdapter).toBeInstanceOf(GmailAdapter);
    });
  });

  describe('深度链接生成', () => {
    test('应该生成正确的Gmail深度链接', () => {
      const messageId = 'test-message-id';
      const deepLink = gmailAdapter.getDeepLink(messageId);
      
      expect(deepLink).toBe('https://mail.google.com/mail/u/0/#inbox/test-message-id');
    });

    test('应该使用线程ID生成深度链接（如果提供）', () => {
      const messageId = 'test-message-id';
      const threadId = 'test-thread-id';
      const deepLink = gmailAdapter.getDeepLink(messageId, { threadId });
      
      expect(deepLink).toBe('https://mail.google.com/mail/u/0/#inbox/test-thread-id');
    });

    test('应该在错误时返回Gmail主页', () => {
      // 测试异常情况
      const deepLink = gmailAdapter.getDeepLink('');
      expect(deepLink).toBe('https://mail.google.com/mail/u/0/#inbox/');
    });
  });

  describe('连接管理', () => {
    test('validateConnection应该在没有客户端时返回false', async () => {
      const isValid = await gmailAdapter.validateConnection();
      expect(isValid).toBe(false);
    });

    test('testConnection应该在没有客户端时返回false', async () => {
      const isConnected = await gmailAdapter.testConnection();
      expect(isConnected).toBe(false);
    });

    test('disconnect应该正常执行', async () => {
      await expect(gmailAdapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe('认证流程', () => {
    test('authenticate应该在没有OAuth客户端时返回错误', async () => {
      // 创建没有客户端凭据的配置
      const configWithoutCredentials: PlatformConfig = {
        ...mockConfig,
        credentials: {
          accessToken: '',
        },
      };

      const adapter = new GmailAdapter(configWithoutCredentials);
      const result = await adapter.authenticate();

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth client not configured');
      
      await adapter.disconnect();
    });

    test('refreshToken应该在没有refresh token时返回错误', async () => {
      const configWithoutRefreshToken: PlatformConfig = {
        ...mockConfig,
        credentials: {
          ...mockConfig.credentials,
          refreshToken: undefined,
        },
      };

      const adapter = new GmailAdapter(configWithoutRefreshToken);
      const result = await adapter.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token available');
      
      await adapter.disconnect();
    });
  });

  describe('搜索功能', () => {
    test('search应该在没有客户端时抛出错误', async () => {
      const searchRequest = {
        query: 'test query',
        pagination: { page: 1, limit: 10 },
      };

      await expect(gmailAdapter.search(searchRequest)).rejects.toThrow('Gmail client not initialized');
    });
  });

  describe('用户信息', () => {
    test('getUserInfo应该在没有客户端时抛出错误', async () => {
      await expect(gmailAdapter.getUserInfo()).rejects.toThrow('Gmail client not initialized');
    });
  });
});