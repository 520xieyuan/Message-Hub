/**
 * OAuth回调服务器
 * 处理Gmail、Slack等平台的OAuth回调，并通过WebSocket推送给Electron客户端
 */

require('dotenv').config()

const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const axios = require('axios')
const { getConnection, testConnection } = require('./database')

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件服务
app.use('/admin', express.static('public'))

// 存储活跃的客户端连接
const activeClients = new Map()
// 存储待处理的OAuth会话
const pendingSessions = new Map()
// 存储已处理的会话（防止重复处理）
const processedSessions = new Map()

// 测试 MariaDB 连接
testConnection()

// 配置
const CONFIG = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  SESSION_TIMEOUT: 10 * 60 * 1000, // 10分钟
}

// OAuth平台固定配置
const OAUTH_CONFIGS = {
  gmail: {
    auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    // 添加 userinfo.email 和 userinfo.profile 权限以获取用户信息
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
  },
  slack: {
    auth_url: 'https://slack.com/oauth/v2/authorize',
    token_url: 'https://slack.com/api/oauth.v2.access',
    scope: 'search:read'
  },
  lark: {
    auth_url: 'https://open.larksuite.com/open-apis/authen/v1/index',
    token_url: 'https://open.larksuite.com/open-apis/authen/v1/access_token',
    scope: 'im:message'
  }
}

// 工具函数：生成用户标识符
function generateUserIdentifier(platform, userInfo) {
  switch (platform) {
    case 'gmail':
      return userInfo.email
    case 'slack':
      return `${userInfo.user_id}@${userInfo.team_id}`
    case 'lark':
      return `${userInfo.open_id}@${userInfo.app_id}`
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

// WebSocket连接处理
io.on('connection', (socket) => {
  console.log(`客户端连接: ${socket.id}`)

  // 客户端注册
  socket.on('register', (data) => {
    const { clientId, appVersion } = data
    activeClients.set(socket.id, {
      clientId: clientId || socket.id,
      appVersion,
      connectedAt: new Date(),
      socket
    })

    console.log(`✅ [WebSocket] Client registered: ${clientId || socket.id}`)
    console.log(`📊 [WebSocket] Socket ID: ${socket.id}`)
    console.log(`📊 [WebSocket] Total active clients: ${activeClients.size}`)
    console.log(`📊 [WebSocket] Server base URL: ${getServerBaseUrl()}`)
    
    socket.emit('registered', {
      success: true,
      clientId: clientId || socket.id,
      serverId: socket.id,
      serverUrl: getServerBaseUrl()
    })
  })

  // 开始OAuth流程
  socket.on('start-oauth', async (data) => {
    const { platform, sessionId, oauthAppId, displayName, description, clientId } = data

    console.log('🔍 [Server] Received start-oauth:', { platform, sessionId, oauthAppId, displayName, description, clientId })
    console.log('🔍 [Server] Client socket ID:', socket.id)
    console.log('🔍 [Server] Active clients:', activeClients.size)
    console.log('🔍 [Server] Pending sessions before:', pendingSessions.size)

    if (!OAUTH_CONFIGS[platform]) {
      socket.emit('oauth-error', {
        error: 'unsupported_platform',
        message: `不支持的平台: ${platform}`
      })
      return
    }

    try {
      // 创建OAuth会话
      const oauthSession = {
        sessionId: sessionId || uuidv4(),
        platform,
        oauthAppId, // 保存指定的 OAuth 应用 ID
        displayName, // 保存用户自定义显示名称
        description, // 保存用户自定义描述
        clientId, // 保存客户端 ID（用于多设备隔离）
        clientSocketId: socket.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + CONFIG.SESSION_TIMEOUT)
      }

      pendingSessions.set(oauthSession.sessionId, oauthSession)

      console.log(`✅ [OAuth Session] Created session: ${oauthSession.sessionId} for ${platform}${oauthAppId ? ` (app: ${oauthAppId})` : ''}`)
      console.log(`✅ [OAuth Session] Client socket ID: ${oauthSession.clientSocketId}`)
      console.log(`📊 [OAuth Session] Total pending sessions: ${pendingSessions.size}`)
      console.log(`📊 [OAuth Session] Session expires at: ${oauthSession.expiresAt}`)
      console.log(`📊 [OAuth Session] All session IDs:`, Array.from(pendingSessions.keys()))

      // 构造OAuth URL
      const authUrl = await buildOAuthUrl(platform, oauthSession.sessionId, oauthAppId)

      console.log(`📤 [OAuth Session] Sending oauth-url to client`)
      
      socket.emit('oauth-url', {
        sessionId: oauthSession.sessionId,
        platform,
        authUrl
      })
      
      console.log(`✅ [OAuth Session] oauth-url sent successfully`)
    } catch (error) {
      console.error('❌ [OAuth Session] Failed to create session:', error)
      socket.emit('oauth-error', {
        error: 'config_error',
        message: error.message
      })
    }
  })

  // 客户端断开连接
  socket.on('disconnect', () => {
    console.log(`客户端断开: ${socket.id}`)
    activeClients.delete(socket.id)
  })
})

// 构造OAuth授权URL
async function buildOAuthUrl(platform, sessionId, oauthAppId) {
  let conn;
  try {
    conn = await getConnection();

    // 从数据库获取OAuth应用配置
    let query, params

    if (oauthAppId) {
      // 如果指定了 OAuth 应用 ID，使用指定的应用
      console.log(`🔍 [buildOAuthUrl] Using specified OAuth app: ${oauthAppId}`)
      query = 'SELECT * FROM oauth_apps WHERE id = ? AND platform = ? AND is_active = 1'
      params = [oauthAppId, platform]
    } else {
      // 否则使用第一个找到的应用（向后兼容）
      console.log(`🔍 [buildOAuthUrl] No OAuth app specified, using first available`)
      query = 'SELECT * FROM oauth_apps WHERE platform = ? AND is_active = 1 LIMIT 1'
      params = [platform]
    }

    const rows = await conn.query(query, params);
    const app = rows[0];

    if (app) {
      console.log(`🔍 [buildOAuthUrl] Selected app: ${app.name || '(unnamed)'} - ${app.client_id}`)
    }

    if (!app) {
      throw new Error(`未找到${platform}平台的OAuth配置`);
    }

    const config = OAUTH_CONFIGS[platform]
    if (!config) {
      throw new Error(`不支持的平台: ${platform}`);
    }

    const urlParams = new URLSearchParams({
      client_id: app.client_id,
      redirect_uri: app.redirect_uri,
      state: sessionId,
      response_type: 'code'
    })

    // 平台特定参数
    if (platform === 'gmail') {
      urlParams.append('scope', config.scope)
      urlParams.append('access_type', 'offline')
      urlParams.append('prompt', 'consent')  // 强制显示授权页面，确保获取refresh_token
    } else if (platform === 'slack') {
      // Slack需要同时请求bot token和user token
      // Bot token scopes: users:read, channels:read, groups:read, im:read, mpim:read
      urlParams.append('scope', 'users:read,channels:read,groups:read,im:read,mpim:read')
      // User token scope: search:read
      urlParams.append('user_scope', config.scope)
    } else {
      urlParams.append('scope', config.scope)
    }

    const authUrl = `${config.auth_url}?${urlParams.toString()}`
    return authUrl;
  } finally {
    if (conn) conn.release();
  }
}

// 获取服务器基础URL
function getServerBaseUrl() {
  // 在局域网测试中，使用服务器的局域网IP
  const networkInterfaces = require('os').networkInterfaces()
  let localIP = 'localhost'

  // 查找局域网IP
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName]
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
        localIP = iface.address
        break
      }
    }
  }

  return `http://${localIP}:${CONFIG.PORT}`
}

// 通用OAuth回调处理 - 支持所有平台
app.get('/oauth/callback/:platform', async (req, res) => {
  console.log('🔔 [Route] OAuth callback route hit!')
  console.log('🔔 [Route] Full URL:', req.originalUrl)
  console.log('🔔 [Route] Platform param:', req.params.platform)
  const { platform } = req.params
  await handleOAuthCallback(platform, req, res)
})

// 添加一个简单的测试路由来验证路由是否工作
app.get('/oauth/test', (req, res) => {
  console.log('🔔 [Route] Test route hit!')
  res.json({ status: 'ok', message: 'OAuth routes are working' })
})

// OAuth回调处理函数
async function handleOAuthCallback(platform, req, res) {
  const { code, state, error } = req.query

  console.log(`🔙 [OAuth Callback] Platform: ${platform}, State: ${state}, Error: ${error}`)
  console.log(`🔙 [OAuth Callback] Current pending sessions count: ${pendingSessions.size}`)
  console.log(`🔙 [OAuth Callback] Active clients count: ${activeClients.size}`)

  try {
    // 检查是否有错误
    if (error) {
      await handleOAuthError(state, error, req.query.error_description)
      return res.send(getErrorPage(error, req.query.error_description))
    }

    // 检查是否已经处理过这个会话（防止重复回调）
    if (processedSessions.has(state)) {
      console.log(`ℹ️  [OAuth Callback] Session already processed: ${state}`)
      console.log(`ℹ️  [OAuth Callback] This is likely a duplicate callback, returning success page`)
      return res.send(getSuccessPage(platform))
    }

    // 验证state参数
    const session = pendingSessions.get(state)
    if (!session) {
      console.error(`❌ [OAuth Callback] Invalid session: ${state}`)
      console.error(`❌ [OAuth Callback] Available sessions:`, Array.from(pendingSessions.keys()))
      console.error(`❌ [OAuth Callback] Processed sessions:`, Array.from(processedSessions.keys()))
      return res.status(400).send(getErrorPage('invalid_session', '无效的OAuth会话'))
    }
    
    console.log(`✅ [OAuth Callback] Session found:`, {
      sessionId: session.sessionId,
      platform: session.platform,
      clientSocketId: session.clientSocketId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    })

    // 检查会话是否过期
    if (new Date() > session.expiresAt) {
      pendingSessions.delete(state)
      console.error(`OAuth会话已过期: ${state}`)
      return res.status(400).send(getErrorPage('session_expired', 'OAuth会话已过期'))
    }

    // 验证平台匹配
    if (session.platform !== platform) {
      console.error(`平台不匹配: expected ${session.platform}, got ${platform}`)
      return res.status(400).send(getErrorPage('platform_mismatch', '平台不匹配'))
    }

    // 交换授权码获取访问令牌
    const tokens = await exchangeCodeForTokens(platform, code, session)

    // 通过WebSocket发送结果给客户端
    const client = activeClients.get(session.clientSocketId)
    if (client) {
      console.log(`✅ [OAuth Callback] Sending oauth-success to client: ${session.clientSocketId}`)
      client.socket.emit('oauth-success', {
        sessionId: state,
        platform,
        tokens,
        timestamp: new Date().toISOString()
      })
      console.log(`✅ [OAuth Callback] OAuth success notification sent`)
    } else {
      console.error(`❌ [OAuth Callback] Client connection not found: ${session.clientSocketId}`)
      console.error(`❌ [OAuth Callback] Available clients:`, Array.from(activeClients.keys()))
      console.error(`❌ [OAuth Callback] This usually means:`)
      console.error(`   1. Client disconnected before OAuth callback`)
      console.error(`   2. Client reconnected with different socket ID`)
      console.error(`   3. OAuth Server was restarted`)
      
      // 即使客户端连接不存在，令牌已经保存到数据库，用户可以稍后刷新
      console.log(`ℹ️  [OAuth Callback] Token saved to database, user can refresh to see it`)
    }

    // ✅ 广播 tokens-changed 事件给所有连接的客户端
    broadcastTokensChanged(session.clientId || 'unknown')

    // 清理会话并标记为已处理
    pendingSessions.delete(state)
    processedSessions.set(state, {
      platform,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000) // 1分钟后过期
    })
    console.log(`🧹 [OAuth Callback] Session cleaned up, remaining sessions: ${pendingSessions.size}`)

    // 返回成功页面
    res.send(getSuccessPage(platform))

  } catch (error) {
    console.error('OAuth回调处理失败:', error)
    await handleOAuthError(state, 'server_error', error.message)
    res.status(500).send(getErrorPage('server_error', '服务器内部错误'))
  }
}

// 交换授权码获取访问令牌
async function exchangeCodeForTokens(platform, code, session) {
  let conn;
  try {
    conn = await getConnection();

    // 从数据库获取OAuth应用配置
    let query, params
    const oauthAppId = session.oauthAppId

    if (oauthAppId) {
      // 如果指定了 OAuth 应用 ID，使用指定的应用
      query = 'SELECT * FROM oauth_apps WHERE id = ? AND platform = ? AND is_active = 1'
      params = [oauthAppId, platform]
    } else {
      // 否则使用第一个找到的应用（向后兼容）
      query = 'SELECT * FROM oauth_apps WHERE platform = ? AND is_active = 1 LIMIT 1'
      params = [platform]
    }

    const rows = await conn.query(query, params);
    const app = rows[0];

    if (!app) {
      throw new Error(`未找到${platform}平台的OAuth配置`);
    }

    const config = OAUTH_CONFIGS[platform]
    const tokenData = {
      client_id: app.client_id,
      client_secret: app.client_secret,
      code,
      redirect_uri: app.redirect_uri
    }

    if (platform === 'gmail') {
      tokenData.grant_type = 'authorization_code'
    }

    let accessToken, refreshToken, expiresIn, tokenType, scope

    // Lark 需要特殊处理：先获取 app_access_token，再换取 user_access_token
    if (platform === 'lark') {
      console.log('🔍 [OAuth Server] Lark token exchange - Step 1: Get app_access_token')

      // Step 1: 获取 app_access_token
      const appTokenResponse = await axios.post('https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal', {
        app_id: app.client_id,
        app_secret: app.client_secret
      }, {
        headers: { 'Content-Type': 'application/json' }
      })

      console.log('🔍 [OAuth Server] Lark app_access_token response:', {
        code: appTokenResponse.data.code,
        msg: appTokenResponse.data.msg,
        hasAppAccessToken: !!appTokenResponse.data.app_access_token
      })

      if (appTokenResponse.data.code !== 0) {
        throw new Error(`Failed to get Lark app_access_token: ${appTokenResponse.data.msg}`)
      }

      const appAccessToken = appTokenResponse.data.app_access_token

      // Step 2: 用授权码换取 user_access_token
      console.log('🔍 [OAuth Server] Lark token exchange - Step 2: Get user_access_token')

      const userTokenResponse = await axios.post('https://open.larksuite.com/open-apis/authen/v1/oidc/access_token', {
        grant_type: 'authorization_code',
        code: code
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appAccessToken}`
        }
      })

      console.log('🔍 [OAuth Server] Lark user_access_token response:', {
        code: userTokenResponse.data.code,
        msg: userTokenResponse.data.msg,
        hasData: !!userTokenResponse.data.data,
        hasAccessToken: !!userTokenResponse.data.data?.access_token
      })

      if (userTokenResponse.data.code !== 0) {
        throw new Error(`Failed to get Lark user_access_token: ${userTokenResponse.data.msg}`)
      }

      const larkData = userTokenResponse.data.data
      accessToken = larkData.access_token
      refreshToken = larkData.refresh_token
      expiresIn = larkData.expires_in
      tokenType = larkData.token_type
      scope = larkData.scope

      console.log('✅ [OAuth Server] Lark token exchange successful:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresIn: expiresIn
      })
    } else {
      // Gmail 和 Slack 使用标准 OAuth 流程
      const response = await axios.post(config.token_url, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      console.log(`${platform} token exchange successful`)

      accessToken = response.data.access_token
      refreshToken = response.data.refresh_token
      expiresIn = response.data.expires_in
      tokenType = response.data.token_type
      scope = response.data.scope

      if (platform === 'slack') {
        // Slack OAuth v2 返回两种 token:
        // - access_token (xoxb-): Bot Token
        // - authed_user.access_token (xoxp-): User Token
        // 搜索功能需要 User Token (xoxp-)
        console.log('🔍 [OAuth Server] Slack OAuth response structure:', {
          hasAccessToken: !!response.data.access_token,
          hasAuthedUser: !!response.data.authed_user,
          hasUserToken: !!response.data.authed_user?.access_token,
          accessTokenPrefix: response.data.access_token?.substring(0, 5),
          userTokenPrefix: response.data.authed_user?.access_token?.substring(0, 5)
        })

        if (response.data.authed_user?.access_token) {
          // 使用 User Token (xoxp-) 作为主要 access_token
          accessToken = response.data.authed_user.access_token
          console.log('✅ [OAuth Server] Using Slack User Token (xoxp-) for search functionality')
        } else {
          console.warn('⚠️  [OAuth Server] No User Token found in Slack response, using Bot Token (may not work for search)')
        }
      }
    }

    // 检查是否有refresh_token
    if (!refreshToken) {
      console.warn(`⚠️  [OAuth Server] No refresh_token received for ${platform}`)
      console.warn(`⚠️  [OAuth Server] This usually means the user has already authorized this app`)
      console.warn(`⚠️  [OAuth Server] To get a new refresh_token, revoke access at:`)
      if (platform === 'gmail') {
        console.warn(`⚠️  [OAuth Server] https://myaccount.google.com/permissions`)
      }
    } else {
      console.log(`✅ [OAuth Server] Received refresh_token for ${platform}`)
    }

    // 获取用户信息并保存令牌
    const userInfo = await getUserInfo(platform, accessToken)
    const userIdentifier = generateUserIdentifier(platform, userInfo)

    // 构造标准化的 token 数据
    const normalizedTokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      token_type: tokenType,
      scope: scope
    }

    // 保存到数据库（传递用户自定义的 displayName、description 和 clientId）
    await saveUserToken(app.id, userIdentifier, normalizedTokens, userInfo, session.displayName, session.description, session.clientId)

    return {
      ...normalizedTokens,
      user_info: userInfo,
      user_identifier: userIdentifier
    }
  } catch (error) {
    console.error(`${platform} token exchange failed:`, error.response?.data || error.message)
    throw new Error(`Token exchange failed: ${error.response?.data?.error || error.message}`)
  } finally {
    if (conn) conn.release();
  }
}

// 获取用户信息
async function getUserInfo(platform, accessToken) {
  switch (platform) {
    case 'gmail':
      try {
        const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        return {
          email: response.data.email,
          name: response.data.name,
          picture: response.data.picture
        }
      } catch (error) {
        console.error('获取Gmail用户信息失败:', error)
        return { email: 'unknown@gmail.com', name: 'Unknown User' }
      }

    case 'slack':
      try {
        const response = await axios.get('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        return {
          user_id: response.data.user_id,
          team_id: response.data.team_id,
          user_name: response.data.user,
          team_name: response.data.team
        }
      } catch (error) {
        console.error('获取Slack用户信息失败:', error)
        return { user_id: 'unknown', team_id: 'unknown', user_name: 'Unknown User' }
      }

    case 'lark':
      try {
        // 使用 user_access_token 获取用户信息
        const response = await axios.get('https://open.larksuite.com/open-apis/authen/v1/user_info', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })

        console.log('🔍 [OAuth Server] Lark user info response:', {
          code: response.data.code,
          msg: response.data.msg,
          hasData: !!response.data.data
        })

        if (response.data.code === 0 && response.data.data) {
          const userData = response.data.data
          return {
            open_id: userData.open_id,
            union_id: userData.union_id,
            name: userData.name,
            en_name: userData.en_name,
            avatar_url: userData.avatar_url,
            email: userData.email,
            app_id: userData.tenant_key  // 用于生成 user_identifier
          }
        }
        return { open_id: 'unknown', name: 'Unknown User', app_id: 'unknown' }
      } catch (error) {
        console.error('获取Lark用户信息失败:', error.response?.data || error.message)
        return { open_id: 'unknown', name: 'Unknown User', app_id: 'unknown' }
      }

    default:
      return {}
  }
}

// 保存用户令牌到数据库
async function saveUserToken(oauthAppId, userIdentifier, tokens, userInfo, customDisplayName, customDescription, clientId) {
  let conn;
  try {
    conn = await getConnection();

    const tokenId = uuidv4()
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null

    // 使用用户自定义的 displayName，如果没有则使用 OAuth 返回的信息
    const displayName = customDisplayName || userInfo.name || userInfo.user_name || userInfo.email || 'Unknown'
    const name = userInfo.name || userInfo.user_name || userInfo.given_name || null

    // 如果没有提供 clientId，使用默认值（用于向后兼容）
    const finalClientId = clientId || '00000000-0000-0000-0000-000000000000'

    console.log('💾 [OAuth Server] Saving token with displayName:', displayName, '(custom:', customDisplayName, ')')
    console.log('💾 [OAuth Server] Saving token with clientId:', finalClientId, '(provided:', clientId, ')')

    // 先检查是否已存在（同一个 app + user + client 组合）
    const existing = await conn.query(
      'SELECT id FROM user_tokens WHERE oauth_app_id = ? AND user_identifier = ? AND client_id = ?',
      [oauthAppId, userIdentifier, finalClientId]
    );

    if (existing.length > 0) {
      // 更新现有令牌
      // 重要：只在有新的refresh_token时才更新，否则保留旧的refresh_token
      if (tokens.refresh_token) {
        // 有新的refresh_token，更新所有字段
        console.log('✅ [OAuth Server] Updating token with new refresh_token')
        await conn.query(
          `UPDATE user_tokens SET
           access_token = ?, refresh_token = ?, expires_at = ?,
           user_info = ?, display_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            tokens.access_token,
            tokens.refresh_token,
            expiresAt,
            JSON.stringify(userInfo),
            displayName,
            name,
            existing[0].id
          ]
        );
      } else {
        // 没有新的refresh_token，保留旧的refresh_token
        console.log('⚠️  [OAuth Server] No refresh_token in response, keeping existing refresh_token')
        await conn.query(
          `UPDATE user_tokens SET
           access_token = ?, expires_at = ?,
           user_info = ?, display_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            tokens.access_token,
            expiresAt,
            JSON.stringify(userInfo),
            displayName,
            name,
            existing[0].id
          ]
        );
      }
      return existing[0].id;
    } else {
      // 插入新令牌
      await conn.query(
        `INSERT INTO user_tokens
         (id, oauth_app_id, user_identifier, display_name, name, access_token, refresh_token, expires_at, user_info, client_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tokenId,
          oauthAppId,
          userIdentifier,
          displayName,
          name,
          tokens.access_token,
          tokens.refresh_token || null,
          expiresAt,
          JSON.stringify(userInfo),
          finalClientId
        ]
      );
      return tokenId;
    }
  } finally {
    if (conn) conn.release();
  }
}

// ✅ 广播 tokens 变更事件给所有连接的客户端
function broadcastTokensChanged(triggerClientId) {
  console.log(`📢 [WebSocket] Broadcasting tokens-changed event (triggered by: ${triggerClientId})`)
  console.log(`📢 [WebSocket] Active clients: ${activeClients.size}`)

  let broadcastCount = 0
  activeClients.forEach((client, socketId) => {
    try {
      client.socket.emit('tokens-changed', {
        timestamp: new Date().toISOString(),
        triggerClientId // 告诉客户端是谁触发的变更
      })
      broadcastCount++
    } catch (error) {
      console.error(`❌ [WebSocket] Failed to emit to client ${socketId}:`, error.message)
    }
  })

  console.log(`✅ [WebSocket] tokens-changed event sent to ${broadcastCount} client(s)`)
}

// 处理OAuth错误
async function handleOAuthError(sessionId, error, description) {
  if (!sessionId) return

  const session = pendingSessions.get(sessionId)
  if (session) {
    const client = activeClients.get(session.clientSocketId)
    if (client) {
      client.socket.emit('oauth-error', {
        sessionId,
        error,
        description,
        timestamp: new Date().toISOString()
      })
    }
    pendingSessions.delete(sessionId)
  }
}

// 成功页面HTML
function getSuccessPage(platform) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>授权成功</title>
      <meta charset="utf-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          margin: 0;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 40px;
          border-radius: 10px;
          backdrop-filter: blur(10px);
          max-width: 500px;
          margin: 0 auto;
        }
        .success { color: #4CAF50; font-size: 48px; margin-bottom: 20px; }
        h1 { margin: 20px 0; }
        p { font-size: 18px; line-height: 1.6; margin: 10px 0; }
        .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success">✅</div>
        <h1>${platform.toUpperCase()} 授权成功</h1>
        <p>您已成功授权访问 ${platform} 账户。</p>
        <p>账户信息已保存，请返回应用查看。</p>
        <p class="note">如果应用中没有自动显示新账户，请手动刷新账户列表。</p>
        <p><small>此窗口将在 <span id="countdown">5</span> 秒后自动关闭</small></p>
      </div>
      <script>
        let seconds = 5;
        const countdownElement = document.getElementById('countdown');
        
        const interval = setInterval(() => {
          seconds--;
          if (countdownElement) {
            countdownElement.textContent = seconds;
          }
          if (seconds <= 0) {
            clearInterval(interval);
            // 尝试关闭窗口
            window.close();
            
            // 如果窗口无法关闭（浏览器安全限制），显示提示
            setTimeout(() => {
              // 检查窗口是否还在
              if (!window.closed) {
                document.querySelector('.container').innerHTML = \`
                  <div class="success">✅</div>
                  <h1>授权完成</h1>
                  <p>授权已成功完成！账户信息已保存。</p>
                  <p>请返回应用并刷新账户列表查看新账户。</p>
                  <p>您可以安全地关闭此窗口了。</p>
                  <p><button onclick="window.close()" style="
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    margin-top: 20px;
                  ">关闭窗口</button></p>
                \`;
              }
            }, 100);
          }
        }, 1000);
      </script>
    </body>
    </html>
  `
}

// 错误页面HTML
function getErrorPage(error, description) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>授权失败</title>
      <meta charset="utf-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px;
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          color: white;
          margin: 0;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 40px;
          border-radius: 10px;
          backdrop-filter: blur(10px);
          max-width: 500px;
          margin: 0 auto;
        }
        .error { color: #ff4757; font-size: 48px; margin-bottom: 20px; }
        h1 { margin: 20px 0; }
        p { font-size: 18px; line-height: 1.6; }
        .error-code { 
          background: rgba(0,0,0,0.2); 
          padding: 10px; 
          border-radius: 5px; 
          font-family: monospace; 
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error">❌</div>
        <h1>授权失败</h1>
        <p>很抱歉，授权过程中出现了错误。</p>
        ${description ? `<p>${description}</p>` : ''}
        <div class="error-code">错误代码: ${error}</div>
        <p>请关闭此窗口并返回应用重试。</p>
      </div>
    </body>
    </html>
  `
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    clients: activeClients.size,
    sessions: pendingSessions.size,
    uptime: process.uptime()
  })
})

// 管理界面重定向
app.get('/', (req, res) => {
  res.redirect('/admin/admin.html')
})

// 获取服务器信息
app.get('/info', (req, res) => {
  res.json({
    name: 'OAuth Callback Server',
    version: '1.0.0',
    baseUrl: getServerBaseUrl(),
    supportedPlatforms: Object.keys(OAUTH_CONFIGS),
    clients: activeClients.size,
    sessions: pendingSessions.size
  })
})

// ==================== API 端点 ====================

// 创建OAuth应用配置
app.post('/api/oauth-apps', async (req, res) => {
  const { platform, name, client_id, client_secret, redirect_uri } = req.body

  if (!platform || !client_id || !client_secret || !redirect_uri) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  if (!OAUTH_CONFIGS[platform]) {
    return res.status(400).json({ error: `不支持的平台: ${platform}` })
  }

  const appId = uuidv4()

  let conn
  try {
    conn = await getConnection()
    await conn.query(
      'INSERT INTO oauth_apps (id, platform, name, client_id, client_secret, redirect_uri) VALUES (?, ?, ?, ?, ?, ?)',
      [appId, platform, name || null, client_id, client_secret, redirect_uri]
    )

    res.json({
      id: appId,
      platform,
      client_id,
      redirect_uri,
      message: 'OAuth应用创建成功'
    })
  } catch (err) {
    console.error('创建OAuth应用失败:', err)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 获取OAuth应用列表
app.get('/api/oauth-apps', async (req, res) => {
  const { platform } = req.query

  console.log('🔍 [OAuth Server] GET /api/oauth-apps')
  console.log('  platform filter:', platform || 'none')

  let query = 'SELECT id, platform, name, client_id, client_secret, redirect_uri, is_active, created_at FROM oauth_apps WHERE is_active = 1'
  let params = []

  if (platform) {
    query += ' AND platform = ?'
    params.push(platform)
  }

  let conn
  try {
    conn = await getConnection()

    console.log('📋 [OAuth Server] SQL Query:', query)
    console.log('📋 [OAuth Server] SQL Params:', params)

    const startTime = Date.now()
    const rows = await conn.query(query, params)
    const queryTime = Date.now() - startTime

    console.log(`⏱️  [OAuth Server] SQL query executed in ${queryTime}ms`)
    console.log('📦 [OAuth Server] Found', rows.length, 'OAuth apps')

    if (rows.length > 0) {
      console.log('📦 [OAuth Server] OAuth apps:', rows.map(r => ({
        id: r.id,
        platform: r.platform,
        name: r.name,
        client_id_preview: r.client_id?.substring(0, 20) + '...',
        has_client_secret: !!r.client_secret
      })))
    }

    res.json(rows)
  } catch (err) {
    console.error('❌ [OAuth Server] Database error:', err)
    console.error('❌ [OAuth Server] Error stack:', err.stack)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 获取所有用户令牌
app.get('/api/tokens', async (req, res) => {
  const { platform, client_id } = req.query

  console.log('🔍 [OAuth Server] GET /api/tokens')
  console.log('  platform filter:', platform || 'none')
  console.log('  client_id filter:', client_id || 'none')

  let query = `
    SELECT ut.*, oa.platform, oa.client_id as app_client_id, oa.name as app_name
    FROM user_tokens ut
    JOIN oauth_apps oa ON ut.oauth_app_id = oa.id
    WHERE ut.is_active = 1
  `
  let params = []

  if (platform) {
    query += ' AND oa.platform = ?'
    params.push(platform)
  }

  if (client_id) {
    query += ' AND ut.client_id = ?'
    params.push(client_id)
  }

  query += ' ORDER BY ut.created_at DESC'

  console.log('📋 [OAuth Server] SQL Query:', query.replace(/\s+/g, ' ').trim())
  console.log('📋 [OAuth Server] SQL Params:', params)

  let conn
  try {
    conn = await getConnection()

    const startTime = Date.now()
    const rows = await conn.query(query, params)
    const queryTime = Date.now() - startTime

    console.log(`⏱️  [OAuth Server] SQL query executed in ${queryTime}ms`)
    console.log('📦 [OAuth Server] Query results count:', rows.length)

    if (rows.length > 0) {
      console.log('📦 [OAuth Server] Platforms:', rows.map(r => r.platform).join(', '))
      console.log('📦 [OAuth Server] User identifiers:', rows.map(r => r.user_identifier).join(', '))
    }

    // 不返回敏感信息
    const safeRows = rows.map(row => ({
      id: row.id,
      platform: row.platform,
      user_identifier: row.user_identifier,
      display_name: row.display_name,
      name: row.name,
      app_name: row.app_name,
      expires_at: row.expires_at,
      user_info: row.user_info,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    res.json(safeRows)
  } catch (err) {
    console.error('❌ [OAuth Server] Database error:', err)
    console.error('❌ [OAuth Server] Error stack:', err.stack)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 获取用户令牌（按标识符）
app.get('/api/tokens/:identifier', async (req, res) => {
  const { identifier } = req.params
  const { platform, client_id } = req.query

  console.log('🔍 [OAuth Server] GET /api/tokens/:identifier')
  console.log('  identifier:', identifier)
  console.log('  platform filter:', platform || 'none')
  console.log('  client_id filter:', client_id || 'none')

  let query = `
    SELECT ut.*, oa.platform, oa.client_id as app_client_id
    FROM user_tokens ut
    JOIN oauth_apps oa ON ut.oauth_app_id = oa.id
    WHERE ut.user_identifier = ? AND ut.is_active = 1
  `
  let params = [identifier]

  if (platform) {
    query += ' AND oa.platform = ?'
    params.push(platform)
  }

  if (client_id) {
    query += ' AND ut.client_id = ?'
    params.push(client_id)
  }

  let conn
  try {
    conn = await getConnection()
    const rows = await conn.query(query, params)

    // 不返回敏感信息
    const safeRows = rows.map(row => ({
      id: row.id,
      platform: row.platform,
      user_identifier: row.user_identifier,
      display_name: row.display_name,
      name: row.name,
      expires_at: row.expires_at,
      user_info: row.user_info,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    res.json(safeRows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 手动添加或更新用户令牌
// 支持两种模式：
// 1. 提供 oauth_app_id - 用于创建新令牌
// 2. 提供 user_identifier + client_id - 用于更新现有令牌（token refresh）
app.post('/api/tokens', async (req, res) => {
  const { oauth_app_id, user_identifier, display_name, name, access_token, refresh_token, expires_at, user_info, client_id } = req.body

  if (!user_identifier || !access_token) {
    return res.status(400).json({ error: '缺少必要参数: user_identifier, access_token' })
  }

  const tokenId = uuidv4()
  const expiresAtISO = expires_at ? new Date(expires_at).toISOString() : null

  let conn
  try {
    conn = await getConnection()

    // 模式 1: 提供了 oauth_app_id，用于创建新令牌
    if (oauth_app_id) {
      console.log('📝 [OAuth Server] Creating/updating token with oauth_app_id:', oauth_app_id)

      // 先检查OAuth应用是否存在
      const apps = await conn.query('SELECT id FROM oauth_apps WHERE id = ? AND is_active = 1', [oauth_app_id])

      if (apps.length === 0) {
        return res.status(404).json({ error: 'OAuth应用不存在' })
      }

      // 检查是否已存在相同的令牌
      const existing = await conn.query(
        'SELECT id FROM user_tokens WHERE oauth_app_id = ? AND user_identifier = ? AND is_active = 1',
        [oauth_app_id, user_identifier]
      )

      if (existing.length > 0) {
        // 更新现有令牌
        let updateQuery, updateParams

        if (refresh_token) {
          updateQuery = `UPDATE user_tokens SET
           access_token = ?, refresh_token = ?, expires_at = ?,
           user_info = ?, display_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
          updateParams = [
            access_token,
            refresh_token,
            expiresAtISO,
            user_info ? JSON.stringify(user_info) : null,
            display_name || null,
            name || null,
            existing[0].id
          ]
        } else {
          updateQuery = `UPDATE user_tokens SET
           access_token = ?, expires_at = ?,
           user_info = ?, display_name = ?, name = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
          updateParams = [
            access_token,
            expiresAtISO,
            user_info ? JSON.stringify(user_info) : null,
            display_name || null,
            name || null,
            existing[0].id
          ]
        }

        await conn.query(updateQuery, updateParams)
        console.log('✅ [OAuth Server] Token updated successfully')

        // ✅ 广播 tokens-changed 事件
        broadcastTokensChanged('token-update')

        res.json({ id: existing[0].id, message: '用户令牌更新成功' })
      } else {
        // 插入新令牌
        await conn.query(
          `INSERT INTO user_tokens
           (id, oauth_app_id, user_identifier, display_name, name, access_token, refresh_token, expires_at, user_info)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tokenId,
            oauth_app_id,
            user_identifier,
            display_name || null,
            name || null,
            access_token,
            refresh_token || null,
            expiresAtISO,
            user_info ? JSON.stringify(user_info) : null
          ]
        )
        console.log('✅ [OAuth Server] Token created successfully')

        // ✅ 广播 tokens-changed 事件
        broadcastTokensChanged('token-create')

        res.json({ id: tokenId, message: '用户令牌创建成功' })
      }
    }
    // 模式 2: 提供了 user_identifier + client_id，用于更新现有令牌（token refresh）
    else if (client_id) {
      console.log('🔄 [OAuth Server] Updating token by user_identifier + client_id')
      console.log('  user_identifier:', user_identifier)
      console.log('  client_id:', client_id)

      // 查找现有令牌
      const existing = await conn.query(
        'SELECT id FROM user_tokens WHERE user_identifier = ? AND client_id = ? AND is_active = 1',
        [user_identifier, client_id]
      )

      if (existing.length === 0) {
        console.warn('⚠️  [OAuth Server] No existing token found for user_identifier + client_id')
        return res.status(404).json({ error: '未找到对应的令牌记录' })
      }

      console.log('✅ [OAuth Server] Found existing token, updating...')

      // 更新现有令牌
      let updateQuery, updateParams

      if (refresh_token) {
        // 有新的refresh_token，更新所有字段
        updateQuery = `UPDATE user_tokens SET
         access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
        updateParams = [
          access_token,
          refresh_token,
          expiresAtISO,
          existing[0].id
        ]
      } else {
        // 没有新的refresh_token，保留旧的refresh_token
        updateQuery = `UPDATE user_tokens SET
         access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
        updateParams = [
          access_token,
          expiresAtISO,
          existing[0].id
        ]
      }

      await conn.query(updateQuery, updateParams)
      console.log('✅ [OAuth Server] Token updated successfully by refresh')

      // ✅ 广播 tokens-changed 事件
      broadcastTokensChanged('token-refresh-by-client-id')

      res.json({ id: existing[0].id, message: '用户令牌刷新成功' })
    } else {
      return res.status(400).json({ error: '必须提供 oauth_app_id 或 client_id' })
    }
  } catch (err) {
    console.error('❌ [OAuth Server] Error updating token:', err)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 获取用户令牌（包含访问令牌，需要认证）
app.get('/api/tokens/:identifier/full', async (req, res) => {
  const { identifier } = req.params
  const { platform, client_id } = req.query

  console.log('🔍 [OAuth Server] GET /api/tokens/:identifier/full')
  console.log('  identifier:', identifier)
  console.log('  platform:', platform)
  console.log('  client_id (Electron client):', client_id)

  if (!client_id) {
    return res.status(400).json({ error: '缺少 client_id 参数' })
  }

  let conn;
  try {
    conn = await getConnection();

    // 修复: client_id 是 Electron 客户端的 ID (存储在 ut.client_id)
    // 而不是 OAuth app 的 client_id (存储在 oa.client_id)
    let query = `
      SELECT ut.*, oa.platform, oa.name as app_name, oa.client_id as app_client_id, oa.client_secret as app_client_secret
      FROM user_tokens ut
      JOIN oauth_apps oa ON ut.oauth_app_id = oa.id
      WHERE ut.user_identifier = ?
        AND ut.is_active = 1
        AND oa.is_active = 1
        AND ut.client_id = ?
    `
    let params = [identifier, client_id]

    if (platform) {
      query += ' AND oa.platform = ?'
      params.push(platform)
    }

    console.log('📋 [OAuth Server] SQL Query:', query.replace(/\s+/g, ' ').trim())
    console.log('📋 [OAuth Server] SQL Params:', params)
    console.log('🔍 [OAuth Server] Executing SQL query...')

    const startTime = Date.now()
    const rows = await conn.query(query, params);
    const queryTime = Date.now() - startTime

    console.log(`⏱️  [OAuth Server] SQL query executed in ${queryTime}ms`)
    console.log('📦 [OAuth Server] Query results count:', rows.length)

    if (rows.length > 0) {
      console.log('📦 [OAuth Server] Query results:', rows.map(r => ({
        user_identifier: r.user_identifier,
        platform: r.platform,
        app_name: r.app_name,
        app_client_id_preview: r.app_client_id?.substring(0, 20) + '...',
        has_app_client_secret: !!r.app_client_secret,
        has_access_token: !!r.access_token,
        has_refresh_token: !!r.refresh_token,
        access_token_preview: r.access_token?.substring(0, 20) + '...',
        refresh_token_preview: r.refresh_token?.substring(0, 20) + '...',
        expires_at: r.expires_at,
        client_id: r.client_id
      })))
    } else {
      console.warn('⚠️  [OAuth Server] No matching tokens found')
      console.warn('⚠️  [OAuth Server] Debugging - checking all tokens for this user:')

      // 调试查询：查看该 user_identifier 的所有 token 记录
      const debugQuery = `
        SELECT ut.user_identifier, ut.client_id, oa.platform, oa.name as app_name, ut.is_active, oa.is_active as app_is_active
        FROM user_tokens ut
        JOIN oauth_apps oa ON ut.oauth_app_id = oa.id
        WHERE ut.user_identifier = ?
      `
      const debugRows = await conn.query(debugQuery, [identifier])
      console.warn('🔍 [OAuth Server] All tokens for user:', debugRows.map(r => ({
        user_identifier: r.user_identifier,
        client_id: r.client_id,
        platform: r.platform,
        app_name: r.app_name,
        is_active: r.is_active,
        app_is_active: r.app_is_active
      })))
      console.warn('🔍 [OAuth Server] Expected client_id:', client_id)
    }

    res.json(rows)
  } catch (err) {
    console.error('❌ [OAuth Server] Database error:', err)
    console.error('❌ [OAuth Server] Error stack:', err.stack)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release();
  }
})

// 删除OAuth应用
app.delete('/api/oauth-apps/:appId', async (req, res) => {
  const { appId } = req.params

  let conn
  try {
    conn = await getConnection()
    const result = await conn.query(
      'UPDATE oauth_apps SET is_active = 0 WHERE id = ?',
      [appId]
    )

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'OAuth应用不存在' })
    }

    res.json({ message: 'OAuth应用已删除' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 删除用户令牌（物理删除）
app.delete('/api/tokens/:tokenId', async (req, res) => {
  const { tokenId } = req.params

  console.log('🗑️  [OAuth Server] Deleting token (physical delete):', tokenId)

  let conn
  try {
    conn = await getConnection()
    const result = await conn.query(
      'DELETE FROM user_tokens WHERE id = ?',
      [tokenId]
    )

    if (result.affectedRows === 0) {
      console.warn('⚠️  [OAuth Server] Token not found:', tokenId)
      return res.status(404).json({ error: '令牌不存在' })
    }

    console.log('✅ [OAuth Server] Token deleted successfully:', tokenId)

    // ✅ 广播 tokens-changed 事件给所有连接的客户端
    broadcastTokensChanged('token-delete')

    res.json({ message: '令牌已删除' })
  } catch (err) {
    console.error('❌ [OAuth Server] Failed to delete token:', err)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// 获取用户令牌（通过 Token ID 一次性获取完整信息）
// 优化端点：将 4 次请求合并为 1 次
app.get('/api/tokens/by-id/:tokenId/full', async (req, res) => {
  const { tokenId } = req.params

  console.log('🔍 [OAuth Server] GET /api/tokens/by-id/:tokenId/full')
  console.log('  tokenId:', tokenId)

  let conn
  try {
    conn = await getConnection()

    // 一次 SQL 查询获取所有信息（token + OAuth app）
    const query = `
      SELECT
        ut.id,
        ut.user_identifier,
        ut.display_name,
        ut.name,
        ut.access_token,
        ut.refresh_token,
        ut.expires_at,
        ut.user_info,
        ut.created_at,
        ut.updated_at,
        oa.platform,
        oa.name as app_name,
        oa.client_id,
        oa.client_secret
      FROM user_tokens ut
      JOIN oauth_apps oa ON ut.oauth_app_id = oa.id
      WHERE ut.id = ? AND ut.is_active = 1 AND oa.is_active = 1
    `

    console.log('📋 [OAuth Server] SQL Query:', query.replace(/\s+/g, ' ').trim())
    console.log('📋 [OAuth Server] SQL Params:', [tokenId])

    const startTime = Date.now()
    const rows = await conn.query(query, [tokenId])
    const queryTime = Date.now() - startTime

    console.log(`⏱️  [OAuth Server] SQL query executed in ${queryTime}ms`)
    console.log('📦 [OAuth Server] Query results count:', rows.length)

    if (rows.length === 0) {
      console.warn('⚠️  [OAuth Server] Token not found or inactive:', tokenId)
      return res.status(404).json({
        success: false,
        error: 'Token not found or inactive'
      })
    }

    const token = rows[0]
    console.log('✅ [OAuth Server] Token found:', {
      id: token.id,
      user_identifier: token.user_identifier,
      platform: token.platform,
      has_access_token: !!token.access_token,
      has_refresh_token: !!token.refresh_token,
      has_client_secret: !!token.client_secret
    })

    res.json({
      success: true,
      data: token
    })
  } catch (err) {
    console.error('❌ [OAuth Server] Database error:', err)
    console.error('❌ [OAuth Server] Error stack:', err.stack)
    res.status(500).json({
      success: false,
      error: err.message
    })
  } finally {
    if (conn) conn.release()
  }
})

// 更新用户令牌（通过 Token ID 异步更新）
// 用于 token 刷新后同步到 OAuth Server
app.post('/api/tokens/by-id/:tokenId/update', async (req, res) => {
  const { tokenId } = req.params
  const { access_token, expires_at } = req.body

  console.log('🔄 [OAuth Server] POST /api/tokens/by-id/:tokenId/update')
  console.log('  tokenId:', tokenId)
  console.log('  has access_token:', !!access_token)
  console.log('  expires_at:', expires_at)

  if (!access_token || !expires_at) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: access_token, expires_at'
    })
  }

  let conn
  try {
    conn = await getConnection()

    const expiresAtISO = new Date(expires_at).toISOString()

    const query = `
      UPDATE user_tokens
      SET access_token = ?,
          expires_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = 1
    `

    console.log('📋 [OAuth Server] SQL Query:', query.replace(/\s+/g, ' ').trim())

    const startTime = Date.now()
    const result = await conn.query(query, [access_token, expiresAtISO, tokenId])
    const queryTime = Date.now() - startTime

    console.log(`⏱️  [OAuth Server] SQL query executed in ${queryTime}ms`)

    if (result.affectedRows === 0) {
      console.warn('⚠️  [OAuth Server] Token not found or inactive:', tokenId)
      return res.status(404).json({
        success: false,
        error: 'Token not found or inactive'
      })
    }

    console.log('✅ [OAuth Server] Token updated successfully:', tokenId)

    // ✅ 广播 tokens-changed 事件给所有连接的客户端
    broadcastTokensChanged('token-refresh')

    res.json({
      success: true,
      message: 'Token updated successfully'
    })
  } catch (err) {
    console.error('❌ [OAuth Server] Error updating token:', err)
    console.error('❌ [OAuth Server] Error stack:', err.stack)
    res.status(500).json({
      success: false,
      error: err.message
    })
  } finally {
    if (conn) conn.release()
  }
})

// 获取统计信息
app.get('/api/stats', async (req, res) => {
  let conn
  try {
    conn = await getConnection()
    const stats = {}

    // 获取OAuth应用数量
    const appsResult = await conn.query('SELECT COUNT(*) as count FROM oauth_apps WHERE is_active = 1')
    stats.oauth_apps = Number(appsResult[0].count) // Convert BigInt to Number

    // 获取用户令牌数量
    const tokensResult = await conn.query('SELECT COUNT(*) as count FROM user_tokens WHERE is_active = 1')
    stats.user_tokens = Number(tokensResult[0].count) // Convert BigInt to Number

    // 按平台统计
    const platformStats = await conn.query(`
      SELECT oa.platform, COUNT(ut.id) as token_count
      FROM oauth_apps oa
      LEFT JOIN user_tokens ut ON oa.id = ut.oauth_app_id AND ut.is_active = 1
      WHERE oa.is_active = 1
      GROUP BY oa.platform
    `)

    stats.by_platform = platformStats.reduce((acc, row) => {
      acc[row.platform] = Number(row.token_count) // Convert BigInt to Number
      return acc
    }, {})

    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// ==================== LLM 配置 API ====================

// 获取 LLM 配置
app.get('/api/llm/config', async (req, res) => {
  console.log('🔍 [LLM] GET /api/llm/config')

  let conn
  try {
    conn = await getConnection()

    const rows = await conn.query('SELECT * FROM llm_config WHERE id = ?', ['default'])

    if (rows.length === 0) {
      return res.json({
        success: false,
        error: 'LLM 配置不存在'
      })
    }

    const config = rows[0]

    // 不返回 API Key 给客户端（安全考虑）
    res.json({
      success: true,
      data: {
        provider: config.provider,
        baseUrl: config.base_url,
        apiKey: config.api_key ? '******' : null,  // 隐藏 API Key，只告知是否已配置
        model: config.model,
        maxTokens: config.max_tokens,
        temperature: parseFloat(config.temperature),
        timeout: config.timeout,
        isEnabled: config.is_enabled === 1
      }
    })
  } catch (err) {
    console.error('❌ [LLM] Failed to get config:', err)
    res.status(500).json({
      success: false,
      error: err.message
    })
  } finally {
    if (conn) conn.release()
  }
})

// 获取 LLM 配置（包含 API Key，仅供内部使用）
app.get('/api/llm/config/full', async (req, res) => {
  console.log('🔍 [LLM] GET /api/llm/config/full')

  let conn
  try {
    conn = await getConnection()

    const rows = await conn.query('SELECT * FROM llm_config WHERE id = ?', ['default'])

    if (rows.length === 0) {
      return res.json({
        success: false,
        error: 'LLM 配置不存在'
      })
    }

    const config = rows[0]

    // 返回完整配置（包含 API Key）
    res.json({
      success: true,
      data: {
        provider: config.provider,
        baseUrl: config.base_url,
        apiKey: config.api_key,
        model: config.model,
        maxTokens: config.max_tokens,
        temperature: parseFloat(config.temperature),
        timeout: config.timeout,
        isEnabled: config.is_enabled === 1
      }
    })
  } catch (err) {
    console.error('❌ [LLM] Failed to get full config:', err)
    res.status(500).json({
      success: false,
      error: err.message
    })
  } finally {
    if (conn) conn.release()
  }
})

// 保存 LLM 配置
app.post('/api/llm/config', async (req, res) => {
  console.log('📝 [LLM] POST /api/llm/config')

  const { provider, baseUrl, apiKey, model, maxTokens, temperature, timeout, isEnabled } = req.body

  if (!provider || !baseUrl || !model) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数: provider, baseUrl, model'
    })
  }

  if (!['ollama', 'openai'].includes(provider)) {
    return res.status(400).json({
      success: false,
      error: 'provider 必须是 ollama 或 openai'
    })
  }

  let conn
  try {
    conn = await getConnection()

    // 检查是否已存在配置
    const existing = await conn.query('SELECT id FROM llm_config WHERE id = ?', ['default'])

    if (existing.length > 0) {
      // 更新现有配置
      // 如果 apiKey 为空字符串或 '******'，保留原有的 apiKey
      let updateQuery, updateParams

      if (apiKey && apiKey !== '******') {
        updateQuery = `
          UPDATE llm_config SET
            provider = ?, base_url = ?, api_key = ?, model = ?,
            max_tokens = ?, temperature = ?, timeout = ?, is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
        updateParams = [
          provider, baseUrl, apiKey, model,
          maxTokens || 2048, temperature || 0.3, timeout || 120000, isEnabled ? 1 : 0,
          'default'
        ]
      } else {
        updateQuery = `
          UPDATE llm_config SET
            provider = ?, base_url = ?, model = ?,
            max_tokens = ?, temperature = ?, timeout = ?, is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
        updateParams = [
          provider, baseUrl, model,
          maxTokens || 2048, temperature || 0.3, timeout || 120000, isEnabled ? 1 : 0,
          'default'
        ]
      }

      await conn.query(updateQuery, updateParams)
      console.log('✅ [LLM] Config updated')
    } else {
      // 插入新配置
      await conn.query(`
        INSERT INTO llm_config (id, provider, base_url, api_key, model, max_tokens, temperature, timeout, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'default', provider, baseUrl, apiKey || null, model,
        maxTokens || 2048, temperature || 0.3, timeout || 120000, isEnabled ? 1 : 0
      ])
      console.log('✅ [LLM] Config created')
    }

    res.json({
      success: true,
      message: 'LLM 配置保存成功'
    })
  } catch (err) {
    console.error('❌ [LLM] Failed to save config:', err)
    res.status(500).json({
      success: false,
      error: err.message
    })
  } finally {
    if (conn) conn.release()
  }
})

// 测试 LLM 连接
app.post('/api/llm/test', async (req, res) => {
  console.log('🔗 [LLM] POST /api/llm/test')

  const { provider, baseUrl, apiKey, model } = req.body

  if (!provider || !baseUrl || !model) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数: provider, baseUrl, model'
    })
  }

  const startTime = Date.now()

  try {
    let testResult

    if (provider === 'ollama') {
      // Ollama: 调用 /api/tags 获取模型列表
      const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 10000 })
      const models = response.data.models?.map(m => m.name) || []
      testResult = {
        success: true,
        message: '连接成功',
        availableModels: models,
        modelExists: models.some(m => m.includes(model.split(':')[0]))
      }
    } else {
      // OpenAI 兼容: 调用 /v1/models 获取模型列表
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
      const response = await axios.get(`${baseUrl}/v1/models`, { headers, timeout: 10000 })
      const models = response.data.data?.map(m => m.id) || []
      testResult = {
        success: true,
        message: '连接成功',
        availableModels: models.slice(0, 10), // 只返回前10个
        modelExists: models.includes(model)
      }
    }

    testResult.responseTime = Date.now() - startTime
    res.json(testResult)
  } catch (err) {
    console.error('❌ [LLM] Connection test failed:', err.message)

    let errorMessage = '连接失败'
    if (err.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到服务，请检查地址是否正确'
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      errorMessage = '连接超时，请检查网络或服务状态'
    } else if (err.response?.status === 401) {
      errorMessage = 'API Key 无效或未授权'
    } else if (err.response?.status === 404) {
      errorMessage = 'API 端点不存在，请检查 Base URL'
    }

    res.json({
      success: false,
      error: errorMessage,
      responseTime: Date.now() - startTime
    })
  }
})

// 清理过期会话的定时任务
setInterval(() => {
  const now = new Date()
  let cleanedPendingCount = 0
  let cleanedProcessedCount = 0

  // 清理过期的待处理会话
  for (const [sessionId, session] of pendingSessions.entries()) {
    if (now > session.expiresAt) {
      pendingSessions.delete(sessionId)
      cleanedPendingCount++
    }
  }

  // 清理过期的已处理会话
  for (const [sessionId, session] of processedSessions.entries()) {
    if (now > session.expiresAt) {
      processedSessions.delete(sessionId)
      cleanedProcessedCount++
    }
  }

  if (cleanedPendingCount > 0 || cleanedProcessedCount > 0) {
    console.log(`🧹 清理了 ${cleanedPendingCount} 个过期的待处理会话，${cleanedProcessedCount} 个已处理会话`)
  }
}, 60000) // 每分钟清理一次

// 启动服务器
server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log(`🚀 OAuth回调服务器启动成功`)
  console.log(`📍 服务器地址: ${getServerBaseUrl()}`)
  console.log(`🔗 健康检查: ${getServerBaseUrl()}/health`)
  console.log(`ℹ️  服务器信息: ${getServerBaseUrl()}/info`)
  console.log(`📱 支持的平台: ${Object.keys(OAUTH_CONFIGS).join(', ')}`)
  console.log(`⏰ 会话超时: ${CONFIG.SESSION_TIMEOUT / 1000 / 60} 分钟`)
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})