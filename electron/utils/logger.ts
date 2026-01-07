/**
 * 日志工具
 * 将日志同时输出到控制台和文件
 */

import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

class Logger {
  private logFilePath: string
  private isProduction: boolean

  constructor() {
    this.isProduction = app.isPackaged
    
    // 日志文件路径
    const logDir = join(app.getPath('userData'), 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    
    const date = new Date().toISOString().split('T')[0]
    this.logFilePath = join(logDir, `app-${date}.log`)
    
    this.log('info', '='.repeat(60))
    this.log('info', `Application started at ${new Date().toISOString()}`)
    this.log('info', `Version: ${app.getVersion()}`)
    this.log('info', `Platform: ${process.platform}`)
    this.log('info', `Log file: ${this.logFilePath}`)
    this.log('info', '='.repeat(60))
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString()
    const argsStr = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : ''
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${argsStr}`
  }

  private writeToFile(message: string): void {
    try {
      appendFileSync(this.logFilePath, message + '\n', 'utf8')
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]): void {
    const formattedMessage = this.formatMessage(level, message, ...args)
    
    // 始终写入文件
    this.writeToFile(formattedMessage)
    
    // 始终输出到控制台
    switch (level) {
      case 'error':
        console.error(formattedMessage)
        break
      case 'warn':
        console.warn(formattedMessage)
        break
      case 'debug':
        console.debug(formattedMessage)
        break
      default:
        console.log(formattedMessage)
    }
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args)
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args)
  }

  getLogFilePath(): string {
    return this.logFilePath
  }
}

// 导出单例
export const logger = new Logger()
