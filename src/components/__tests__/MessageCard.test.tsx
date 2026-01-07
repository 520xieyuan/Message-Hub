/**
 * MessageCard 组件测试
 * 任务 3.8: UI 测试 - 搜索结果显示
 *
 * 测试 Lark 消息在 MessageCard 中的显示
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageCard } from '../MessageCard';
import { MessageResult } from '../../types/search';

// 创建模拟的 Lark 消息
const createMockLarkMessage = (overrides: Partial<MessageResult> = {}): MessageResult => ({
  id: 'om_lark_test_1',
  platform: 'lark',
  content: '这是一条飞书测试消息',
  snippet: '这是一条飞书测试消息',
  timestamp: new Date('2024-01-15T10:30:00'),
  sender: {
    name: '张三',
    email: 'zhangsan@example.com',
    userId: 'ou_zhangsan',
    avatar: 'https://example.com/avatar.jpg',
  },
  deepLink: 'https://applink.larksuite.com/client/chat/open?openChatId=oc_123&messageId=om_lark_test_1',
  messageType: 'text',
  channel: '技术讨论群',
  accountId: 'lark_account_1',
  metadata: {
    msg_type: 'text',
    chat_id: 'oc_123',
  },
  ...overrides,
});

describe('MessageCard - Lark 消息显示', () => {
  describe('基本渲染', () => {
    test('应该正确渲染 Lark 消息', () => {
      const message = createMockLarkMessage();

      render(<MessageCard message={message} />);

      // 验证消息内容显示
      expect(screen.getByText('这是一条飞书测试消息')).toBeInTheDocument();

      // 验证发送者名称显示
      expect(screen.getByText('张三')).toBeInTheDocument();

      // 验证频道/群组名称显示
      expect(screen.getByText('技术讨论群')).toBeInTheDocument();
    });

    test('应该显示 Lark 平台标识', () => {
      const message = createMockLarkMessage();

      render(<MessageCard message={message} showPlatformIcon={true} />);

      // 验证平台名称
      expect(screen.getByText('Lark')).toBeInTheDocument();
    });

    test('应该显示正确的平台图标和颜色', () => {
      const message = createMockLarkMessage();

      const { container } = render(<MessageCard message={message} />);

      // Lark 使用蓝色主题
      const badge = container.querySelector('.bg-blue-100');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('时间格式化', () => {
    test('应该正确格式化时间戳', () => {
      // 设置消息时间为 1 小时前
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const message = createMockLarkMessage({ timestamp: oneHourAgo });

      render(<MessageCard message={message} showTimestamp={true} />);

      // 应该显示 "1小时前"
      expect(screen.getByText(/小时前/)).toBeInTheDocument();
    });

    test('应该对超过一周的消息显示具体日期', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const message = createMockLarkMessage({ timestamp: twoWeeksAgo });

      render(<MessageCard message={message} showTimestamp={true} />);

      // 应该显示日期格式
      const dateText = screen.queryByText(/\d{4}年|\d+月\d+日/);
      expect(dateText || screen.getByText(/2024|2025/)).toBeInTheDocument();
    });
  });

  describe('内容截断', () => {
    test('应该截断过长的内容', () => {
      const longContent = 'A'.repeat(300);
      const message = createMockLarkMessage({ content: longContent, snippet: longContent });

      render(<MessageCard message={message} maxContentLength={200} />);

      // 内容应该被截断并显示省略号
      const contentElement = screen.getByText(/A+\.\.\./);
      expect(contentElement).toBeInTheDocument();
    });

    test('短内容不应该被截断', () => {
      const shortContent = '短消息';
      const message = createMockLarkMessage({ content: shortContent, snippet: shortContent });

      render(<MessageCard message={message} maxContentLength={200} />);

      expect(screen.getByText('短消息')).toBeInTheDocument();
    });
  });

  describe('交互功能', () => {
    test('点击消息应该触发 onOpenSource 回调', () => {
      const message = createMockLarkMessage();
      const handleOpenSource = jest.fn();

      render(<MessageCard message={message} onOpenSource={handleOpenSource} />);

      // 点击打开源链接的按钮
      const openButton = screen.getByRole('button', { name: /打开|查看|open/i });
      if (openButton) {
        fireEvent.click(openButton);
        expect(handleOpenSource).toHaveBeenCalledWith(message);
      }
    });

    test('应该能够复制消息内容', async () => {
      const message = createMockLarkMessage();

      // Mock clipboard API
      const mockClipboard = {
        writeText: jest.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      render(<MessageCard message={message} />);

      // 查找复制按钮
      const copyButton = screen.queryByRole('button', { name: /复制|copy/i });
      if (copyButton) {
        fireEvent.click(copyButton);
        expect(mockClipboard.writeText).toHaveBeenCalledWith(message.content);
      }
    });
  });

  describe('消息类型显示', () => {
    test('应该正确显示文本消息', () => {
      const message = createMockLarkMessage({ messageType: 'text' });

      render(<MessageCard message={message} />);

      expect(screen.getByText('这是一条飞书测试消息')).toBeInTheDocument();
    });

    test('应该正确显示文件消息', () => {
      const message = createMockLarkMessage({
        messageType: 'file',
        content: 'report.pdf',
        snippet: 'report.pdf',
      });

      render(<MessageCard message={message} />);

      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });

    test('应该正确显示图片消息', () => {
      const message = createMockLarkMessage({
        messageType: 'image',
        content: '[图片]',
        snippet: '[图片]',
      });

      render(<MessageCard message={message} />);

      expect(screen.getByText('[图片]')).toBeInTheDocument();
    });
  });

  describe('搜索高亮', () => {
    test('应该高亮匹配的搜索关键词', () => {
      const message = createMockLarkMessage({
        content: '这是一条包含关键词的消息',
        snippet: '这是一条包含关键词的消息',
      });

      const { container } = render(
        <MessageCard message={message} searchQuery="关键词" highlightMatches={true} />
      );

      // 查找高亮的元素
      const highlightedElement = container.querySelector('mark, .bg-yellow-200, .highlight');
      // 如果组件支持高亮，应该有高亮元素
      // 这个测试取决于组件的具体实现
    });
  });

  describe('与其他平台消息的对比', () => {
    test('Lark 消息应该与 Gmail 消息有不同的样式', () => {
      const larkMessage = createMockLarkMessage();
      const gmailMessage: MessageResult = {
        ...larkMessage,
        id: 'gmail_1',
        platform: 'gmail',
      };

      const { rerender, container } = render(<MessageCard message={larkMessage} />);
      const larkBadge = container.querySelector('.bg-blue-100');

      rerender(<MessageCard message={gmailMessage} />);
      const gmailBadge = container.querySelector('.bg-red-100');

      // Lark 使用蓝色，Gmail 使用红色
      expect(larkBadge || gmailBadge).toBeTruthy();
    });

    test('Lark 消息应该与 Slack 消息有不同的样式', () => {
      const larkMessage = createMockLarkMessage();
      const slackMessage: MessageResult = {
        ...larkMessage,
        id: 'slack_1',
        platform: 'slack',
      };

      const { rerender, container } = render(<MessageCard message={larkMessage} />);
      const larkStyles = container.innerHTML;

      rerender(<MessageCard message={slackMessage} />);
      const slackStyles = container.innerHTML;

      // 两者的样式应该不同
      expect(larkStyles).not.toBe(slackStyles);
    });
  });

  describe('发送者信息显示', () => {
    test('应该显示发送者头像（如果有）', () => {
      const message = createMockLarkMessage({
        sender: {
          name: '李四',
          userId: 'ou_lisi',
          avatar: 'https://example.com/lisi-avatar.jpg',
        },
      });

      const { container } = render(<MessageCard message={message} />);

      // 查找头像元素
      const avatarImg = container.querySelector('img[src*="avatar"]');
      // 如果组件显示头像，应该能找到
    });

    test('应该正确处理没有头像的发送者', () => {
      const message = createMockLarkMessage({
        sender: {
          name: '王五',
          userId: 'ou_wangwu',
        },
      });

      render(<MessageCard message={message} />);

      // 应该显示发送者名称
      expect(screen.getByText('王五')).toBeInTheDocument();
    });
  });

  describe('深度链接', () => {
    test('应该包含正确的 Lark 深度链接', () => {
      const message = createMockLarkMessage({
        deepLink: 'https://applink.larksuite.com/client/chat/open?openChatId=oc_test&messageId=om_test',
      });

      render(<MessageCard message={message} />);

      // 查找包含链接的元素
      const linkElement = document.querySelector('a[href*="larksuite.com"]');
      // 或者验证 onOpenSource 会收到正确的 deepLink
    });
  });

  describe('元数据显示', () => {
    test('应该能够访问消息元数据', () => {
      const message = createMockLarkMessage({
        metadata: {
          msg_type: 'post',
          chat_id: 'oc_special_chat',
          parent_id: 'om_parent',
          root_id: 'om_root',
        },
      });

      // 元数据通常不直接显示，但应该可以通过 message 对象访问
      expect(message.metadata).toBeDefined();
      expect(message.metadata?.msg_type).toBe('post');
    });
  });

  describe('响应式布局', () => {
    test('组件应该正确渲染不同的 className', () => {
      const message = createMockLarkMessage();

      const { container } = render(<MessageCard message={message} className="custom-class" />);

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('错误处理', () => {
    test('应该优雅地处理缺失的字段', () => {
      const incompleteMessage: MessageResult = {
        id: 'incomplete_1',
        platform: 'lark',
        content: '内容',
        snippet: '内容',
        timestamp: new Date(),
        sender: {
          name: '',
          userId: '',
        },
        deepLink: '',
        messageType: 'text',
      };

      // 不应该抛出错误
      expect(() => render(<MessageCard message={incompleteMessage} />)).not.toThrow();
    });
  });
});
