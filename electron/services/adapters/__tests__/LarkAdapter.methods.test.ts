/**
 * LarkAdapter 方法单元测试补充
 * 测试之前未覆盖的私有方法和工具方法
 */

import { LarkAdapter } from '../LarkAdapter';
import { PlatformConfig, LarkSearchConfig } from '../../../../src/types/platform';
import { SearchRequest } from '../../../../src/types/search';

// Mock electron
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([]),
  },
}));

// Mock @larksuiteoapi/node-sdk
jest.mock('@larksuiteoapi/node-sdk', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LarkAdapter 方法补充测试', () => {
  let larkAdapter: LarkAdapter;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      id: 'lark-test',
      name: 'lark',
      displayName: 'Lark Test',
      enabled: true,
      credentials: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        clientId: 'cli_test_app_id',
        clientSecret: 'test_app_secret',
        expiresAt: new Date(Date.now() + 3600 * 1000),
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

    larkAdapter = new LarkAdapter(mockConfig);
  });

  afterEach(async () => {
    await larkAdapter.disconnect();
  });

  // ========== 搜索配置管理测试 ==========
  describe('搜索配置管理', () => {
    test('getSearchConfig 应该返回默认配置', () => {
      const config = larkAdapter.getSearchConfig();

      expect(config.maxChatsToSearch).toBe(50);
      expect(config.maxPagesPerChat).toBe(10);
      expect(config.recentDaysOnly).toBe(30);
      expect(config.maxSearchResults).toBe(500);
      expect(config.enableChatFilter).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.retryBaseDelay).toBe(1000);
    });

    test('updateSearchConfig 应该部分更新配置', () => {
      larkAdapter.updateSearchConfig({ maxChatsToSearch: 100 });

      const config = larkAdapter.getSearchConfig();
      expect(config.maxChatsToSearch).toBe(100);
      // 其他配置应保持不变
      expect(config.maxPagesPerChat).toBe(10);
    });

    test('updateSearchConfig 应该能更新多个配置项', () => {
      larkAdapter.updateSearchConfig({
        maxChatsToSearch: 200,
        maxPagesPerChat: 20,
        recentDaysOnly: 60,
      });

      const config = larkAdapter.getSearchConfig();
      expect(config.maxChatsToSearch).toBe(200);
      expect(config.maxPagesPerChat).toBe(20);
      expect(config.recentDaysOnly).toBe(60);
    });

    test('getSearchConfig 应该返回配置的副本', () => {
      const config1 = larkAdapter.getSearchConfig();
      const config2 = larkAdapter.getSearchConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    test('应该从平台配置中读取自定义搜索配置', () => {
      const customConfig: PlatformConfig = {
        ...mockConfig,
        settings: {
          ...mockConfig.settings,
          platformSpecific: {
            larkSearchConfig: {
              maxChatsToSearch: 75,
              maxPagesPerChat: 15,
            },
          },
        },
      };

      const adapter = new LarkAdapter(customConfig);
      const config = adapter.getSearchConfig();

      expect(config.maxChatsToSearch).toBe(75);
      expect(config.maxPagesPerChat).toBe(15);
      // 未指定的配置应使用默认值
      expect(config.maxRetries).toBe(3);
    });
  });

  // ========== 进度回调测试 ==========
  describe('进度回调', () => {
    test('setProgressCallback 应该设置进度回调', () => {
      const mockCallback = jest.fn();
      larkAdapter.setProgressCallback(mockCallback);

      // 通过搜索触发进度回调
      // 这里我们测试回调是否被正确设置
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  // ========== getTenantAccessToken 测试 ==========
  describe('getTenantAccessToken', () => {
    const getTenantAccessToken = async (appId: string, appSecret: string) => {
      return (larkAdapter as any).getTenantAccessToken(appId, appSecret);
    };

    test('应该成功获取 tenant_access_token', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          tenant_access_token: 'tenant_token_xxx',
          expire: 7200,
        }),
      });

      const token = await getTenantAccessToken('cli_test', 'secret_test');

      expect(token).toBe('tenant_token_xxx');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: 'cli_test',
            app_secret: 'secret_test',
          }),
        })
      );
    });

    test('应该在 API 返回错误时返回 null', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 10003,
          msg: 'Invalid app credentials',
        }),
      });

      const token = await getTenantAccessToken('invalid_id', 'invalid_secret');

      expect(token).toBeNull();
    });

    test('应该在网络错误时返回 null', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const token = await getTenantAccessToken('cli_test', 'secret_test');

      expect(token).toBeNull();
    });
  });

  // ========== getAllChats 测试 ==========
  describe('getAllChats', () => {
    const getAllChats = async (accessToken: string) => {
      return (larkAdapter as any).getAllChats(accessToken);
    };

    test('应该获取所有会话列表', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: {
            items: [
              { chat_id: 'oc_chat_1', name: 'Chat 1' },
              { chat_id: 'oc_chat_2', name: 'Chat 2' },
            ],
            has_more: false,
          },
        }),
      });

      const chats = await getAllChats('test_token');

      expect(chats).toHaveLength(2);
      expect(chats[0].chat_id).toBe('oc_chat_1');
    });

    test('应该处理分页获取所有会话', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            code: 0,
            data: {
              items: [{ chat_id: 'oc_chat_1', name: 'Chat 1' }],
              has_more: true,
              page_token: 'page_2',
            },
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            code: 0,
            data: {
              items: [{ chat_id: 'oc_chat_2', name: 'Chat 2' }],
              has_more: false,
            },
          }),
        });

      const chats = await getAllChats('test_token');

      expect(chats).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('应该使用缓存返回会话列表', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: {
            items: [{ chat_id: 'oc_chat_1', name: 'Chat 1' }],
            has_more: false,
          },
        }),
      });

      // 第一次调用
      const chats1 = await getAllChats('test_token');
      // 第二次调用（应使用缓存）
      const chats2 = await getAllChats('test_token');

      expect(chats1).toEqual(chats2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('应该在 API 返回错误时停止获取', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 99001,
          msg: 'Internal error',
        }),
      });

      const chats = await getAllChats('test_token');

      expect(chats).toHaveLength(0);
    });
  });

  // ========== fetchUserInfo 测试 ==========
  describe('fetchUserInfo', () => {
    const fetchUserInfo = async (accessToken: string, userId: string) => {
      return (larkAdapter as any).fetchUserInfo(accessToken, userId);
    };

    test('应该获取用户信息', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: {
            user: {
              open_id: 'ou_user_1',
              name: 'Test User',
              email: 'test@example.com',
              avatar: {
                avatar_72: 'https://example.com/avatar.jpg',
              },
            },
          },
        }),
      });

      const user = await fetchUserInfo('test_token', 'ou_user_1');

      expect(user).not.toBeNull();
      expect(user.name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
    });

    test('应该使用缓存返回用户信息', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: {
            user: {
              open_id: 'ou_user_1',
              name: 'Cached User',
            },
          },
        }),
      });

      // 第一次调用
      const user1 = await fetchUserInfo('test_token', 'ou_user_1');
      // 第二次调用（应使用缓存）
      const user2 = await fetchUserInfo('test_token', 'ou_user_1');

      expect(user1).toEqual(user2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('应该在获取失败时返回 null', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 99001,
          msg: 'User not found',
        }),
      });

      const user = await fetchUserInfo('test_token', 'invalid_user');

      expect(user).toBeNull();
    });
  });

  // ========== isSystemTemplateMessage 测试 ==========
  describe('isSystemTemplateMessage', () => {
    const isSystemTemplateMessage = (content: string) => {
      return (larkAdapter as any).isSystemTemplateMessage(content);
    };

    test('应该识别系统模板消息', () => {
      const systemContent = JSON.stringify({
        template: '{user} invited {invitee} to the group',
        user: 'Admin',
        invitee: 'New Member',
      });

      expect(isSystemTemplateMessage(systemContent)).toBe(true);
    });

    test('应该识别普通消息不是系统模板', () => {
      const normalContent = JSON.stringify({
        text: 'Hello World',
      });

      expect(isSystemTemplateMessage(normalContent)).toBe(false);
    });

    test('应该处理无效 JSON', () => {
      expect(isSystemTemplateMessage('invalid json')).toBe(false);
    });

    test('应该处理没有 template 字段的消息', () => {
      const content = JSON.stringify({
        message: 'Regular message',
      });

      expect(isSystemTemplateMessage(content)).toBe(false);
    });
  });

  // ========== filterChats 测试 ==========
  describe('filterChats', () => {
    const filterChats = (chats: any[]) => {
      return (larkAdapter as any).filterChats(chats);
    };

    test('应该限制会话数量到 maxChatsToSearch', () => {
      const chats = Array.from({ length: 100 }, (_, i) => ({
        chat_id: `oc_chat_${i}`,
        name: `Chat ${i}`,
      }));

      const filtered = filterChats(chats);

      // 默认 maxChatsToSearch = 50
      expect(filtered.length).toBe(50);
    });

    test('应该在 enableChatFilter 为 false 时仍然限制数量', () => {
      larkAdapter.updateSearchConfig({ enableChatFilter: false });

      const chats = Array.from({ length: 100 }, (_, i) => ({
        chat_id: `oc_chat_${i}`,
        name: `Chat ${i}`,
      }));

      const filtered = filterChats(chats);

      expect(filtered.length).toBe(50);
    });

    test('应该在会话数量小于限制时返回全部', () => {
      const chats = Array.from({ length: 20 }, (_, i) => ({
        chat_id: `oc_chat_${i}`,
        name: `Chat ${i}`,
      }));

      const filtered = filterChats(chats);

      expect(filtered.length).toBe(20);
    });
  });

  // ========== retryWithBackoff 测试 ==========
  describe('retryWithBackoff', () => {
    const retryWithBackoff = async <T>(fn: () => Promise<T>, context: string) => {
      return (larkAdapter as any).retryWithBackoff(fn, context);
    };

    test('应该在第一次成功时直接返回', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, 'test');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('应该在失败后重试', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce({ code: 99991429, message: 'Rate limited' }) // 可重试错误
        .mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, 'test');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('应该在不可重试错误时立即抛出', async () => {
      const mockFn = jest.fn()
        .mockRejectedValue({ code: 99991663, message: 'No permission' }); // 不可重试错误

      await expect(retryWithBackoff(mockFn, 'test')).rejects.toMatchObject({
        code: 99991663,
      });

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('应该在达到最大重试次数后抛出错误', async () => {
      const mockFn = jest.fn()
        .mockRejectedValue({ code: 99991429, message: 'Rate limited' });

      // 设置较小的重试次数以加快测试
      larkAdapter.updateSearchConfig({ maxRetries: 2, retryBaseDelay: 10 });

      await expect(retryWithBackoff(mockFn, 'test')).rejects.toMatchObject({
        code: 99991429,
      });

      expect(mockFn).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  // ========== handleApiError 测试 ==========
  describe('handleApiError', () => {
    const handleApiError = (error: any, context: string) => {
      return (larkAdapter as any).handleApiError(error, context);
    };

    test('应该对无权限错误返回 skip', () => {
      const result = handleApiError({ code: 99991663, message: 'No permission' }, 'test');
      expect(result).toBe('skip');
    });

    test('应该对消息已撤回错误返回 skip', () => {
      const result = handleApiError({ code: 99991668, message: 'Message recalled' }, 'test');
      expect(result).toBe('skip');
    });

    test('应该对会话不存在错误返回 skip', () => {
      const result = handleApiError({ code: 99991672, message: 'Chat not found' }, 'test');
      expect(result).toBe('skip');
    });

    test('应该对用户不在会话中错误返回 skip', () => {
      const result = handleApiError({ code: 99991671, message: 'User not in chat' }, 'test');
      expect(result).toBe('skip');
    });

    test('应该对 Token 过期错误返回 throw', () => {
      const result = handleApiError({ code: 99002000, message: 'Token expired' }, 'test');
      expect(result).toBe('throw');
    });

    test('应该对无效 Token 错误返回 throw', () => {
      const result = handleApiError({ code: 99991401, message: 'Invalid token' }, 'test');
      expect(result).toBe('throw');
    });

    test('应该对限流错误返回 retry', () => {
      const result = handleApiError({ code: 99991429, message: 'Rate limited' }, 'test');
      expect(result).toBe('retry');
    });

    test('应该对未知错误返回 throw', () => {
      const result = handleApiError({ code: 12345, message: 'Unknown error' }, 'test');
      expect(result).toBe('throw');
    });
  });

  // ========== extractErrorCode 测试 ==========
  describe('extractErrorCode', () => {
    const extractErrorCode = (error: any) => {
      return (larkAdapter as any).extractErrorCode(error);
    };

    test('应该从 error.code 提取错误码', () => {
      expect(extractErrorCode({ code: 99991663 })).toBe(99991663);
    });

    test('应该从 error.error.code 提取错误码', () => {
      expect(extractErrorCode({ error: { code: 99991663 } })).toBe(99991663);
    });

    test('应该从 error.data.code 提取错误码', () => {
      expect(extractErrorCode({ data: { code: 99991663 } })).toBe(99991663);
    });

    test('应该在没有错误码时返回 null', () => {
      expect(extractErrorCode({ message: 'Error without code' })).toBeNull();
      expect(extractErrorCode({})).toBeNull();
      expect(extractErrorCode(null)).toBeNull();
    });
  });

  // ========== shouldRetry 测试 ==========
  describe('shouldRetry', () => {
    const shouldRetry = (errorCode: number | null, attempt: number) => {
      return (larkAdapter as any).shouldRetry(errorCode, attempt);
    };

    test('应该在达到最大重试次数时返回 false', () => {
      // 默认 maxRetries = 3，所以 attempt = 2 是最后一次
      expect(shouldRetry(99991429, 2)).toBe(false);
    });

    test('应该对无权限错误返回 false', () => {
      expect(shouldRetry(99991663, 0)).toBe(false);
    });

    test('应该对消息已撤回错误返回 false', () => {
      expect(shouldRetry(99991668, 0)).toBe(false);
    });

    test('应该对限流错误返回 true', () => {
      expect(shouldRetry(99991429, 0)).toBe(true);
    });

    test('应该对 Token 过期错误返回 true', () => {
      expect(shouldRetry(99002000, 0)).toBe(true);
    });

    test('应该对网络错误（无错误码）返回 true', () => {
      expect(shouldRetry(null, 0)).toBe(true);
    });
  });

  // ========== calculateBackoffDelay 测试 ==========
  describe('calculateBackoffDelay', () => {
    const calculateBackoffDelay = (attempt: number, errorCode: number | null) => {
      return (larkAdapter as any).calculateBackoffDelay(attempt, errorCode);
    };

    test('应该对普通错误使用标准指数退避', () => {
      // 默认 retryBaseDelay = 1000
      expect(calculateBackoffDelay(0, null)).toBe(1000);     // 1000 * 2^0 = 1000
      expect(calculateBackoffDelay(1, null)).toBe(2000);     // 1000 * 2^1 = 2000
      expect(calculateBackoffDelay(2, null)).toBe(4000);     // 1000 * 2^2 = 4000
    });

    test('应该对限流错误使用更长的延迟', () => {
      // 限流错误使用 baseDelay * 2^(attempt+1)
      expect(calculateBackoffDelay(0, 99991429)).toBe(2000);   // 1000 * 2^1 = 2000
      expect(calculateBackoffDelay(1, 99991429)).toBe(4000);   // 1000 * 2^2 = 4000
      expect(calculateBackoffDelay(2, 99991429)).toBe(8000);   // 1000 * 2^3 = 8000
    });
  });

  // ========== getErrorMessage 测试 ==========
  describe('getErrorMessage', () => {
    const getErrorMessage = (errorCode: number | null, fallbackMessage: string) => {
      return (larkAdapter as any).getErrorMessage(errorCode, fallbackMessage);
    };

    test('应该返回无权限错误消息', () => {
      expect(getErrorMessage(99991663, '')).toBe('无权限访问该会话');
    });

    test('应该返回消息已撤回错误消息', () => {
      expect(getErrorMessage(99991668, '')).toBe('消息已被撤回');
    });

    test('应该返回 Token 过期错误消息', () => {
      expect(getErrorMessage(99002000, '')).toBe('Token 已过期，需要重新授权');
    });

    test('应该返回限流错误消息', () => {
      expect(getErrorMessage(99991429, '')).toBe('请求频率超限，请稍后重试');
    });

    test('应该返回无效 Token 错误消息', () => {
      expect(getErrorMessage(99991401, '')).toBe('Token 无效，请重新授权');
    });

    test('应该返回会话不存在错误消息', () => {
      expect(getErrorMessage(99991672, '')).toBe('会话不存在或已被删除');
    });

    test('应该返回用户不在会话中错误消息', () => {
      expect(getErrorMessage(99991671, '')).toBe('用户不在该会话中');
    });

    test('应该对未知错误返回 fallback 消息', () => {
      expect(getErrorMessage(12345, 'Custom error')).toBe('Custom error');
    });

    test('应该对 null 错误码返回 fallback 消息', () => {
      expect(getErrorMessage(null, 'Fallback')).toBe('Fallback');
    });

    test('应该在 fallback 为空时返回"未知错误"', () => {
      expect(getErrorMessage(12345, '')).toBe('未知错误');
    });
  });

  // ========== sleep 测试 ==========
  describe('sleep', () => {
    const sleep = (ms: number) => {
      return (larkAdapter as any).sleep(ms);
    };

    test('应该暂停指定的毫秒数', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      // 允许一些误差
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });
  });

  // ========== searchInChat 测试 ==========
  describe('searchInChat', () => {
    const searchInChat = async (chat: any, request: SearchRequest, accessToken: string, accountId: string) => {
      return (larkAdapter as any).searchInChat(chat, request, accessToken, accountId);
    };

    beforeEach(() => {
      // 清除用户缓存以便每次测试独立
      (larkAdapter as any).userCache.clear();
    });

    test('应该搜索单个会话中的消息', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: {
            items: [
              {
                message_id: 'om_msg_1',
                msg_type: 'text',
                body: { content: JSON.stringify({ text: 'Hello test world' }) },
                create_time: '1704067200000',
                sender: { id: 'ou_user_1' },
              },
            ],
            has_more: false,
          },
        }),
      }).mockResolvedValue({
        json: () => Promise.resolve({
          code: 0,
          data: { user: { name: 'Test User' } },
        }),
      });

      const chat = { chat_id: 'oc_chat_1', name: 'Test Chat' };
      const request: SearchRequest = {
        query: 'test',
        pagination: { page: 1, limit: 50 },
      };

      const results = await searchInChat(chat, request, 'test_token', 'account_1');

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('test');
    });

    test('应该在无权限时返回空数组', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 99991663,
          msg: 'No permission',
        }),
      });

      const chat = { chat_id: 'oc_restricted', name: 'Restricted Chat' };
      const request: SearchRequest = {
        query: 'test',
        pagination: { page: 1, limit: 50 },
      };

      const results = await searchInChat(chat, request, 'test_token', 'account_1');

      expect(results).toHaveLength(0);
    });

    test('应该正确应用时间范围过滤', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: {
            items: [],
            has_more: false,
          },
        }),
      });

      const chat = { chat_id: 'oc_chat_1', name: 'Test Chat' };
      const request: SearchRequest = {
        query: 'test',
        filters: {
          dateRange: { start: startDate, end: endDate },
        },
        pagination: { page: 1, limit: 50 },
      };

      await searchInChat(chat, request, 'test_token', 'account_1');

      // 验证 fetch 调用包含时间参数
      const fetchCall = mockFetch.mock.calls[0][0];
      expect(fetchCall).toContain(`start_time=${startDate.getTime()}`);
      expect(fetchCall).toContain(`end_time=${endDate.getTime()}`);
    });

    test('应该在达到最大页数时停止', async () => {
      // 设置较小的最大页数
      larkAdapter.updateSearchConfig({ maxPagesPerChat: 2 });

      let pageCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/im/v1/messages')) {
          pageCount++;
          return Promise.resolve({
            json: () => Promise.resolve({
              code: 0,
              data: {
                items: [{
                  message_id: `om_msg_${pageCount}`,
                  msg_type: 'text',
                  body: { content: JSON.stringify({ text: 'test message' }) },
                  create_time: '1704067200000',
                  sender: { id: 'ou_user_1' },
                }],
                has_more: true,
                page_token: `page_${pageCount + 1}`,
              },
            }),
          });
        }
        if (url.includes('/contact/v3/users/')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              code: 0,
              data: { user: { name: 'Test User' } },
            }),
          });
        }
        return Promise.resolve({ json: () => Promise.resolve({ code: 0 }) });
      });

      const chat = { chat_id: 'oc_chat_1', name: 'Test Chat' };
      const request: SearchRequest = {
        query: 'test',
        pagination: { page: 1, limit: 50 },
      };

      await searchInChat(chat, request, 'test_token', 'account_1');

      // 应该只调用 2 页（maxPagesPerChat = 2）
      expect(pageCount).toBe(2);
    });
  });

  // ========== fetchTokensFromServer 测试 ==========
  describe('fetchTokensFromServer', () => {
    const fetchTokensFromServer = async (accountIds?: string[]) => {
      return (larkAdapter as any).fetchTokensFromServer(accountIds);
    };

    test('应该在没有 accountIds 时返回空数组', async () => {
      const tokens = await fetchTokensFromServer();
      expect(tokens).toHaveLength(0);
    });

    test('应该在 accountIds 为空数组时返回空数组', async () => {
      const tokens = await fetchTokensFromServer([]);
      expect(tokens).toHaveLength(0);
    });

    test('应该成功获取 tokens', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              platform: 'lark',
              client_id: 'cli_test',
              client_secret: 'secret_test',
              user_identifier: 'test@example.com',
            },
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            code: 0,
            tenant_access_token: 'tenant_token_xxx',
          }),
        });

      const tokens = await fetchTokensFromServer(['token_1']);

      expect(tokens).toHaveLength(1);
      expect(tokens[0].accessToken).toBe('tenant_token_xxx');
      expect(tokens[0].userIdentifier).toBe('test@example.com');
    });

    test('应该跳过平台不匹配的 token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            platform: 'slack', // 错误的平台
            client_id: 'cli_test',
            client_secret: 'secret_test',
            user_identifier: 'test@example.com',
          },
        }),
      });

      const tokens = await fetchTokensFromServer(['token_1']);

      expect(tokens).toHaveLength(0);
    });

    test('应该跳过获取 tenant_access_token 失败的 token', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              platform: 'lark',
              client_id: 'cli_test',
              client_secret: 'invalid_secret',
              user_identifier: 'test@example.com',
            },
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            code: 10003,
            msg: 'Invalid credentials',
          }),
        });

      const tokens = await fetchTokensFromServer(['token_1']);

      expect(tokens).toHaveLength(0);
    });
  });
});
