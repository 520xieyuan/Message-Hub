/**
 * 账户管理器
 * 管理复杂的多项目、多账户结构
 */

export interface Project {
  id: string
  name: string
  description?: string
  platform: 'gmail' | 'slack' | 'lark'
  accounts: Account[]
  createdAt: Date
  updatedAt: Date
}

export interface Account {
  id: string
  email: string
  displayName?: string
  platform: 'gmail' | 'slack' | 'lark'
  projectId: string
  chromeProfileId?: string
  isActive: boolean
  tokens?: {
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
  }
  metadata?: {
    workspaceId?: string // Slack workspace ID
    workspaceName?: string // Slack workspace name
    domain?: string // Gmail domain
    [key: string]: any
  }
  createdAt: Date
  updatedAt: Date
}

export interface AccountGroup {
  platform: 'gmail' | 'slack' | 'lark'
  projects: Project[]
  totalAccounts: number
}

export class AccountManager {
  private projects: Map<string, Project> = new Map()
  private accounts: Map<string, Account> = new Map()
  private configPath: string

  constructor(configPath: string) {
    this.configPath = configPath
    this.loadConfiguration()
  }

  /**
   * 创建新项目
   */
  async createProject(platform: 'gmail' | 'slack' | 'lark', name: string, description?: string): Promise<Project> {
    const project: Project = {
      id: this.generateId(),
      name,
      description,
      platform,
      accounts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.projects.set(project.id, project)
    await this.saveConfiguration()
    
    console.log(`项目创建成功: ${name} (${platform})`)
    return project
  }

  /**
   * 添加账户到项目
   */
  async addAccountToProject(
    projectId: string, 
    email: string, 
    displayName?: string,
    metadata?: Account['metadata']
  ): Promise<Account> {
    const project = this.projects.get(projectId)
    if (!project) {
      throw new Error(`项目不存在: ${projectId}`)
    }

    // 检查账户是否已存在
    const existingAccount = Array.from(this.accounts.values())
      .find(acc => acc.email === email && acc.platform === project.platform)
    
    if (existingAccount) {
      throw new Error(`账户已存在: ${email}`)
    }

    const account: Account = {
      id: this.generateId(),
      email,
      displayName: displayName || email,
      platform: project.platform,
      projectId,
      isActive: true,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.accounts.set(account.id, account)
    project.accounts.push(account)
    project.updatedAt = new Date()

    await this.saveConfiguration()
    
    console.log(`账户添加成功: ${email} -> ${project.name}`)
    return account
  }

  /**
   * 关联Chrome Profile到账户
   */
  async linkChromeProfile(accountId: string, chromeProfileId: string): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    account.chromeProfileId = chromeProfileId
    account.updatedAt = new Date()

    await this.saveConfiguration()
    
    console.log(`Chrome Profile关联成功: ${account.email} -> ${chromeProfileId}`)
  }

  /**
   * 更新账户令牌
   */
  async updateAccountTokens(accountId: string, tokens: Account['tokens']): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    account.tokens = tokens
    account.updatedAt = new Date()

    await this.saveConfiguration()
    
    console.log(`账户令牌更新成功: ${account.email}`)
  }

  /**
   * 获取项目列表
   */
  getProjects(platform?: 'gmail' | 'slack' | 'lark'): Project[] {
    const projects = Array.from(this.projects.values())
    return platform ? projects.filter(p => p.platform === platform) : projects
  }

  /**
   * 获取账户列表
   */
  getAccounts(projectId?: string, platform?: 'gmail' | 'slack' | 'lark'): Account[] {
    let accounts = Array.from(this.accounts.values())
    
    if (projectId) {
      accounts = accounts.filter(acc => acc.projectId === projectId)
    }
    
    if (platform) {
      accounts = accounts.filter(acc => acc.platform === platform)
    }
    
    return accounts
  }

  /**
   * 获取账户分组
   */
  getAccountGroups(): AccountGroup[] {
    const platforms: ('gmail' | 'slack' | 'lark')[] = ['gmail', 'slack', 'lark']
    
    return platforms.map(platform => ({
      platform,
      projects: this.getProjects(platform),
      totalAccounts: this.getAccounts(undefined, platform).length
    }))
  }

  /**
   * 根据邮箱查找账户
   */
  findAccountByEmail(email: string, platform?: 'gmail' | 'slack' | 'lark'): Account | undefined {
    return Array.from(this.accounts.values())
      .find(acc => acc.email === email && (!platform || acc.platform === platform))
  }

  /**
   * 根据Chrome Profile ID查找账户
   */
  findAccountByChromeProfile(chromeProfileId: string): Account | undefined {
    return Array.from(this.accounts.values())
      .find(acc => acc.chromeProfileId === chromeProfileId)
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId)
    if (!project) {
      throw new Error(`项目不存在: ${projectId}`)
    }

    // 删除项目下的所有账户
    for (const account of project.accounts) {
      this.accounts.delete(account.id)
    }

    this.projects.delete(projectId)
    await this.saveConfiguration()
    
    console.log(`项目删除成功: ${project.name}`)
  }

  /**
   * 删除账户
   */
  async deleteAccount(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    const project = this.projects.get(account.projectId)
    if (project) {
      project.accounts = project.accounts.filter(acc => acc.id !== accountId)
      project.updatedAt = new Date()
    }

    this.accounts.delete(accountId)
    await this.saveConfiguration()
    
    console.log(`账户删除成功: ${account.email}`)
  }

  /**
   * 激活/停用账户
   */
  async toggleAccountStatus(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new Error(`账户不存在: ${accountId}`)
    }

    account.isActive = !account.isActive
    account.updatedAt = new Date()

    await this.saveConfiguration()
    
    console.log(`账户状态更新: ${account.email} -> ${account.isActive ? '激活' : '停用'}`)
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalProjects: number
    totalAccounts: number
    activeAccounts: number
    platformStats: Record<string, { projects: number; accounts: number; active: number }>
  } {
    const accounts = Array.from(this.accounts.values())
    const projects = Array.from(this.projects.values())
    
    const platformStats: Record<string, { projects: number; accounts: number; active: number }> = {}
    
    for (const platform of ['gmail', 'slack', 'lark']) {
      const platformProjects = projects.filter(p => p.platform === platform)
      const platformAccounts = accounts.filter(acc => acc.platform === platform)
      const activeAccounts = platformAccounts.filter(acc => acc.isActive)
      
      platformStats[platform] = {
        projects: platformProjects.length,
        accounts: platformAccounts.length,
        active: activeAccounts.length
      }
    }

    return {
      totalProjects: projects.length,
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(acc => acc.isActive).length,
      platformStats
    }
  }

  /**
   * 导出配置
   */
  exportConfiguration(): {
    projects: Project[]
    accounts: Account[]
    exportedAt: Date
  } {
    return {
      projects: Array.from(this.projects.values()),
      accounts: Array.from(this.accounts.values()),
      exportedAt: new Date()
    }
  }

  /**
   * 导入配置
   */
  async importConfiguration(data: {
    projects: Project[]
    accounts: Account[]
  }): Promise<void> {
    // 清空现有数据
    this.projects.clear()
    this.accounts.clear()

    // 导入项目
    for (const project of data.projects) {
      this.projects.set(project.id, {
        ...project,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt)
      })
    }

    // 导入账户
    for (const account of data.accounts) {
      this.accounts.set(account.id, {
        ...account,
        createdAt: new Date(account.createdAt),
        updatedAt: new Date(account.updatedAt)
      })
    }

    await this.saveConfiguration()
    console.log(`配置导入成功: ${data.projects.length} 个项目, ${data.accounts.length} 个账户`)
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 加载配置
   */
  private loadConfiguration(): void {
    try {
      const fs = require('fs')
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
        
        // 加载项目
        if (data.projects) {
          for (const project of data.projects) {
            this.projects.set(project.id, {
              ...project,
              createdAt: new Date(project.createdAt),
              updatedAt: new Date(project.updatedAt)
            })
          }
        }

        // 加载账户
        if (data.accounts) {
          for (const account of data.accounts) {
            this.accounts.set(account.id, {
              ...account,
              createdAt: new Date(account.createdAt),
              updatedAt: new Date(account.updatedAt)
            })
          }
        }

        console.log(`配置加载成功: ${this.projects.size} 个项目, ${this.accounts.size} 个账户`)
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    }
  }

  /**
   * 保存配置
   */
  private async saveConfiguration(): Promise<void> {
    try {
      const fs = require('fs')
      const path = require('path')
      
      // 确保目录存在
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data = {
        projects: Array.from(this.projects.values()),
        accounts: Array.from(this.accounts.values()),
        savedAt: new Date()
      }

      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2))
      console.log('配置保存成功')
    } catch (error) {
      console.error('保存配置失败:', error)
      throw error
    }
  }
}