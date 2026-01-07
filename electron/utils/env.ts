/**
 * 环境工具函数
 * 用于判断当前运行环境
 */

import { app } from 'electron'

export const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

export const isProduction = !isDev

export const isTest = process.env.NODE_ENV === 'test'

export const platform = process.platform

export const isWindows = platform === 'win32'
export const isMacOS = platform === 'darwin'
export const isLinux = platform === 'linux'