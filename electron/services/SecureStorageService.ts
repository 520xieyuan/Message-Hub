/**
 * 安全存储服务
 * 使用 electron-store 存储一般配置，使用 keytar 存储敏感信息
 * 实现数据加密和安全访问控制
 */

import Store from 'electron-store'
import * as keytar from 'keytar'
import { createHash, createCipher, createDecipher, randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'
import { PlatformCredentials } from '../../src/types/platform'

export interface SecureStorageOptions {
  /** 应用名称，用于keytar服务标识 */
  serviceName: string
  /** 加密算法 */
  encryptionAlgorithm: string
  /** 是否启用加密 */
  enableEncryption: boolean
}

export class SecureStorageService {
  private store: Store<Record<string, any>>
  private serviceName: string
  private encryptionAlgorithm: string
  private enableEncryption: boolean
  private encryptionKey: string | null = null

  constructor(options: SecureStorageOptions) {
    this.serviceName = options.serviceName
    this.encryptionAlgorithm = options.encryptionAlgorithm
    this.enableEncryption = options.enableEncryption

    // 初始化 electron-store
    this.store = new Store<Record<string, any>>({
      name: 'app-config',
      defaults: {
        userConfig: {},
        appSettings: {},
        searchHistory: []
      }
    })

    // 如果启用加密，异步设置加密密钥
    if (this.enableEncryption) {
      this.getOrCreateEncryptionKey().then(key => {
        this.encryptionKey = key
      }).catch(error => {
        console.error('Failed to initialize encryption key:', error)
      })
    }
  }

  /**
   * 获取或创建加密密钥
   */
  private async getOrCreateEncryptionKey(): Promise<string> {
    if (this.encryptionKey) {
      return this.encryptionKey
    }

    try {
      // 尝试从系统密钥链获取加密密钥
      let key = await keytar.getPassword(this.serviceName, 'encryption-key')

      if (!key) {
        // 如果不存在，生成新的加密密钥
        key = randomBytes(32).toString('hex')
        await keytar.setPassword(this.serviceName, 'encryption-key', key)
      }

      this.encryptionKey = key
      return key
    } catch (error) {
      console.error('Failed to get or create encryption key:', error)
      // 如果keytar失败，使用基于机器的固定密钥
      const machineId = require('os').hostname() + require('os').platform()
      this.encryptionKey = createHash('sha256').update(machineId).digest('hex')
      return this.encryptionKey
    }
  }

  /**
   * 加密数据
   */
  private async encrypt(data: string): Promise<string> {
    if (!this.enableEncryption || !this.encryptionKey) {
      return data
    }

    try {
      // 生成随机IV和盐
      const iv = randomBytes(16)
      const salt = randomBytes(32)

      // 使用scrypt派生密钥
      const scryptAsync = promisify(scrypt)
      const key = await scryptAsync(this.encryptionKey, salt, 32) as Buffer

      // 使用AES-256-CBC加密
      const cipher = createCipher('aes-256-cbc', key)
      cipher.update(iv) // 使用IV初始化
      let encrypted = cipher.update(data, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      // 组合所有数据：salt + iv + encrypted
      const result = salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted
      return result
    } catch (error) {
      console.error('Encryption failed:', error)
      return data
    }
  }

  /**
   * 解密数据
   */
  private async decrypt(encryptedData: string): Promise<string> {
    if (!this.enableEncryption || !this.encryptionKey) {
      return encryptedData
    }

    try {
      // 分离组件
      const parts = encryptedData.split(':')
      if (parts.length !== 3) {
        // 尝试旧格式的解密（向后兼容）
        try {
          const decipher = createDecipher(this.encryptionAlgorithm, this.encryptionKey)
          let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
          decrypted += decipher.final('utf8')
          return decrypted
        } catch {
          console.error('Invalid encrypted data format')
          return encryptedData
        }
      }

      const salt = Buffer.from(parts[0], 'hex')
      const iv = Buffer.from(parts[1], 'hex')
      const encrypted = parts[2]

      // 使用scrypt派生密钥
      const scryptAsync = promisify(scrypt)
      const key = await scryptAsync(this.encryptionKey, salt, 32) as Buffer

      // 使用AES-256-CBC解密
      const decipher = createDecipher('aes-256-cbc', key)
      decipher.update(iv) // 使用IV初始化

      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      console.error('Decryption failed:', error)
      return encryptedData
    }
  }

  /**
   * 存储平台认证凭据到系统密钥链
   */
  async storeCredentials(platformId: string, credentials: PlatformCredentials): Promise<void> {
    try {
      const credentialsJson = JSON.stringify(credentials)
      const encryptedCredentials = await this.encrypt(credentialsJson)

      await keytar.setPassword(
        this.serviceName,
        `platform-${platformId}`,
        encryptedCredentials
      )
    } catch (error) {
      console.error(`Failed to store credentials for platform ${platformId}:`, error)
      throw new Error(`Failed to store credentials: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 从系统密钥链获取平台认证凭据
   */
  async getCredentials(platformId: string): Promise<PlatformCredentials | null> {
    try {
      console.log(`🔍 [SecureStorageService] Getting credentials from keytar for: ${platformId}`)
      const encryptedCredentials = await keytar.getPassword(
        this.serviceName,
        `platform-${platformId}`
      )

      if (!encryptedCredentials) {
        console.warn(`⚠️  [SecureStorageService] No encrypted credentials found in keytar for: ${platformId}`)
        return null
      }

      console.log(`🔓 [SecureStorageService] Decrypting credentials for: ${platformId}`)
      const credentialsJson = await this.decrypt(encryptedCredentials)
      const credentials = JSON.parse(credentialsJson) as PlatformCredentials

      console.log(`✅ [SecureStorageService] Credentials decrypted for ${platformId}:`, {
        hasAccessToken: !!credentials.accessToken,
        tokenPrefix: credentials.accessToken?.substring(0, 10),
        hasRefreshToken: !!credentials.refreshToken,
        hasAdditional: !!credentials.additional,
        additionalData: credentials.additional
      })

      return credentials
    } catch (error) {
      console.error(`Failed to get credentials for platform ${platformId}:`, error)
      return null
    }
  }

  /**
   * 删除平台认证凭据
   */
  async deleteCredentials(platformId: string): Promise<void> {
    try {
      await keytar.deletePassword(this.serviceName, `platform-${platformId}`)
    } catch (error) {
      console.error(`Failed to delete credentials for platform ${platformId}:`, error)
      throw new Error(`Failed to delete credentials: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取所有已存储的平台ID列表
   */
  async getStoredPlatformIds(): Promise<string[]> {
    try {
      const credentials = await keytar.findCredentials(this.serviceName)
      return credentials
        .map(cred => cred.account)
        .filter(account => account.startsWith('platform-'))
        .map(account => account.replace('platform-', ''))
    } catch (error) {
      console.error('Failed to get stored platform IDs:', error)
      return []
    }
  }

  /**
   * 存储一般配置数据
   */
  setConfig<T>(key: string, value: T): void {
    try {
      this.store.set(key, value)
    } catch (error) {
      console.error(`Failed to set config ${key}:`, error)
      throw new Error(`Failed to set config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取一般配置数据
   */
  getConfig<T>(key: string, defaultValue?: T): T {
    try {
      return this.store.get(key, defaultValue) as T
    } catch (error) {
      console.error(`Failed to get config ${key}:`, error)
      return defaultValue as T
    }
  }

  /**
   * 删除配置数据
   */
  deleteConfig(key: string): void {
    try {
      this.store.delete(key)
    } catch (error) {
      console.error(`Failed to delete config ${key}:`, error)
      throw new Error(`Failed to delete config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 检查配置是否存在
   */
  hasConfig(key: string): boolean {
    try {
      return this.store.has(key)
    } catch (error) {
      console.error(`Failed to check config ${key}:`, error)
      return false
    }
  }

  /**
   * 获取所有配置键
   */
  getAllConfigKeys(): string[] {
    try {
      return Object.keys(this.store.store)
    } catch (error) {
      console.error('Failed to get all config keys:', error)
      return []
    }
  }

  /**
   * 清除所有配置数据
   */
  clearAllConfig(): void {
    try {
      this.store.clear()
    } catch (error) {
      console.error('Failed to clear all config:', error)
      throw new Error(`Failed to clear config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 清除所有敏感数据（包括密钥链中的凭据）
   */
  async clearAllSensitiveData(): Promise<void> {
    try {
      // 清除所有平台凭据
      const platformIds = await this.getStoredPlatformIds()
      for (const platformId of platformIds) {
        await this.deleteCredentials(platformId)
      }

      // 清除加密密钥
      if (this.encryptionKey) {
        await keytar.deletePassword(this.serviceName, 'encryption-key')
        this.encryptionKey = null
      }

      // 清除本地配置
      this.clearAllConfig()
    } catch (error) {
      console.error('Failed to clear all sensitive data:', error)
      throw new Error(`Failed to clear sensitive data: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取存储统计信息
   */
  getStorageStats(): {
    configKeys: number
    storedPlatforms: number
    storeSize: number
  } {
    try {
      const configKeys = this.getAllConfigKeys().length
      // 注意：无法同步获取平台数量，这里返回0
      const storedPlatforms = 0
      const storeSize = JSON.stringify(this.store.store).length

      return {
        configKeys,
        storedPlatforms,
        storeSize
      }
    } catch (error) {
      console.error('Failed to get storage stats:', error)
      return {
        configKeys: 0,
        storedPlatforms: 0,
        storeSize: 0
      }
    }
  }

  /**
   * 获取配置文件存储路径
   */
  getStorePath(): string {
    return this.store.path
  }

  /**
   * 验证存储完整性
   */
  async validateStorageIntegrity(): Promise<boolean> {
    try {
      // 测试配置存储
      const testKey = '__integrity_test__'
      const testValue = { test: true, timestamp: Date.now() }

      this.setConfig(testKey, testValue)
      const retrieved = this.getConfig(testKey)
      this.deleteConfig(testKey)

      if (JSON.stringify(retrieved) !== JSON.stringify(testValue)) {
        return false
      }

      // 测试凭据存储和加密
      const testCredentials: PlatformCredentials = {
        accessToken: 'test-token-' + Date.now(),
        refreshToken: 'test-refresh-' + Date.now(),
        expiresAt: new Date()
      }

      await this.storeCredentials('__test__', testCredentials)
      const retrievedCredentials = await this.getCredentials('__test__')
      await this.deleteCredentials('__test__')

      if (!retrievedCredentials ||
        retrievedCredentials.accessToken !== testCredentials.accessToken ||
        retrievedCredentials.refreshToken !== testCredentials.refreshToken) {
        return false
      }

      return true
    } catch (error) {
      console.error('Storage integrity validation failed:', error)
      return false
    }
  }
}