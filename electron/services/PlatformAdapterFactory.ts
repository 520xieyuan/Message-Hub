/**
 * 平台适配器工厂
 * 负责创建和管理不同平台的适配器实例
 */

import { PlatformAdapter, PlatformConfig, PlatformType } from '../../src/types/platform';
import { SlackAdapter } from './adapters/SlackAdapter';
import { GmailAdapter } from './adapters/GmailAdapter';
import { LarkAdapter } from './adapters/LarkAdapter';
import { ConfigurationService } from './ConfigurationService';

export class PlatformAdapterFactory {
  private static instance: PlatformAdapterFactory;
  private adapters: Map<string, PlatformAdapter> = new Map();
  private configService: ConfigurationService | null = null;

  private constructor() {}

  /**
   * 获取工厂单例实例
   */
  public static getInstance(): PlatformAdapterFactory {
    if (!PlatformAdapterFactory.instance) {
      PlatformAdapterFactory.instance = new PlatformAdapterFactory();
    }
    return PlatformAdapterFactory.instance;
  }

  /**
   * 设置 ConfigurationService
   */
  public setConfigurationService(configService: ConfigurationService): void {
    this.configService = configService;
  }

  /**
   * 创建平台适配器
   * @param config 平台配置
   * @returns 平台适配器实例
   */
  public createAdapter(config: PlatformConfig): PlatformAdapter {
    const existingAdapter = this.adapters.get(config.id);
    if (existingAdapter) {
      return existingAdapter;
    }

    let adapter: PlatformAdapter;

    switch (config.name) {
      case 'slack':
        adapter = new SlackAdapter(config, this.configService || undefined);
        break;
      case 'gmail':
        adapter = new GmailAdapter(config, this.configService || undefined);
        break;
      case 'lark':
        adapter = new LarkAdapter(config, this.configService || undefined);
        break;
      default:
        throw new Error(`Unsupported platform type: ${config.name}`);
    }

    this.adapters.set(config.id, adapter);
    return adapter;
  }

  /**
   * 获取已创建的适配器
   * @param configId 配置ID
   * @returns 适配器实例或undefined
   */
  public getAdapter(configId: string): PlatformAdapter | undefined {
    return this.adapters.get(configId);
  }

  /**
   * 移除适配器
   * @param configId 配置ID
   */
  public async removeAdapter(configId: string): Promise<void> {
    const adapter = this.adapters.get(configId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(configId);
    }
  }

  /**
   * 获取所有已创建的适配器
   * @returns 适配器映射
   */
  public getAllAdapters(): Map<string, PlatformAdapter> {
    return new Map(this.adapters);
  }

  /**
   * 清理所有适配器
   */
  public async clearAll(): Promise<void> {
    const disconnectPromises = Array.from(this.adapters.values()).map(adapter => 
      adapter.disconnect()
    );
    
    await Promise.all(disconnectPromises);
    this.adapters.clear();
  }

  /**
   * 检查是否支持指定的平台类型
   * @param platformType 平台类型
   * @returns 是否支持
   */
  public static isSupportedPlatform(platformType: string): platformType is PlatformType {
    return ['slack', 'gmail', 'lark'].includes(platformType);
  }

  /**
   * 获取支持的平台类型列表
   * @returns 支持的平台类型数组
   */
  public static getSupportedPlatforms(): PlatformType[] {
    return ['slack', 'gmail', 'lark'];
  }
}