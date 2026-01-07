/**
 * SlackAdapter集成测试
 * 测试SlackAdapter与平台适配器工厂的集成
 */

import { PlatformAdapterFactory } from '../../PlatformAdapterFactory';
import { SlackAdapter } from '../SlackAdapter';
import { PlatformConfig } from '../../../../src/types/platform';

describe('SlackAdapter Integration', () => {
  let factory: PlatformAdapterFactory;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    factory = PlatformAdapterFactory.getInstance();
    
    mockConfig = {
      id: 'slack-integration-test',
      name: 'slack',
      displayName: 'Slack Integration Test',
      enabled: true,
      credentials: {
        accessToken: 'xoxb-test-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
      settings: {
        maxResults: 20,
      },
      connectionStatus: {
        connected: false,
        lastChecked: new Date(),
      },
      lastUpdated: new Date(),
    };
  });

  afterEach(async () => {
    await factory.clearAll();
  });

  test('应该能够通过工厂创建SlackAdapter', () => {
    const adapter = factory.createAdapter(mockConfig);
    
    expect(adapter).toBeInstanceOf(SlackAdapter);
    expect(adapter.getPlatformType()).toBe('slack');
  });

  test('应该能够从工厂获取已创建的适配器', () => {
    const adapter1 = factory.createAdapter(mockConfig);
    const adapter2 = factory.getAdapter(mockConfig.id);
    
    expect(adapter1).toBe(adapter2);
  });

  test('应该能够移除适配器', async () => {
    factory.createAdapter(mockConfig);
    
    expect(factory.getAdapter(mockConfig.id)).toBeDefined();
    
    await factory.removeAdapter(mockConfig.id);
    
    expect(factory.getAdapter(mockConfig.id)).toBeUndefined();
  });

  test('应该支持Slack平台类型', () => {
    expect(PlatformAdapterFactory.isSupportedPlatform('slack')).toBe(true);
    expect(PlatformAdapterFactory.getSupportedPlatforms()).toContain('slack');
  });

  test('应该能够清理所有适配器', async () => {
    factory.createAdapter(mockConfig);
    factory.createAdapter({
      ...mockConfig,
      id: 'slack-test-2',
    });

    const allAdapters = factory.getAllAdapters();
    expect(allAdapters.size).toBe(2);

    await factory.clearAll();

    const clearedAdapters = factory.getAllAdapters();
    expect(clearedAdapters.size).toBe(0);
  });
});