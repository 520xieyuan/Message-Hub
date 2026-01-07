/**
 * Chrome Profile管理器
 * 管理不同账户的Chrome用户配置文件
 */

import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'
import { logger } from '../utils/logger'

const execAsync = promisify(exec)

export interface ChromeProfile {
  id: string
  name: string
  path: string
  accountEmail?: string
  platform?: string
  isDefault: boolean
  lastUsed: Date
  displayName?: string
}

export interface BrowserInfo {
  name: string
  path: string
  version?: string
  isDefault: boolean
}

export class ChromeProfileManager {
  private profiles: Map<string, ChromeProfile> = new Map()
  private chromePath: string | null = null
  private userDataDir: string | null = null

  constructor() {
    this.initialize()
  }

  /**
   * 初始化管理器
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('[ChromeProfileManager] Initializing...')
      this.chromePath = await this.detectChromePath()
      logger.info('[ChromeProfileManager] Chrome path detected:', this.chromePath)

      this.userDataDir = this.getChromeUserDataDir()
      logger.info('[ChromeProfileManager] User data dir:', this.userDataDir)

      await this.loadExistingProfiles()
      logger.info('[ChromeProfileManager] Loaded profiles:', this.profiles.size)

      logger.info('[ChromeProfileManager] Initialization complete')
    } catch (error) {
      logger.error('[ChromeProfileManager] Failed to initialize:', error)
      logger.error('[ChromeProfileManager] Chrome features will be disabled')
    }
  }

  /**
   * 为账户创建或获取Chrome Profile
   */
  async getOrCreateProfile(platform: string, accountEmail: string, displayName?: string): Promise<ChromeProfile> {
    const profileId = this.generateProfileId(platform, accountEmail)

    // 1. 检查应用管理的Profile是否已存在
    if (this.profiles.has(profileId)) {
      const profile = this.profiles.get(profileId)!
      profile.lastUsed = new Date()
      await this.saveProfiles()
      return profile
    }

    // 2. 检查Chrome现有Profile中是否已登录该邮箱
    const existingProfile = await this.findExistingProfileByEmail(accountEmail)
    if (existingProfile) {

      // 将现有Profile纳入应用管理
      const managedProfile: ChromeProfile = {
        id: profileId,
        name: existingProfile.name,
        path: existingProfile.path,
        accountEmail,
        platform,
        isDefault: existingProfile.name === 'Default',
        lastUsed: new Date(),
        displayName: displayName || accountEmail
      }

      this.profiles.set(profileId, managedProfile)
      await this.saveProfiles()

      return managedProfile
    }

    // 3. 创建新Profile
    return await this.createProfile(profileId, platform, accountEmail, displayName)
  }

  /**
   * 使用指定Profile打开Chrome
   */
  async openChromeWithProfile(profileId: string, url: string): Promise<void> {
    const profile = this.profiles.get(profileId)
    if (!profile) {
      throw new Error(`Profile不存在: ${profileId}`)
    }

    if (!this.chromePath) {
      logger.error('[ChromeProfileManager] Chrome path not initialized')
      throw new Error('未找到Chrome浏览器。请确保已安装 Google Chrome。')
    }

    logger.info('[ChromeProfileManager] Opening Chrome with profile:', {
      profileId,
      profileName: profile.name,
      chromePath: this.chromePath,
      userDataDir: this.userDataDir,
      url: url.substring(0, 100) + '...'
    })

    // 验证 Chrome 路径是否存在
    if (!existsSync(this.chromePath)) {
      const error = `Chrome 可执行文件不存在: ${this.chromePath}`
      console.error('[ChromeProfileManager]', error)
      throw new Error(error)
    }

    // 验证用户数据目录
    if (!this.userDataDir) {
      const error = 'Chrome 用户数据目录未初始化'
      console.error('[ChromeProfileManager]', error)
      throw new Error(error)
    }

    // 确保用户数据目录存在
    if (!existsSync(this.userDataDir)) {
      console.log('[ChromeProfileManager] Creating user data directory:', this.userDataDir)
      try {
        mkdirSync(this.userDataDir, { recursive: true })
      } catch (error) {
        console.error('[ChromeProfileManager] Failed to create user data directory:', error)
        throw new Error(`无法创建用户数据目录: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const args = [
      `--user-data-dir=${this.userDataDir}`,
      `--profile-directory=${profile.name}`,
      '--new-window',
      '--no-first-run',
      '--no-default-browser-check',
      url
    ]

    logger.info('[ChromeProfileManager] Spawning Chrome with args:', args)

    try {
      const chromeProcess = spawn(this.chromePath, args, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'], // 捕获输出以便调试
        windowsHide: false
      })

      // 监听进程错误
      chromeProcess.on('error', (error) => {
        console.error('[ChromeProfileManager] Chrome process error:', error)
      })

      // 监听进程退出
      chromeProcess.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          console.warn('[ChromeProfileManager] Chrome exited with code:', code)
        }
        if (signal) {
          console.warn('[ChromeProfileManager] Chrome killed by signal:', signal)
        }
      })

      // 捕获 stderr 输出（仅用于调试）
      if (chromeProcess.stderr) {
        chromeProcess.stderr.on('data', (data) => {
          console.error('[ChromeProfileManager] Chrome stderr:', data.toString())
        })
      }

      chromeProcess.unref()

      logger.info('[ChromeProfileManager] Chrome process spawned successfully, PID:', chromeProcess.pid)

      // 更新最后使用时间
      profile.lastUsed = new Date()
      await this.saveProfiles()
    } catch (error) {
      logger.error('[ChromeProfileManager] Failed to spawn Chrome:', error)
      logger.error('[ChromeProfileManager] Chrome path:', this.chromePath)
      logger.error('[ChromeProfileManager] Args:', args)
      logger.error('[ChromeProfileManager] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`启动Chrome失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 列出所有Profiles
   */
  async listProfiles(): Promise<ChromeProfile[]> {
    await this.loadExistingProfiles()
    return Array.from(this.profiles.values())
  }

  /**
   * 删除Profile
   */
  async deleteProfile(profileId: string): Promise<void> {
    const profile = this.profiles.get(profileId)
    if (!profile) {
      throw new Error(`Profile不存在: ${profileId}`)
    }

    if (profile.isDefault) {
      throw new Error('不能删除默认Profile')
    }

    this.profiles.delete(profileId)
    await this.saveProfiles()
  }

  /**
   * 检测Chrome安装路径
   */
  private async detectChromePath(): Promise<string> {
    const currentPlatform = platform()
    console.log('[ChromeProfileManager] Detecting Chrome path on platform:', currentPlatform)

    const commonPaths = {
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
      ],
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      ],
      linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
      ]
    }

    const paths = commonPaths[currentPlatform as keyof typeof commonPaths] || []

    console.log('[ChromeProfileManager] Checking common paths:', paths)
    for (const path of paths) {
      if (path && existsSync(path)) {
        console.log('[ChromeProfileManager] Found Chrome at:', path)
        return path
      }
    }

    // 尝试通过命令行查找
    try {
      let command: string
      switch (currentPlatform) {
        case 'win32':
          command = 'where chrome.exe'
          break
        case 'darwin':
          command = 'which "Google Chrome"'
          break
        default:
          command = 'which google-chrome || which google-chrome-stable || which chromium-browser'
      }

      console.log('[ChromeProfileManager] Trying command:', command)
      const { stdout } = await execAsync(command)
      const chromePath = stdout.trim().split('\n')[0] // 取第一个结果
      console.log('[ChromeProfileManager] Command result:', chromePath)

      if (chromePath && existsSync(chromePath)) {
        console.log('[ChromeProfileManager] Found Chrome via command:', chromePath)
        return chromePath
      }
    } catch (error) {
      console.warn('[ChromeProfileManager] Command search failed:', error)
    }

    // 尝试注册表查找 (Windows only)
    if (currentPlatform === 'win32') {
      try {
        console.log('[ChromeProfileManager] Trying Windows registry...')
        const { stdout } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve')
        const match = stdout.match(/REG_SZ\s+(.+)/i)
        if (match && match[1]) {
          const chromePath = match[1].trim()
          if (existsSync(chromePath)) {
            console.log('[ChromeProfileManager] Found Chrome via registry:', chromePath)
            return chromePath
          }
        }
      } catch (error) {
        console.warn('[ChromeProfileManager] Registry search failed:', error)
      }
    }

    console.error('[ChromeProfileManager] Chrome not found in any location')
    throw new Error('未找到Chrome浏览器')
  }

  /**
   * 获取Chrome用户数据目录
   */
  private getChromeUserDataDir(): string {
    const currentPlatform = platform()

    switch (currentPlatform) {
      case 'win32':
        return join(homedir(), 'AppData\\Local\\Google\\Chrome\\User Data')
      case 'darwin':
        return join(homedir(), 'Library/Application Support/Google/Chrome')
      case 'linux':
        return join(homedir(), '.config/google-chrome')
      default:
        throw new Error(`不支持的平台: ${currentPlatform}`)
    }
  }

  /**
   * 查找Chrome现有Profile中是否已登录指定邮箱
   */
  private async findExistingProfileByEmail(accountEmail: string): Promise<{ name: string; path: string } | null> {
    if (!this.userDataDir || !existsSync(this.userDataDir)) {
      return null
    }

    try {
      const entries = readdirSync(this.userDataDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory() && (entry.name.startsWith('Profile') || entry.name === 'Default')) {
          const profilePath = join(this.userDataDir, entry.name)
          const preferencesPath = join(profilePath, 'Preferences')

          if (existsSync(preferencesPath)) {
            try {
              const preferences = JSON.parse(readFileSync(preferencesPath, 'utf8'))
              const accountInfo = preferences.account_info || []

              // 检查是否有匹配的邮箱
              const hasMatchingEmail = accountInfo.some((account: any) =>
                account.email === accountEmail || account.account_id === accountEmail
              )

              if (hasMatchingEmail) {
                return {
                  name: entry.name,
                  path: profilePath
                }
              }
            } catch (error) {
              console.warn(`Failed to parse preferences for ${entry.name}:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning Chrome profiles:', error)
    }

    return null
  }

  /**
   * 生成Profile ID
   */
  private generateProfileId(platform: string, accountEmail: string): string {
    // 使用平台和邮箱生成唯一ID
    const sanitized = accountEmail.replace(/[^a-zA-Z0-9]/g, '_')
    return `${platform}_${sanitized}`
  }

  /**
   * 创建新的Chrome Profile
   */
  private async createProfile(profileId: string, platform: string, accountEmail: string, displayName?: string): Promise<ChromeProfile> {
    if (!this.userDataDir) {
      throw new Error('Chrome用户数据目录未初始化')
    }

    // 生成Profile目录名
    const profileDirName = `Profile_${profileId}`
    const profilePath = join(this.userDataDir, profileDirName)

    // 创建Profile目录
    if (!existsSync(profilePath)) {
      mkdirSync(profilePath, { recursive: true })
    }

    // 创建Profile配置
    const profile: ChromeProfile = {
      id: profileId,
      name: profileDirName,
      path: profilePath,
      accountEmail,
      platform,
      isDefault: false,
      lastUsed: new Date(),
      displayName: displayName || accountEmail
    }

    // 创建Chrome Profile的Preferences文件
    const preferencesPath = join(profilePath, 'Preferences')
    const preferences = {
      profile: {
        name: displayName || accountEmail,
        managed_user_id: '',
        avatar_index: Math.floor(Math.random() * 26), // 随机头像
      },
      account_info: [
        {
          account_id: accountEmail,
          email: accountEmail,
          full_name: displayName || accountEmail
        }
      ],
      // 禁用一些首次运行的提示
      browser: {
        show_home_button: true,
        check_default_browser: false
      },
      first_run_tabs: [
        'https://www.google.com'
      ]
    }

    try {
      writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2))

      // 保存到内存和持久化存储
      this.profiles.set(profileId, profile)
      await this.saveProfiles()
      return profile
    } catch (error) {
      console.error('创建Chrome Profile失败:', error)
      throw new Error(`创建Chrome Profile失败: ${error}`)
    }
  }

  /**
   * 加载现有的Profiles
   */
  private async loadExistingProfiles(): Promise<void> {
    try {
      // 清空现有的profiles，重新加载
      this.profiles.clear()

      // 从配置文件加载
      await this.loadProfilesFromConfig()

      // 扫描Chrome用户数据目录
      await this.scanChromeProfiles()

      // 如果扫描到了新的 profiles，保存到配置文件
      const hasUnmanagedProfiles = Array.from(this.profiles.values()).some(p => p.id.startsWith('unmanaged_'))
      if (hasUnmanagedProfiles) {
        // 将 unmanaged profiles 转换为 managed
        const updatedProfiles = new Map<string, ChromeProfile>()
        for (const [id, profile] of this.profiles.entries()) {
          if (id.startsWith('unmanaged_')) {
            // 生成新的 managed ID
            const newId = `managed_${profile.name}_${Date.now()}`
            updatedProfiles.set(newId, { ...profile, id: newId })
          } else {
            updatedProfiles.set(id, profile)
          }
        }
        this.profiles = updatedProfiles
        await this.saveProfiles()
      }
    } catch (error) {
      console.error('加载Chrome Profiles失败:', error)
    }
  }

  /**
   * 从配置文件加载Profiles
   */
  private async loadProfilesFromConfig(): Promise<void> {
    if (!this.userDataDir) return

    const configPath = join(this.userDataDir, 'message_search_profiles.json')

    if (existsSync(configPath)) {
      try {
        const data = readFileSync(configPath, 'utf-8')
        const profiles = JSON.parse(data)

        let loadedCount = 0
        for (const profile of profiles) {
          // 只加载实际存在的Profile
          if (existsSync(profile.path)) {
            this.profiles.set(profile.id, {
              ...profile,
              lastUsed: new Date(profile.lastUsed)
            })
            loadedCount++
          }
        }
      } catch (error) {
        console.error('Failed to parse profile config file:', error)
      }
    }
  }

  /**
   * 扫描Chrome Profiles目录
   */
  private async scanChromeProfiles(): Promise<void> {
    if (!this.userDataDir || !existsSync(this.userDataDir)) {
      return
    }

    try {
      const entries = readdirSync(this.userDataDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory() && (entry.name.startsWith('Profile') || entry.name === 'Default')) {
          const profilePath = join(this.userDataDir, entry.name)
          const preferencesPath = join(profilePath, 'Preferences')

          if (existsSync(preferencesPath)) {
            try {
              const preferences = JSON.parse(readFileSync(preferencesPath, 'utf-8'))

              // 尝试获取更友好的显示名称
              let displayName = preferences.profile?.name || entry.name
              let accountEmail: string | undefined

              // 尝试从账户信息中获取邮箱
              const accountInfo = preferences.account_info
              if (accountInfo && Array.isArray(accountInfo) && accountInfo.length > 0) {
                const firstAccount = accountInfo[0]
                accountEmail = firstAccount.email || firstAccount.account_id
                // 如果有账户信息，使用邮箱或全名作为显示名称
                if (accountEmail) {
                  displayName = firstAccount.full_name || accountEmail
                }
              }

              // 如果显示名称还是默认的，尝试使用目录名
              if (displayName === 'Your Chrome' || displayName === entry.name) {
                if (accountEmail) {
                  displayName = accountEmail
                } else {
                  displayName = entry.name === 'Default' ? 'Default Profile' : `Profile ${entry.name.replace('Profile ', '')}`
                }
              }

              // 如果不在我们的管理列表中，添加为未管理的Profile
              const existingProfile = Array.from(this.profiles.values()).find(p => p.name === entry.name)
              if (!existingProfile) {
                const profile: ChromeProfile = {
                  id: `unmanaged_${entry.name}`,
                  name: entry.name,
                  path: profilePath,
                  isDefault: entry.name === 'Default',
                  lastUsed: new Date(),
                  displayName: displayName,
                  accountEmail: accountEmail
                }

                this.profiles.set(profile.id, profile)
              }
            } catch (error) {
              console.error(`解析Profile ${entry.name} 失败:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error('扫描Chrome Profiles失败:', error)
    }
  }

  /**
   * 保存Profiles到配置文件
   */
  private async saveProfiles(): Promise<void> {
    if (!this.userDataDir) return

    try {
      // 确保目录存在
      if (!existsSync(this.userDataDir)) {
        mkdirSync(this.userDataDir, { recursive: true })
      }

      const configPath = join(this.userDataDir, 'message_search_profiles.json')

      // 保存所有 managed profiles
      const managedProfiles = Array.from(this.profiles.values())
        .filter(p => p.id.startsWith('managed_'))

      writeFileSync(configPath, JSON.stringify(managedProfiles, null, 2))
    } catch (error) {
      console.error('Failed to save profiles:', error)
    }
  }

  /**
   * 获取浏览器信息
   */
  async getBrowserInfo(): Promise<BrowserInfo | null> {
    if (!this.chromePath) {
      return null
    }

    try {
      const { stdout } = await execAsync(`"${this.chromePath}" --version`)
      const version = stdout.match(/[\d.]+/)?.[0]

      return {
        name: 'Google Chrome',
        path: this.chromePath,
        version,
        isDefault: true
      }
    } catch (error) {
      console.error('获取Chrome版本失败:', error)
      return {
        name: 'Google Chrome',
        path: this.chromePath,
        isDefault: true
      }
    }
  }

  /**
   * 诊断 Chrome 安装情况
   */
  async diagnoseChrome(): Promise<{
    success: boolean
    chromePath: string | null
    userDataDir: string | null
    checkedPaths: Array<{ path: string; exists: boolean }>
    profiles: number
    error?: string
  }> {
    const currentPlatform = platform()
    const checkedPaths: Array<{ path: string; exists: boolean }> = []

    // 检查所有可能的路径
    const commonPaths = {
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
      ],
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      ],
      linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
      ]
    }

    const paths = commonPaths[currentPlatform as keyof typeof commonPaths] || []

    for (const path of paths) {
      if (path) {
        const exists = existsSync(path)
        checkedPaths.push({ path, exists })
      }
    }

    // 尝试命令行查找
    try {
      let command: string
      switch (currentPlatform) {
        case 'win32':
          command = 'where chrome.exe'
          break
        case 'darwin':
          command = 'which "Google Chrome"'
          break
        default:
          command = 'which google-chrome || which google-chrome-stable'
      }

      const { stdout } = await execAsync(command)
      const foundPath = stdout.trim().split('\n')[0]
      if (foundPath) {
        checkedPaths.push({ path: `[命令行] ${foundPath}`, exists: existsSync(foundPath) })
      }
    } catch (error) {
      // 命令失败
    }

    // Windows 注册表查找
    if (currentPlatform === 'win32') {
      try {
        const { stdout } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve')
        const match = stdout.match(/REG_SZ\s+(.+)/i)
        if (match && match[1]) {
          const regPath = match[1].trim()
          checkedPaths.push({ path: `[注册表] ${regPath}`, exists: existsSync(regPath) })
        }
      } catch (error) {
        // 注册表查询失败
      }
    }

    return {
      success: this.chromePath !== null,
      chromePath: this.chromePath,
      userDataDir: this.userDataDir,
      checkedPaths,
      profiles: this.profiles.size,
      error: this.chromePath ? undefined : '未找到 Chrome 浏览器'
    }
  }
}