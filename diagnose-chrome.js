/**
 * Chrome 安装诊断工具
 * 用于检查 Chrome 是否正确安装以及路径是否可访问
 */

const { existsSync } = require('fs')
const { join } = require('path')
const { homedir, platform } = require('os')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

async function diagnoseChrome() {
  console.log('='.repeat(60))
  console.log('Chrome 安装诊断工具')
  console.log('='.repeat(60))
  console.log()

  const currentPlatform = platform()
  console.log('✓ 操作系统:', currentPlatform)
  console.log('✓ 用户目录:', homedir())
  console.log()

  // 检查常见路径
  console.log('检查常见安装路径:')
  console.log('-'.repeat(60))

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

  const paths = commonPaths[currentPlatform] || []
  let foundPath = null

  for (const path of paths) {
    if (path && existsSync(path)) {
      console.log(`✓ 找到: ${path}`)
      if (!foundPath) foundPath = path
    } else {
      console.log(`✗ 不存在: ${path}`)
    }
  }
  console.log()

  // 尝试命令行查找
  console.log('尝试通过命令行查找:')
  console.log('-'.repeat(60))

  try {
    let command
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

    console.log(`执行命令: ${command}`)
    const { stdout, stderr } = await execAsync(command)

    if (stdout) {
      const paths = stdout.trim().split('\n')
      console.log(`✓ 找到 ${paths.length} 个结果:`)
      paths.forEach(p => console.log(`  - ${p}`))
      if (!foundPath) foundPath = paths[0]
    }

    if (stderr) {
      console.log('⚠ 警告:', stderr)
    }
  } catch (error) {
    console.log('✗ 命令执行失败:', error.message)
  }
  console.log()

  // Windows 注册表查找
  if (currentPlatform === 'win32') {
    console.log('尝试通过注册表查找:')
    console.log('-'.repeat(60))

    try {
      const { stdout } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve')
      const match = stdout.match(/REG_SZ\s+(.+)/i)

      if (match && match[1]) {
        const chromePath = match[1].trim()
        console.log(`✓ 注册表路径: ${chromePath}`)

        if (existsSync(chromePath)) {
          console.log('✓ 路径有效')
          if (!foundPath) foundPath = chromePath
        } else {
          console.log('✗ 路径无效（文件不存在）')
        }
      }
    } catch (error) {
      console.log('✗ 注册表查询失败:', error.message)
    }
    console.log()
  }

  // 检查用户数据目录
  console.log('检查 Chrome 用户数据目录:')
  console.log('-'.repeat(60))

  let userDataDir
  switch (currentPlatform) {
    case 'win32':
      userDataDir = join(homedir(), 'AppData\\Local\\Google\\Chrome\\User Data')
      break
    case 'darwin':
      userDataDir = join(homedir(), 'Library/Application Support/Google/Chrome')
      break
    case 'linux':
      userDataDir = join(homedir(), '.config/google-chrome')
      break
  }

  if (userDataDir) {
    console.log(`路径: ${userDataDir}`)
    if (existsSync(userDataDir)) {
      console.log('✓ 目录存在')

      // 检查 Profiles
      try {
        const fs = require('fs')
        const entries = fs.readdirSync(userDataDir, { withFileTypes: true })
        const profiles = entries.filter(e =>
          e.isDirectory() && (e.name.startsWith('Profile') || e.name === 'Default')
        )

        console.log(`✓ 找到 ${profiles.length} 个 Profile:`)
        profiles.forEach(p => console.log(`  - ${p.name}`))
      } catch (error) {
        console.log('⚠ 无法读取 Profiles:', error.message)
      }
    } else {
      console.log('✗ 目录不存在')
    }
  }
  console.log()

  // 环境变量
  console.log('环境变量:')
  console.log('-'.repeat(60))
  console.log('LOCALAPPDATA:', process.env.LOCALAPPDATA || '(未设置)')
  console.log('PROGRAMFILES:', process.env.PROGRAMFILES || '(未设置)')
  console.log('PROGRAMFILES(X86):', process.env['PROGRAMFILES(X86)'] || '(未设置)')
  console.log()

  // 总结
  console.log('='.repeat(60))
  console.log('诊断结果:')
  console.log('='.repeat(60))

  if (foundPath) {
    console.log('✓ Chrome 已安装')
    console.log(`✓ 路径: ${foundPath}`)
    console.log()
    console.log('建议: 应用应该能够正常打开 Chrome')
  } else {
    console.log('✗ 未找到 Chrome 安装')
    console.log()
    console.log('建议:')
    console.log('1. 请确保已安装 Google Chrome')
    console.log('2. 下载地址: https://www.google.com/chrome/')
    console.log('3. 安装后重新运行此诊断工具')
  }
  console.log('='.repeat(60))
}

diagnoseChrome().catch(error => {
  console.error('诊断过程出错:', error)
  process.exit(1)
})
