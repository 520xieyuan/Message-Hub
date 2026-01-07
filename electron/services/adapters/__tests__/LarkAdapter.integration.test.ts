/**
 * LarkAdapter 集成测试
 * 测试完整的 OAuth 流程和搜索功能
 *
 * 任务 3.4: OAuth 流程集成测试
 * 任务 3.5: 搜索功能集成测试
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

describe('LarkAdapter 集成测试', () => {
  let larkAdapter: LarkAdapter;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      id: 'lark-integration-test',
      name: 'lark',
      displayName: 'Lark Integration Test',
      enabled: true,
      credentials: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        clientId: 'cli_test_app_id',
        clientSecret: 'test_app_secret',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
      settings: {
        maxResults: 50,
        timeout: 30000,
      },
      connectionStatus: {
        connected: false,
        lastChecked: new Date(),
      },
      lastUpdated: new Date(),
    };

    larkAdapter = new LarkAdapter(mockConfig);
  });

  afterEach(async () => {
    await larkAdapter.disconnect();
  });

  // ========== 任务 3.4: OAuth 流程集成测试 ==========
  describe('OAuth 流程集成测试', () => {
    describe('完整的 OAuth 认证流程', () => {
      test('应该成功完成 OAuth 授权码交换', async () => {
        // Mock app_access_token 请求
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                app_access_token: 'app_token_xxx',
                expire: 7200,
              }),
          })
        );

        // Mock user_access_token 请求
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                data: {
                  access_token: 'user_access_token_xxx',
                  refresh_token: 'user_refresh_token_xxx',
                  expires_in: 7200,
                  open_id: 'ou_test_user',
                  name: 'Test User',
                  email: 'test@example.com',
                  avatar_url: 'https://example.com/avatar.jpg',
                },
              }),
          })
        );

        const result = await larkAdapter.completeOAuth('valid_auth_code');

        expect(result.success).toBe(true);
        expect(result.accessToken).toBe('user_access_token_xxx');
        expect(result.refreshToken).toBe('user_refresh_token_xxx');
        expect(result.userInfo).toBeDefined();
        expect(result.userInfo?.id).toBe('ou_test_user');
        expect(result.userInfo?.name).toBe('Test User');
      });

      test('应该在授权码无效时返回错误', async () => {
        // Mock app_access_token 请求
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                app_access_token: 'app_token_xxx',
              }),
          })
        );

        // Mock user_access_token 请求失败
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 20003,
                msg: 'Invalid authorization code',
              }),
          })
        );

        const result = await larkAdapter.completeOAuth('invalid_auth_code');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to get user token');
      });

      test('应该在获取 app_access_token 失败时返回错误', async () => {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 10003,
                msg: 'Invalid app credentials',
              }),
          })
        );

        const result = await larkAdapter.completeOAuth('auth_code');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to get app token');
      });
    });

    describe('令牌刷新流程', () => {
      test('应该成功刷新令牌', async () => {
        // Mock app_access_token 请求
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                app_access_token: 'app_token_xxx',
              }),
          })
        );

        // Mock refresh_access_token 请求
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                data: {
                  access_token: 'new_access_token',
                  refresh_token: 'new_refresh_token',
                  expires_in: 7200,
                },
              }),
          })
        );

        const result = await larkAdapter.refreshToken();

        expect(result.success).toBe(true);
        expect(result.accessToken).toBe('new_access_token');
        expect(result.refreshToken).toBe('new_refresh_token');
      });

      test('应该在 refresh_token 过期时返回需要重新授权', async () => {
        // Mock app_access_token 请求
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                app_access_token: 'app_token_xxx',
              }),
          })
        );

        // Mock refresh_access_token 请求失败
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 99002000,
                msg: 'Refresh token expired',
              }),
          })
        );

        const result = await larkAdapter.refreshToken();

        expect(result.success).toBe(false);
        expect(result.requiresReauth).toBe(true);
      });

      test('应该在没有 refresh_token 时返回需要重新授权', async () => {
        const configWithoutRefreshToken: PlatformConfig = {
          ...mockConfig,
          credentials: {
            ...mockConfig.credentials,
            refreshToken: undefined,
          },
        };

        const adapter = new LarkAdapter(configWithoutRefreshToken);
        const result = await adapter.refreshToken();

        expect(result.success).toBe(false);
        expect(result.requiresReauth).toBe(true);
        expect(result.error).toContain('No refresh token available');

        await adapter.disconnect();
      });
    });

    describe('连接验证', () => {
      test('应该验证有效的连接', async () => {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                data: {
                  user_id: 'test_user',
                  name: 'Test User',
                },
              }),
          })
        );

        const isValid = await larkAdapter.validateConnection();
        expect(isValid).toBe(true);
      });

      test('应该检测无效的连接', async () => {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 99002000,
                msg: 'Invalid access token',
              }),
          })
        );

        const isValid = await larkAdapter.validateConnection();
        expect(isValid).toBe(false);
      });

      test('应该在网络错误时返回 false', async () => {
        mockFetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

        const isValid = await larkAdapter.validateConnection();
        expect(isValid).toBe(false);
      });
    });
  });

  // ========== 任务 3.5: 搜索功能集成测试 ==========
  describe('搜索功能集成测试', () => {
    // 设置通用的 mock 响应
    const setupSearchMocks = (options: {
      chats?: any[];
      messages?: Record<string, any[]>;
      tokenResponse?: any;
    }) => {
      const { chats = [], messages = {}, tokenResponse } = options;

      mockFetch.mockImplementation((url: string) => {
        // Token API
        if (url.includes('/api/tokens/by-id/')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                tokenResponse || {
                  success: true,
                  data: {
                    access_token: 'test_access_token',
                    platform: 'lark',
                    client_id: 'test_client_id',
                    client_secret: 'test_client_secret',
                    user_identifier: 'test@example.com',
                  },
                }
              ),
          });
        }

        // Chat list API
        if (url.includes('/im/v1/chats')) {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                data: {
                  items: chats,
                  has_more: false,
                },
              }),
          });
        }

        // Messages API
        if (url.includes('/im/v1/messages')) {
          const urlObj = new URL(url);
          const chatId = urlObj.searchParams.get('container_id') || '';
          const chatMessages = messages[chatId] || [];

          return Promise.resolve({
            json: () =>
              Promise.resolve({
                code: 0,
                data: {
                  items: chatMessages,
                  has_more: false,
                },
              }),
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
                    open_id: 'ou_test_user',
                    name: 'Test User',
                    email: 'test@example.com',
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

    describe('基本关键词搜索', () => {
      test('应该成功搜索包含关键词的消息', async () => {
        setupSearchMocks({
          chats: [
            { chat_id: 'oc_chat_1', name: 'Test Chat 1', chat_type: 'group' },
            { chat_id: 'oc_chat_2', name: 'Test Chat 2', chat_type: 'p2p' },
          ],
          messages: {
            oc_chat_1: [
              {
                message_id: 'om_msg_1',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'Hello World' }) },
                create_time: '1704067200000',
                sender: { id: 'ou_user_1' },
              },
              {
                message_id: 'om_msg_2',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'Order-12345 confirmed' }) },
                create_time: '1704070800000',
                sender: { id: 'ou_user_2' },
              },
            ],
            oc_chat_2: [
              {
                message_id: 'om_msg_3',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'Order-12345 shipped' }) },
                create_time: '1704074400000',
                sender: { id: 'ou_user_1' },
              },
            ],
          },
        });

        const request: SearchRequest = {
          query: 'order-12345',
          accounts: ['account_1'],
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        expect(results.length).toBe(2);
        expect(results.every((r) => r.content.toLowerCase().includes('order-12345'))).toBe(true);
        expect(results.every((r) => r.platform === 'lark')).toBe(true);
      });

      test('应该返回按时间倒序排列的结果', async () => {
        setupSearchMocks({
          chats: [{ chat_id: 'oc_chat_1', name: 'Test Chat', chat_type: 'group' }],
          messages: {
            oc_chat_1: [
              {
                message_id: 'om_msg_old',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'test old' }) },
                create_time: '1704067200000', // older
                sender: { id: 'ou_user_1' },
              },
              {
                message_id: 'om_msg_new',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'test new' }) },
                create_time: '1704153600000', // newer
                sender: { id: 'ou_user_1' },
              },
            ],
          },
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['account_1'],
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        expect(results.length).toBe(2);
        expect(results[0].timestamp.getTime()).toBeGreaterThan(results[1].timestamp.getTime());
      });
    });

    describe('时间范围过滤', () => {
      test('应该只返回指定时间范围内的消息', async () => {
        // Note: 时间范围过滤在 API 层面实现，这里验证参数传递正确
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');

        setupSearchMocks({
          chats: [{ chat_id: 'oc_chat_1', name: 'Test Chat', chat_type: 'group' }],
          messages: {
            oc_chat_1: [
              {
                message_id: 'om_msg_1',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'test message' }) },
                create_time: '1704672000000', // 2024-01-08
                sender: { id: 'ou_user_1' },
              },
            ],
          },
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['account_1'],
          filters: {
            dateRange: {
              start: startDate,
              end: endDate,
            },
          },
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        // 验证 fetch 调用包含时间参数
        const messagesCall = mockFetch.mock.calls.find((call) => call[0].includes('/im/v1/messages'));
        expect(messagesCall).toBeDefined();
        expect(messagesCall[0]).toContain('start_time');
        expect(messagesCall[0]).toContain('end_time');
      });
    });

    describe('发送者过滤', () => {
      test('应该只返回指定发送者的消息', async () => {
        setupSearchMocks({
          chats: [{ chat_id: 'oc_chat_1', name: 'Test Chat', chat_type: 'group' }],
          messages: {
            oc_chat_1: [
              {
                message_id: 'om_msg_1',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'test from admin' }) },
                create_time: '1704067200000',
                sender: { id: 'ou_admin_user' },
              },
              {
                message_id: 'om_msg_2',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'test from regular' }) },
                create_time: '1704070800000',
                sender: { id: 'ou_regular_user' },
              },
            ],
          },
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['account_1'],
          filters: {
            sender: 'admin',
          },
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        expect(results.length).toBe(1);
        expect(results[0].content).toContain('admin');
      });
    });

    describe('多会话搜索', () => {
      test('应该搜索多个会话并合并结果', async () => {
        setupSearchMocks({
          chats: [
            { chat_id: 'oc_chat_1', name: 'Chat 1', chat_type: 'group' },
            { chat_id: 'oc_chat_2', name: 'Chat 2', chat_type: 'group' },
            { chat_id: 'oc_chat_3', name: 'Chat 3', chat_type: 'p2p' },
          ],
          messages: {
            oc_chat_1: [
              {
                message_id: 'om_msg_1',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'project update' }) },
                create_time: '1704067200000',
                sender: { id: 'ou_user_1' },
              },
            ],
            oc_chat_2: [
              {
                message_id: 'om_msg_2',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'project deadline' }) },
                create_time: '1704070800000',
                sender: { id: 'ou_user_2' },
              },
            ],
            oc_chat_3: [
              {
                message_id: 'om_msg_3',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'project meeting' }) },
                create_time: '1704074400000',
                sender: { id: 'ou_user_3' },
              },
            ],
          },
        });

        const request: SearchRequest = {
          query: 'project',
          accounts: ['account_1'],
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        expect(results.length).toBe(3);
        // 验证结果来自不同的会话
        const channels = new Set(results.map((r) => r.channel));
        expect(channels.size).toBe(3);
      });
    });

    describe('错误处理', () => {
      test('应该在没有有效 token 时抛出错误', async () => {
        setupSearchMocks({
          tokenResponse: {
            success: false,
            error: 'Token not found',
          },
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['invalid_account'],
          pagination: { page: 1, limit: 50 },
        };

        await expect(larkAdapter.search(request)).rejects.toThrow('No valid tokens available');
      });

      test('应该在单个会话失败时继续搜索其他会话', async () => {
        let callCount = 0;
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
                    user_identifier: 'test@example.com',
                  },
                }),
            });
          }

          // Chat list API
          if (url.includes('/im/v1/chats')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: {
                    items: [
                      { chat_id: 'oc_chat_ok', name: 'OK Chat' },
                      { chat_id: 'oc_chat_fail', name: 'Fail Chat' },
                    ],
                    has_more: false,
                  },
                }),
            });
          }

          // Messages API - 模拟一个成功一个失败
          if (url.includes('/im/v1/messages')) {
            callCount++;
            if (url.includes('oc_chat_fail')) {
              return Promise.resolve({
                json: () =>
                  Promise.resolve({
                    code: 99991663,
                    msg: 'No permission',
                  }),
              });
            }
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: {
                    items: [
                      {
                        message_id: 'om_msg_1',
                        msg_type: 'text',
                        body: { content: JSON.stringify({ text: 'test message' }) },
                        create_time: '1704067200000',
                        sender: { id: 'ou_user_1' },
                      },
                    ],
                    has_more: false,
                  },
                }),
            });
          }

          // User info
          if (url.includes('/contact/v3/users/')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: { user: { name: 'Test User' } },
                }),
            });
          }

          return Promise.resolve({ json: () => Promise.resolve({ code: 0 }) });
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['account_1'],
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        // 应该返回成功会话的结果
        expect(results.length).toBe(1);
        expect(results[0].channel).toBe('OK Chat');
      });

      test('应该处理平台类型不匹配的 token', async () => {
        setupSearchMocks({
          tokenResponse: {
            success: true,
            data: {
              access_token: 'test_token',
              platform: 'slack', // 错误的平台
              user_identifier: 'test@example.com',
            },
          },
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['account_1'],
          pagination: { page: 1, limit: 50 },
        };

        await expect(larkAdapter.search(request)).rejects.toThrow('No valid tokens available');
      });
    });

    describe('大量消息场景', () => {
      test('应该处理多页消息', async () => {
        let pageCount = 0;
        mockFetch.mockImplementation((url: string) => {
          if (url.includes('/api/tokens/by-id/')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  success: true,
                  data: {
                    access_token: 'test_token',
                    platform: 'lark',
                    user_identifier: 'test@example.com',
                  },
                }),
            });
          }

          if (url.includes('/im/v1/chats')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: {
                    items: [{ chat_id: 'oc_chat_1', name: 'Test Chat' }],
                    has_more: false,
                  },
                }),
            });
          }

          if (url.includes('/im/v1/messages')) {
            pageCount++;
            const hasMore = pageCount < 3;
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: {
                    items: [
                      {
                        message_id: `om_msg_page_${pageCount}`,
                        msg_type: 'text',
                        body: { content: JSON.stringify({ text: `test page ${pageCount}` }) },
                        create_time: `${1704067200000 + pageCount * 3600000}`,
                        sender: { id: 'ou_user_1' },
                      },
                    ],
                    has_more: hasMore,
                    page_token: hasMore ? `token_page_${pageCount + 1}` : '',
                  },
                }),
            });
          }

          if (url.includes('/contact/v3/users/')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  code: 0,
                  data: { user: { name: 'Test User' } },
                }),
            });
          }

          return Promise.resolve({ json: () => Promise.resolve({ code: 0 }) });
        });

        const request: SearchRequest = {
          query: 'test',
          accounts: ['account_1'],
          pagination: { page: 1, limit: 50 },
        };

        const results = await larkAdapter.search(request);

        expect(results.length).toBe(3);
        expect(pageCount).toBe(3);
      });
    });
  });
});
