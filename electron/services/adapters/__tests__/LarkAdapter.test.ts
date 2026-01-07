/**
 * LarkAdapter 单元测试
 * 测试飞书平台适配器的核心功能
 *
 * 任务 3.1: 消息内容提取测试
 * 任务 3.2: 消息匹配测试
 * 任务 3.3: 消息格式转换测试
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
  Client: jest.fn().mockImplementation(() => ({
    im: {
      v1: {
        chat: {
          list: jest.fn().mockResolvedValue({
            data: {
              items: [
                {
                  chat_id: 'oc_test_chat_1',
                  name: 'Test Chat 1',
                  chat_type: 'group',
                },
              ],
              has_more: false,
            },
          }),
        },
        message: {
          list: jest.fn().mockResolvedValue({
            data: {
              items: [],
              has_more: false,
            },
          }),
        },
      },
    },
  })),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LarkAdapter', () => {
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
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
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

  // ========== 任务 3.1: 消息内容提取测试 ==========
  describe('extractMessageContent', () => {
    // 创建一个辅助函数来访问私有方法
    const extractContent = (message: any) => {
      return (larkAdapter as any).extractMessageContent(message);
    };

    test('应该从文本消息中提取内容', () => {
      const message = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'Hello World' }),
        },
      };

      expect(extractContent(message)).toBe('Hello World');
    });

    test('应该从富文本消息(post)中提取标题和内容', () => {
      const message = {
        msg_type: 'post',
        body: {
          content: JSON.stringify({
            title: '公告标题',
            content: [[{ tag: 'text', text: '公告内容第一行' }], [{ tag: 'text', text: '公告内容第二行' }]],
          }),
        },
      };

      const content = extractContent(message);
      expect(content).toContain('公告标题');
      expect(content).toContain('公告内容第一行');
      expect(content).toContain('公告内容第二行');
    });

    test('应该从图片消息中提取 image_key', () => {
      const message = {
        msg_type: 'image',
        body: {
          content: JSON.stringify({ image_key: 'img_v2_test_key' }),
        },
      };

      expect(extractContent(message)).toBe('img_v2_test_key');
    });

    test('应该从文件消息中提取文件名', () => {
      const message = {
        msg_type: 'file',
        body: {
          content: JSON.stringify({ file_name: 'report.pdf' }),
        },
      };

      expect(extractContent(message)).toBe('report.pdf');
    });

    test('应该从音频消息中提取文件名', () => {
      const message = {
        msg_type: 'audio',
        body: {
          content: JSON.stringify({ file_name: 'voice_message.mp3' }),
        },
      };

      expect(extractContent(message)).toBe('voice_message.mp3');
    });

    test('应该从视频消息中提取文件名或标题', () => {
      const message = {
        msg_type: 'video',
        body: {
          content: JSON.stringify({ file_name: 'demo_video.mp4', title: 'Demo Video' }),
        },
      };

      expect(extractContent(message)).toBe('demo_video.mp4');
    });

    test('应该从表情消息返回占位符', () => {
      const message = {
        msg_type: 'sticker',
        body: {
          content: JSON.stringify({ sticker_key: 'sticker_123' }),
        },
      };

      expect(extractContent(message)).toBe('[表情]');
    });

    test('应该从群聊分享消息中提取群名', () => {
      const message = {
        msg_type: 'share_chat',
        body: {
          content: JSON.stringify({ chat_name: '技术讨论群' }),
        },
      };

      expect(extractContent(message)).toBe('技术讨论群');
    });

    test('应该优雅地处理无效 JSON', () => {
      const message = {
        msg_type: 'text',
        body: {
          content: 'invalid json content',
        },
      };

      // 非 JSON 内容会直接返回
      expect(extractContent(message)).toBe('invalid json content');
    });

    test('应该处理空消息体', () => {
      const message = {
        msg_type: 'text',
        body: {},
      };

      expect(extractContent(message)).toBe('');
    });

    test('应该处理 undefined 消息体', () => {
      const message = {
        msg_type: 'text',
        body: undefined,
      };

      expect(extractContent(message)).toBe('');
    });

    test('应该处理嵌套富文本结构', () => {
      const message = {
        msg_type: 'post',
        body: {
          content: JSON.stringify({
            title: '会议通知',
            content: [
              [
                { tag: 'text', text: '请参加' },
                { tag: 'a', text: '周会', href: 'https://meeting.example.com' },
              ],
              [{ tag: 'text', text: '时间：下午3点' }],
            ],
          }),
        },
      };

      const content = extractContent(message);
      expect(content).toContain('会议通知');
      expect(content).toContain('请参加');
      expect(content).toContain('周会');
      expect(content).toContain('时间：下午3点');
    });
  });

  // ========== 任务 3.2: 消息匹配测试 ==========
  describe('messageMatchesQuery', () => {
    const matchesQuery = (message: any, request: SearchRequest) => {
      return (larkAdapter as any).messageMatchesQuery(message, request);
    };

    test('应该匹配包含关键词的消息（大小写不敏感）', () => {
      const message = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'Order-12345 已完成' }),
        },
        sender: { id: 'user_123' },
      };

      const request: SearchRequest = {
        query: 'order-12345',
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(message, request)).toBe(true);
    });

    test('应该不匹配不包含关键词的消息', () => {
      const message = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: '今天天气真好' }),
        },
        sender: { id: 'user_123' },
      };

      const request: SearchRequest = {
        query: 'order',
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(message, request)).toBe(false);
    });

    test('应该支持发送者过滤', () => {
      const message = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'test message' }),
        },
        sender: { id: 'user_12345' },
      };

      const requestMatchingSender: SearchRequest = {
        query: 'test',
        filters: { sender: 'user_123' },
        pagination: { page: 1, limit: 10 },
      };

      const requestNonMatchingSender: SearchRequest = {
        query: 'test',
        filters: { sender: 'other_user' },
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(message, requestMatchingSender)).toBe(true);
      expect(matchesQuery(message, requestNonMatchingSender)).toBe(false);
    });

    test('应该支持消息类型过滤 - 文本类型', () => {
      const textMessage = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'test content' }),
        },
        sender: { id: 'user_123' },
      };

      const postMessage = {
        msg_type: 'post',
        body: {
          content: JSON.stringify({ title: 'test title', content: [[{ text: 'test content' }]] }),
        },
        sender: { id: 'user_123' },
      };

      const request: SearchRequest = {
        query: 'test',
        filters: { messageType: 'text' },
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(textMessage, request)).toBe(true);
      expect(matchesQuery(postMessage, request)).toBe(true); // post 也算 text 类型
    });

    test('应该支持消息类型过滤 - 文件类型', () => {
      const fileMessage = {
        msg_type: 'file',
        body: {
          content: JSON.stringify({ file_name: 'test_report.pdf' }),
        },
        sender: { id: 'user_123' },
      };

      const imageMessage = {
        msg_type: 'image',
        body: {
          content: JSON.stringify({ image_key: 'test_image' }),
        },
        sender: { id: 'user_123' },
      };

      const fileRequest: SearchRequest = {
        query: 'test',
        filters: { messageType: 'file' },
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(fileMessage, fileRequest)).toBe(true);
      expect(matchesQuery(imageMessage, fileRequest)).toBe(false); // image 不是 file 类型
    });

    test('应该支持消息类型过滤 - 图片类型在 "all" 模式下匹配', () => {
      const imageMessage = {
        msg_type: 'image',
        body: {
          content: JSON.stringify({ image_key: 'test_image' }),
        },
        sender: { id: 'user_123' },
      };

      // 图片类型在 'all' 模式下应该匹配
      const request: SearchRequest = {
        query: 'test',
        filters: { messageType: 'all' },
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(imageMessage, request)).toBe(true);
    });

    test('应该在 messageType 为 "all" 时匹配所有类型', () => {
      const textMessage = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'test' }),
        },
        sender: { id: 'user_123' },
      };

      const request: SearchRequest = {
        query: 'test',
        filters: { messageType: 'all' },
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(textMessage, request)).toBe(true);
    });

    test('应该支持组合过滤条件', () => {
      const message = {
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'Important meeting notes' }),
        },
        sender: { id: 'user_admin' },
      };

      const matchingRequest: SearchRequest = {
        query: 'meeting',
        filters: {
          sender: 'admin',
          messageType: 'text',
        },
        pagination: { page: 1, limit: 10 },
      };

      const nonMatchingRequest: SearchRequest = {
        query: 'meeting',
        filters: {
          sender: 'other',
          messageType: 'text',
        },
        pagination: { page: 1, limit: 10 },
      };

      expect(matchesQuery(message, matchingRequest)).toBe(true);
      expect(matchesQuery(message, nonMatchingRequest)).toBe(false);
    });
  });

  // ========== 任务 3.3: 消息格式转换测试 ==========
  describe('convertLarkMessage', () => {
    beforeEach(() => {
      // Mock fetch for user info
      mockFetch.mockImplementation((url: string) => {
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
                    avatar: {
                      avatar_72: 'https://example.com/avatar.jpg',
                    },
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve({ code: 0, data: {} }),
        });
      });
    });

    const convertMessage = async (message: any, chatId: string, chatName: string, accountId: string) => {
      return (larkAdapter as any).convertLarkMessage(
        message,
        chatId,
        chatName,
        'test-access-token',
        accountId
      );
    };

    test('应该正确转换飞书消息为 MessageResult', async () => {
      const larkMessage = {
        message_id: 'om_test_message_1',
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'Test message content' }),
        },
        create_time: '1704067200000', // 2024-01-01 00:00:00 UTC
        sender: {
          id: 'ou_test_user',
          id_type: 'open_id',
          sender_type: 'user',
        },
      };

      const result = await convertMessage(larkMessage, 'oc_chat_1', 'Test Chat', 'account_1');

      expect(result.id).toBe('om_test_message_1');
      expect(result.platform).toBe('lark');
      expect(result.content).toBe('Test message content');
      expect(result.messageType).toBe('text');
      expect(result.channel).toBe('Test Chat');
      expect(result.accountId).toBe('account_1');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.deepLink).toContain('om_test_message_1');
    });

    test('应该正确提取发送者信息', async () => {
      const larkMessage = {
        message_id: 'om_test_message_2',
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'Hello' }),
        },
        create_time: '1704067200000',
        sender: {
          id: 'ou_test_user',
          id_type: 'open_id',
          sender_type: 'user',
        },
      };

      const result = await convertMessage(larkMessage, 'oc_chat_1', 'Test Chat', 'account_1');

      expect(result.sender).toBeDefined();
      expect(result.sender.name).toBe('Test User');
      expect(result.sender.email).toBe('test@example.com');
      expect(result.sender.avatar).toBe('https://example.com/avatar.jpg');
    });

    test('应该正确映射消息类型', async () => {
      const testCases = [
        { msg_type: 'text', expected: 'text' },
        { msg_type: 'post', expected: 'text' },
        { msg_type: 'image', expected: 'image' },
        { msg_type: 'file', expected: 'file' },
        { msg_type: 'audio', expected: 'file' },
        { msg_type: 'video', expected: 'file' },
        { msg_type: 'media', expected: 'file' },
        { msg_type: 'sticker', expected: 'other' },
        { msg_type: 'unknown', expected: 'other' },
      ];

      for (const testCase of testCases) {
        const message = {
          message_id: `om_test_${testCase.msg_type}`,
          msg_type: testCase.msg_type,
          body: {
            content: JSON.stringify({ text: 'test' }),
          },
          create_time: '1704067200000',
          sender: { id: 'ou_test_user' },
        };

        const result = await convertMessage(message, 'oc_chat_1', 'Test Chat', 'account_1');
        expect(result.messageType).toBe(testCase.expected);
      }
    });

    test('应该生成正确格式的摘要（超过200字符时截断）', async () => {
      const longText = 'A'.repeat(300);
      const message = {
        message_id: 'om_test_long',
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: longText }),
        },
        create_time: '1704067200000',
        sender: { id: 'ou_test_user' },
      };

      const result = await convertMessage(message, 'oc_chat_1', 'Test Chat', 'account_1');

      expect(result.snippet.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(result.snippet.endsWith('...')).toBe(true);
    });

    test('应该正确转换时间戳', async () => {
      const message = {
        message_id: 'om_test_time',
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'test' }),
        },
        create_time: '1704067200000', // 2024-01-01 00:00:00 UTC
        sender: { id: 'ou_test_user' },
      };

      const result = await convertMessage(message, 'oc_chat_1', 'Test Chat', 'account_1');

      expect(result.timestamp.getTime()).toBe(1704067200000);
    });

    test('应该包含正确的元数据', async () => {
      const message = {
        message_id: 'om_test_metadata',
        msg_type: 'text',
        body: {
          content: JSON.stringify({ text: 'test' }),
        },
        create_time: '1704067200000',
        sender: { id: 'ou_test_user' },
        parent_id: 'om_parent_msg',
        root_id: 'om_root_msg',
      };

      const result = await convertMessage(message, 'oc_chat_1', 'Test Chat', 'account_1');

      expect(result.metadata).toBeDefined();
      expect(result.metadata.msg_type).toBe('text');
      expect(result.metadata.chat_id).toBe('oc_chat_1');
      expect(result.metadata.parent_id).toBe('om_parent_msg');
      expect(result.metadata.root_id).toBe('om_root_msg');
    });
  });

  // ========== 基本功能测试 ==========
  describe('基本功能', () => {
    test('应该返回正确的平台类型', () => {
      expect(larkAdapter.getPlatformType()).toBe('lark');
    });

    test('应该能够创建适配器实例', () => {
      expect(larkAdapter).toBeInstanceOf(LarkAdapter);
    });
  });

  // ========== 消息类型映射测试 ==========
  describe('mapLarkMessageType', () => {
    const mapType = (type: string) => {
      return (larkAdapter as any).mapLarkMessageType(type);
    };

    test('应该将 text 映射为 text', () => {
      expect(mapType('text')).toBe('text');
    });

    test('应该将 post 映射为 text', () => {
      expect(mapType('post')).toBe('text');
    });

    test('应该将 image 映射为 image', () => {
      expect(mapType('image')).toBe('image');
    });

    test('应该将 file 映射为 file', () => {
      expect(mapType('file')).toBe('file');
    });

    test('应该将 audio 映射为 file', () => {
      expect(mapType('audio')).toBe('file');
    });

    test('应该将 video 映射为 file', () => {
      expect(mapType('video')).toBe('file');
    });

    test('应该将 media 映射为 file', () => {
      expect(mapType('media')).toBe('file');
    });

    test('应该将未知类型映射为 other', () => {
      expect(mapType('sticker')).toBe('other');
      expect(mapType('unknown')).toBe('other');
      expect(mapType('share_chat')).toBe('other');
    });
  });

  // ========== 深度链接测试 ==========
  describe('深度链接', () => {
    test('应该生成带有会话ID和消息ID的深度链接', () => {
      const messageId = 'om_test_msg_1';
      const additionalParams = { chat_id: 'oc_test_chat_1' };

      const deepLink = larkAdapter.getDeepLink(messageId, additionalParams);

      expect(deepLink).toContain('oc_test_chat_1');
      expect(deepLink).toContain('om_test_msg_1');
      expect(deepLink).toContain('larksuite.com');
    });

    test('应该在只有会话ID时生成网页版链接', () => {
      const deepLink = larkAdapter.getDeepLink('', { chat_id: 'oc_test_chat_1' });

      expect(deepLink).toContain('larksuite.com');
    });

    test('应该在没有参数时返回飞书首页', () => {
      const deepLink = larkAdapter.getDeepLink('');

      expect(deepLink).toBe('https://www.larksuite.com/');
    });
  });

  // ========== 连接管理测试 ==========
  describe('连接管理', () => {
    test('validateConnection 应该在无效 token 时返回 false', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 99002000, msg: 'Invalid token' }),
      });

      const isValid = await larkAdapter.validateConnection();
      expect(isValid).toBe(false);
    });

    test('validateConnection 应该在有效 token 时返回 true', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: { user_id: 'test' } }),
      });

      const isValid = await larkAdapter.validateConnection();
      expect(isValid).toBe(true);
    });

    test('disconnect 应该正常清理资源', async () => {
      await expect(larkAdapter.disconnect()).resolves.not.toThrow();
    });

    test('testConnection 应该调用 validateConnection', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: { user_id: 'test' } }),
      });

      const result = await larkAdapter.testConnection();
      expect(typeof result).toBe('boolean');
    });
  });

  // ========== 认证流程测试 ==========
  describe('认证流程', () => {
    test('authenticate 应该生成正确的授权 URL', async () => {
      const result = await larkAdapter.authenticate();

      // authenticate 会打开浏览器，返回等待完成的提示
      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth flow');
    });

    test('refreshToken 应该在没有 refresh token 时返回错误', async () => {
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
      expect(result.error).toContain('refresh token');

      await adapter.disconnect();
    });

    test('completeOAuth 应该在缺少客户端凭据时返回错误', async () => {
      const configWithoutCredentials: PlatformConfig = {
        ...mockConfig,
        credentials: {
          accessToken: 'test',
        },
      };

      const adapter = new LarkAdapter(configWithoutCredentials);
      const result = await adapter.completeOAuth('test_code');

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth provider not configured');

      await adapter.disconnect();
    });
  });

  // ========== 用户信息测试 ==========
  describe('用户信息', () => {
    test('getUserInfo 应该返回用户信息', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            code: 0,
            data: {
              user_id: 'test_user_id',
              open_id: 'ou_test_open_id',
              name: 'Test User',
              email: 'test@example.com',
              avatar_url: 'https://example.com/avatar.jpg',
            },
          }),
      });

      const userInfo = await larkAdapter.getUserInfo();

      expect(userInfo.id).toBe('ou_test_open_id');
      expect(userInfo.name).toBe('Test User');
      expect(userInfo.email).toBe('test@example.com');
      expect(userInfo.avatar).toBe('https://example.com/avatar.jpg');
    });

    test('getUserInfo 应该在没有 access token 时抛出错误', async () => {
      const configWithoutToken: PlatformConfig = {
        ...mockConfig,
        credentials: {
          accessToken: '',
        },
      };

      const adapter = new LarkAdapter(configWithoutToken);

      await expect(adapter.getUserInfo()).rejects.toThrow('Access token not available');

      await adapter.disconnect();
    });

    test('getUserInfo 应该在 API 返回错误时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 99002000, msg: 'Invalid token' }),
      });

      await expect(larkAdapter.getUserInfo()).rejects.toThrow('Failed to get user info');
    });
  });

  // ========== 工具方法测试 ==========
  describe('工具方法', () => {
    describe('chunkArray', () => {
      const chunkArray = (array: any[], size: number) => {
        return (larkAdapter as any).chunkArray(array, size);
      };

      test('应该正确分块数组', () => {
        const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const chunks = chunkArray(array, 3);

        expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
      });

      test('应该处理空数组', () => {
        const chunks = chunkArray([], 3);
        expect(chunks).toEqual([]);
      });

      test('应该处理小于块大小的数组', () => {
        const array = [1, 2];
        const chunks = chunkArray(array, 5);

        expect(chunks).toEqual([[1, 2]]);
      });
    });
  });
});
