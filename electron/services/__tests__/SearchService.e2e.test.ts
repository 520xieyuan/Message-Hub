/**
 * SearchService 端到端测试
 * 任务 3.6: 测试多平台搜索集成
 *
 * 测试 Gmail + Slack + Lark 同时搜索的场景
 */

import { SearchService } from '../SearchService';
import { PlatformAdapterManager } from '../PlatformAdapterManager';
import { ConfigurationService } from '../ConfigurationService';
import { SearchRequest, MessageResult } from '../../../src/types/search';

// Mock electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
  },
  shell: {
    openExternal: jest.fn(),
  },
}));

// Mock adapters
const mockGmailSearch = jest.fn();
const mockSlackSearch = jest.fn();
const mockLarkSearch = jest.fn();

// Mock PlatformAdapterManager
jest.mock('../PlatformAdapterManager', () => ({
  PlatformAdapterManager: jest.fn().mockImplementation(() => ({
    getActiveAdapters: jest.fn().mockReturnValue(['gmail', 'slack', 'lark']),
    getAdapter: jest.fn().mockImplementation((platformId: string) => {
      switch (platformId) {
        case 'gmail':
          return { search: mockGmailSearch };
        case 'slack':
          return { search: mockSlackSearch };
        case 'lark':
          return { search: mockLarkSearch };
        default:
          return null;
      }
    }),
    refreshPlatformToken: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock ConfigurationService
jest.mock('../ConfigurationService', () => ({
  ConfigurationService: jest.fn().mockImplementation(() => ({
    getOAuthServerUrl: jest.fn().mockResolvedValue('http://localhost:3000'),
  })),
}));

describe('SearchService 端到端测试', () => {
  let searchService: SearchService;
  let mockPlatformManager: PlatformAdapterManager;
  let mockConfigService: ConfigurationService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });

    mockConfigService = { getOAuthServerUrl: jest.fn().mockResolvedValue('http://localhost:3000') } as any;
    mockPlatformManager = new PlatformAdapterManager(mockConfigService);

    searchService = new SearchService(mockPlatformManager, mockConfigService, {
      searchTimeout: 30000,
      cacheTTL: 0,
      enableCache: false,
      enableConcurrentSearch: true,
      maxCacheEntries: 100,
      retryConfig: {
        maxAttempts: 1,
        delay: 100,
        backoffMultiplier: 2,
        maxDelay: 1000,
        retryableErrors: [],
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 创建模拟的消息结果
  const createMockMessage = (
    platform: string,
    id: string,
    content: string,
    timestamp: Date
  ): MessageResult => ({
    id,
    platform: platform as 'gmail' | 'slack' | 'lark',
    content,
    snippet: content.substring(0, 100),
    timestamp,
    sender: {
      name: 'Test User',
      email: `test@${platform}.com`,
      userId: `user_${platform}`,
    },
    deepLink: `https://${platform}.com/message/${id}`,
    messageType: 'text',
    channel: `${platform}-channel`,
  });

  describe('多平台并发搜索', () => {
    test('应该同时搜索 Gmail + Slack + Lark 并合并结果', async () => {
      const gmailResults = [
        createMockMessage('gmail', 'gmail_1', 'test email 1', new Date('2024-01-03')),
        createMockMessage('gmail', 'gmail_2', 'test email 2', new Date('2024-01-01')),
      ];

      const slackResults = [
        createMockMessage('slack', 'slack_1', 'test message 1', new Date('2024-01-04')),
      ];

      const larkResults = [
        createMockMessage('lark', 'lark_1', 'test 飞书消息', new Date('2024-01-02')),
        createMockMessage('lark', 'lark_2', 'test 飞书消息 2', new Date('2024-01-05')),
      ];

      mockGmailSearch.mockResolvedValue(gmailResults);
      mockSlackSearch.mockResolvedValue(slackResults);
      mockLarkSearch.mockResolvedValue(larkResults);

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      const response = await searchService.search(request);

      // 验证所有平台都被调用
      expect(mockGmailSearch).toHaveBeenCalled();
      expect(mockSlackSearch).toHaveBeenCalled();
      expect(mockLarkSearch).toHaveBeenCalled();

      // 验证结果合并
      expect(response.results.length).toBe(5);

      // 验证结果按时间倒序排列
      for (let i = 0; i < response.results.length - 1; i++) {
        expect(response.results[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          response.results[i + 1].timestamp.getTime()
        );
      }

      // 验证平台状态
      expect(response.platformStatus['gmail'].success).toBe(true);
      expect(response.platformStatus['slack'].success).toBe(true);
      expect(response.platformStatus['lark'].success).toBe(true);

      expect(response.platformStatus['gmail'].resultCount).toBe(2);
      expect(response.platformStatus['slack'].resultCount).toBe(1);
      expect(response.platformStatus['lark'].resultCount).toBe(2);
    });

    test('应该正确处理单个平台失败不影响其他平台', async () => {
      const gmailResults = [
        createMockMessage('gmail', 'gmail_1', 'test email', new Date('2024-01-01')),
      ];

      const slackResults = [
        createMockMessage('slack', 'slack_1', 'test slack', new Date('2024-01-02')),
      ];

      mockGmailSearch.mockResolvedValue(gmailResults);
      mockSlackSearch.mockResolvedValue(slackResults);
      mockLarkSearch.mockRejectedValue(new Error('Lark API error'));

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      const response = await searchService.search(request);

      // Gmail 和 Slack 应该成功
      expect(response.platformStatus['gmail'].success).toBe(true);
      expect(response.platformStatus['slack'].success).toBe(true);

      // Lark 应该失败
      expect(response.platformStatus['lark'].success).toBe(false);
      expect(response.platformStatus['lark'].error).toContain('Lark API error');

      // 结果应该包含 Gmail 和 Slack 的消息
      expect(response.results.length).toBe(2);
      expect(response.results.some((r) => r.platform === 'gmail')).toBe(true);
      expect(response.results.some((r) => r.platform === 'slack')).toBe(true);
      expect(response.results.some((r) => r.platform === 'lark')).toBe(false);
    });

    test('应该正确处理所有平台都失败的情况', async () => {
      mockGmailSearch.mockRejectedValue(new Error('Gmail error'));
      mockSlackSearch.mockRejectedValue(new Error('Slack error'));
      mockLarkSearch.mockRejectedValue(new Error('Lark error'));

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      const response = await searchService.search(request);

      // 所有平台都应该失败
      expect(response.platformStatus['gmail'].success).toBe(false);
      expect(response.platformStatus['slack'].success).toBe(false);
      expect(response.platformStatus['lark'].success).toBe(false);

      // 结果应该为空
      expect(response.results.length).toBe(0);
    });
  });

  describe('结果去重', () => {
    test('应该去除重复的消息', async () => {
      const duplicateMessage = createMockMessage('gmail', 'msg_1', 'duplicate', new Date('2024-01-01'));

      mockGmailSearch.mockResolvedValue([duplicateMessage, duplicateMessage]);
      mockSlackSearch.mockResolvedValue([]);
      mockLarkSearch.mockResolvedValue([]);

      const request: SearchRequest = {
        query: 'duplicate',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: [],
          lark: [],
        },
        pagination: { page: 1, limit: 50 },
      };

      const response = await searchService.search(request);

      // 应该只有一条消息（去重后）
      expect(response.results.length).toBe(1);
    });
  });

  describe('结果排序', () => {
    test('应该按时间戳降序排列（最新的在前）', async () => {
      const messages = [
        createMockMessage('gmail', 'old', 'old message', new Date('2024-01-01')),
        createMockMessage('slack', 'middle', 'middle message', new Date('2024-01-15')),
        createMockMessage('lark', 'new', 'new message', new Date('2024-01-30')),
      ];

      mockGmailSearch.mockResolvedValue([messages[0]]);
      mockSlackSearch.mockResolvedValue([messages[1]]);
      mockLarkSearch.mockResolvedValue([messages[2]]);

      const request: SearchRequest = {
        query: 'message',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      const response = await searchService.search(request);

      expect(response.results[0].id).toBe('new'); // 最新的
      expect(response.results[1].id).toBe('middle');
      expect(response.results[2].id).toBe('old'); // 最旧的
    });
  });

  describe('平台状态正确显示', () => {
    test('应该返回每个平台的搜索状态', async () => {
      mockGmailSearch.mockResolvedValue([
        createMockMessage('gmail', 'g1', 'gmail test', new Date()),
      ]);
      mockSlackSearch.mockResolvedValue([
        createMockMessage('slack', 's1', 'slack test', new Date()),
        createMockMessage('slack', 's2', 'slack test 2', new Date()),
      ]);
      mockLarkSearch.mockResolvedValue([]);

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      const response = await searchService.search(request);

      // 验证每个平台状态
      expect(response.platformStatus['gmail']).toMatchObject({
        platform: 'gmail',
        success: true,
        resultCount: 1,
      });

      expect(response.platformStatus['slack']).toMatchObject({
        platform: 'slack',
        success: true,
        resultCount: 2,
      });

      expect(response.platformStatus['lark']).toMatchObject({
        platform: 'lark',
        success: true,
        resultCount: 0,
      });

      // 每个平台都应该有搜索时间
      expect(response.platformStatus['gmail'].searchTime).toBeGreaterThanOrEqual(0);
      expect(response.platformStatus['slack'].searchTime).toBeGreaterThanOrEqual(0);
      expect(response.platformStatus['lark'].searchTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('账户隔离', () => {
    test('应该将正确的账户传递给每个平台', async () => {
      mockGmailSearch.mockResolvedValue([]);
      mockSlackSearch.mockResolvedValue([]);
      mockLarkSearch.mockResolvedValue([]);

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_acc_1', 'gmail_acc_2'],
          slack: ['slack_acc_1'],
          lark: ['lark_acc_1', 'lark_acc_2', 'lark_acc_3'],
        },
        pagination: { page: 1, limit: 50 },
      };

      await searchService.search(request);

      // 验证每个适配器接收到正确的账户
      expect(mockGmailSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          accounts: ['gmail_acc_1', 'gmail_acc_2'],
        })
      );

      expect(mockSlackSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          accounts: ['slack_acc_1'],
        })
      );

      expect(mockLarkSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          accounts: ['lark_acc_1', 'lark_acc_2', 'lark_acc_3'],
        })
      );
    });
  });

  describe('搜索指标', () => {
    test('应该正确跟踪搜索指标', async () => {
      mockGmailSearch.mockResolvedValue([]);
      mockSlackSearch.mockResolvedValue([]);
      mockLarkSearch.mockResolvedValue([]);

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      // 执行多次搜索
      await searchService.search(request);
      await searchService.search(request);

      const metrics = searchService.getMetrics();

      expect(metrics.totalSearches).toBe(2);
      expect(metrics.successfulSearches).toBe(2);
      expect(metrics.failedSearches).toBe(0);
    });

    test('应该跟踪平台级别的统计', async () => {
      mockGmailSearch.mockResolvedValue([]);
      mockSlackSearch.mockResolvedValue([]);
      mockLarkSearch.mockRejectedValue(new Error('Lark error'));

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail', 'slack', 'lark'],
        accountsByPlatform: {
          gmail: ['gmail_account_1'],
          slack: ['slack_account_1'],
          lark: ['lark_account_1'],
        },
        pagination: { page: 1, limit: 50 },
      };

      await searchService.search(request);

      const metrics = searchService.getMetrics();

      expect(metrics.platformStats['gmail'].successes).toBe(1);
      expect(metrics.platformStats['slack'].successes).toBe(1);
      expect(metrics.platformStats['lark'].failures).toBe(1);
    });
  });

  describe('事件发射', () => {
    test('应该在搜索开始时发射 searchStarted 事件', async () => {
      const searchStartedHandler = jest.fn();
      searchService.on('searchStarted', searchStartedHandler);

      mockGmailSearch.mockResolvedValue([]);
      mockSlackSearch.mockResolvedValue([]);
      mockLarkSearch.mockResolvedValue([]);

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail'],
        accountsByPlatform: { gmail: ['acc1'] },
        pagination: { page: 1, limit: 50 },
      };

      await searchService.search(request);

      expect(searchStartedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({ query: 'test' }),
        })
      );
    });

    test('应该在搜索完成时发射 searchCompleted 事件', async () => {
      const searchCompletedHandler = jest.fn();
      searchService.on('searchCompleted', searchCompletedHandler);

      mockGmailSearch.mockResolvedValue([]);
      mockSlackSearch.mockResolvedValue([]);
      mockLarkSearch.mockResolvedValue([]);

      const request: SearchRequest = {
        query: 'test',
        platforms: ['gmail'],
        accountsByPlatform: { gmail: ['acc1'] },
        pagination: { page: 1, limit: 50 },
      };

      await searchService.search(request);

      expect(searchCompletedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            results: expect.any(Array),
          }),
        })
      );
    });
  });
});
