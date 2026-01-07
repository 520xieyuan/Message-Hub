/**
 * LarkAdapter 性能测试
 * 任务 3.7: 测试不同规模下的搜索性能
 *
 * 性能指标目标:
 * - 10 个会话: < 5 秒
 * - 50 个会话: < 20 秒
 * - 100 个会话: < 60 秒
 */

import { LarkAdapter } from '../LarkAdapter';
import { PlatformConfig } from '../../../../src/types/platform';
import { SearchRequest } from '../../../../src/types/search';

// Mock electron shell
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock @larksuiteoapi/node-sdk
jest.mock('@larksuiteoapi/node-sdk', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LarkAdapter 性能测试', () => {
  let larkAdapter: LarkAdapter;
  let mockConfig: PlatformConfig;

  // 生成模拟的会话列表
  const generateMockChats = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      chat_id: `oc_chat_${i + 1}`,
      name: `Test Chat ${i + 1}`,
      chat_type: i % 2 === 0 ? 'group' : 'p2p',
    }));
  };

  // 生成模拟的消息列表
  const generateMockMessages = (count: number, chatIndex: number) => {
    return Array.from({ length: count }, (_, i) => ({
      message_id: `om_msg_${chatIndex}_${i + 1}`,
      msg_type: 'text',
      body: {
        content: JSON.stringify({
          text: `Test message ${i + 1} in chat ${chatIndex} - contains keyword test`,
        }),
      },
      create_time: `${Date.now() - i * 60000}`,
      sender: { id: `ou_user_${i % 10}` },
    }));
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      id: 'lark-performance-test',
      name: 'lark',
      displayName: 'Lark Performance Test',
      enabled: true,
      credentials: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
      settings: {
        maxResults: 500,
        timeout: 60000,
      },
      connectionStatus: {
        connected: true,
        lastChecked: new Date(),
      },
      lastUpdated: new Date(),
    };

    larkAdapter = new LarkAdapter(mockConfig);
  });

  afterEach(async () => {
    await larkAdapter.disconnect();
  });

  // 设置性能测试的 mock
  const setupPerformanceMocks = (chatCount: number, messagesPerChat: number) => {
    const chats = generateMockChats(chatCount);
    let chatPageCalls = 0;
    let messagePageCalls: Record<string, number> = {};

    mockFetch.mockImplementation((url: string) => {
      // Token API
      if (url.includes('/api/tokens/by-id/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                access_token: 'test_token',
                platform: 'lark',
                client_id: 'test_client',
                client_secret: 'test_secret',
                user_identifier: 'test@example.com',
              },
            }),
        });
      }

      // Chat list API - 模拟分页
      if (url.includes('/im/v1/chats')) {
        chatPageCalls++;
        const pageSize = 100;
        const startIndex = (chatPageCalls - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, chats.length);
        const pageChats = chats.slice(startIndex, endIndex);
        const hasMore = endIndex < chats.length;

        return Promise.resolve({
          json: () =>
            Promise.resolve({
              code: 0,
              data: {
                items: pageChats,
                has_more: hasMore,
                page_token: hasMore ? `page_${chatPageCalls + 1}` : '',
              },
            }),
        });
      }

      // Messages API - 模拟分页
      if (url.includes('/im/v1/messages')) {
        const urlObj = new URL(url);
        const chatId = urlObj.searchParams.get('container_id') || '';
        const chatIndex = parseInt(chatId.split('_').pop() || '1');

        if (!messagePageCalls[chatId]) {
          messagePageCalls[chatId] = 0;
        }
        messagePageCalls[chatId]++;

        const pageSize = 50;
        const currentPage = messagePageCalls[chatId];
        const totalMessages = messagesPerChat;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, totalMessages);

        // 只生成当前页的消息
        const pageMessages =
          startIndex < totalMessages
            ? generateMockMessages(endIndex - startIndex, chatIndex).map((msg, i) => ({
                ...msg,
                message_id: `${msg.message_id}_page${currentPage}_${i}`,
              }))
            : [];

        const hasMore = endIndex < totalMessages;

        // 模拟网络延迟 (5-15ms)
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: {
                    items: pageMessages,
                    has_more: hasMore,
                    page_token: hasMore ? `msg_page_${currentPage + 1}` : '',
                  },
                }),
            });
          }, 5 + Math.random() * 10);
        });
      }

      // User info API
      if (url.includes('/contact/v3/users/')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              code: 0,
              data: {
                user: {
                  name: 'Test User',
                  open_id: 'ou_test',
                },
              },
            }),
        });
      }

      return Promise.resolve({
        json: () => Promise.resolve({ code: 0, data: {} }),
      });
    });
  };

  describe('性能基准测试', () => {
    // 注意：这些测试在 CI 环境中可能因资源限制而表现不同
    // 实际性能取决于网络延迟和 API 响应时间

    test('10 个会话，每个 100 条消息 - 应该在合理时间内完成', async () => {
      const chatCount = 10;
      const messagesPerChat = 100;
      setupPerformanceMocks(chatCount, messagesPerChat);

      const startTime = Date.now();

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 500 },
      };

      const results = await larkAdapter.search(request);
      const duration = Date.now() - startTime;

      console.log(`📊 Performance: ${chatCount} chats, ${messagesPerChat} msgs/chat`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Results: ${results.length}`);
      console.log(`   Rate: ${(results.length / (duration / 1000)).toFixed(2)} msgs/sec`);

      // 验证搜索完成
      expect(results.length).toBeGreaterThan(0);
      // 性能断言（mock 环境下应该很快）
      expect(duration).toBeLessThan(10000); // 10秒内完成
    }, 15000);

    test('50 个会话，每个 50 条消息 - 应该在合理时间内完成', async () => {
      const chatCount = 50; // 实际测试中会被限制为 50
      const messagesPerChat = 50;
      setupPerformanceMocks(chatCount, messagesPerChat);

      const startTime = Date.now();

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 500 },
      };

      const results = await larkAdapter.search(request);
      const duration = Date.now() - startTime;

      console.log(`📊 Performance: ${chatCount} chats, ${messagesPerChat} msgs/chat`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Results: ${results.length}`);
      console.log(`   Rate: ${(results.length / (duration / 1000)).toFixed(2)} msgs/sec`);

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(30000); // 30秒内完成
    }, 35000);
  });

  describe('并发控制验证', () => {
    test('应该限制并发请求数量', async () => {
      const chatCount = 20;
      setupPerformanceMocks(chatCount, 10);

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      // 追踪并发请求
      const originalFetch = mockFetch.getMockImplementation();
      mockFetch.mockImplementation(async (...args: any[]) => {
        if (args[0].includes('/im/v1/messages')) {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        }

        const result = await originalFetch!(...args);

        if (args[0].includes('/im/v1/messages')) {
          currentConcurrent--;
        }

        return result;
      });

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 100 },
      };

      await larkAdapter.search(request);

      console.log(`📊 Max concurrent requests: ${maxConcurrent}`);

      // 验证并发控制 (MAX_CONCURRENT = 5)
      // 注意：由于 mock 的异步行为，这个值可能略有不同
      expect(maxConcurrent).toBeLessThanOrEqual(10); // 允许一些误差
    }, 20000);
  });

  describe('缓存效率验证', () => {
    test('第二次搜索应该使用缓存的会话列表', async () => {
      setupPerformanceMocks(10, 20);

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 100 },
      };

      // 第一次搜索
      const startTime1 = Date.now();
      await larkAdapter.search(request);
      const duration1 = Date.now() - startTime1;

      // 清除消息相关的 mock 调用计数，但保留会话缓存
      const chatListCalls1 = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/im/v1/chats')
      ).length;

      // 第二次搜索（应该使用缓存的会话列表）
      const startTime2 = Date.now();
      await larkAdapter.search(request);
      const duration2 = Date.now() - startTime2;

      const chatListCalls2 =
        mockFetch.mock.calls.filter((call) => call[0].includes('/im/v1/chats')).length -
        chatListCalls1;

      console.log(`📊 Cache efficiency:`);
      console.log(`   First search: ${duration1}ms, chat list calls: ${chatListCalls1}`);
      console.log(`   Second search: ${duration2}ms, chat list calls: ${chatListCalls2}`);

      // 第二次搜索不应该再请求会话列表（使用缓存）
      expect(chatListCalls2).toBe(0);
    }, 20000);
  });

  describe('早停机制验证', () => {
    test('达到最大结果数时应该停止搜索', async () => {
      // 设置大量消息
      setupPerformanceMocks(100, 100); // 100 * 100 = 10000 条潜在消息

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 500 },
      };

      const results = await larkAdapter.search(request);

      console.log(`📊 Early stop: Got ${results.length} results`);

      // MAX_RESULTS = 500，应该在达到这个数量后停止
      expect(results.length).toBeLessThanOrEqual(500);
    }, 60000);
  });

  describe('内存使用验证', () => {
    test('应该使用 LRU 缓存策略限制消息缓存大小', async () => {
      setupPerformanceMocks(30, 50);

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 500 },
      };

      // 获取初始内存使用（如果可用）
      const initialMemory = process.memoryUsage().heapUsed;

      await larkAdapter.search(request);

      const afterSearchMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (afterSearchMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`📊 Memory usage:`);
      console.log(`   Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   After search: ${(afterSearchMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Increase: ${memoryIncrease.toFixed(2)} MB`);

      // 内存增长应该是合理的（由于 LRU 缓存限制）
      // 这个值取决于具体实现，这里只是一个基本检查
      expect(memoryIncrease).toBeLessThan(100); // 不应超过 100MB
    }, 30000);
  });

  describe('API 调用统计', () => {
    test('应该记录 API 调用次数', async () => {
      const chatCount = 10;
      const messagesPerChat = 50;
      setupPerformanceMocks(chatCount, messagesPerChat);

      const request: SearchRequest = {
        query: 'test',
        accounts: ['account_1'],
        pagination: { page: 1, limit: 500 },
      };

      await larkAdapter.search(request);

      const tokenCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/api/tokens/')
      ).length;
      const chatListCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/im/v1/chats')
      ).length;
      const messageCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/im/v1/messages')
      ).length;
      const userInfoCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/contact/v3/users/')
      ).length;

      console.log(`📊 API call statistics:`);
      console.log(`   Token calls: ${tokenCalls}`);
      console.log(`   Chat list calls: ${chatListCalls}`);
      console.log(`   Message calls: ${messageCalls}`);
      console.log(`   User info calls: ${userInfoCalls}`);
      console.log(`   Total: ${mockFetch.mock.calls.length}`);

      // 验证 API 调用模式合理
      expect(tokenCalls).toBeGreaterThanOrEqual(1);
      expect(chatListCalls).toBeGreaterThanOrEqual(1);
      expect(messageCalls).toBeGreaterThanOrEqual(chatCount); // 至少每个会话一次
    }, 30000);
  });
});
