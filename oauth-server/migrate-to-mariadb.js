/**
 * 数据库迁移脚本 - 将现有 SQLite 数据迁移到 MariaDB
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { getConnection } = require('./database');

/**
 * 将 ISO 8601 日期格式转换为 MySQL DATETIME 格式
 * @param {string} isoDate - ISO 8601 格式日期字符串 (例如: '2025-10-29T03:39:39.871Z')
 * @returns {string|null} - MySQL DATETIME 格式 (例如: '2025-10-29 03:39:39') 或 null
 */
function convertToMySQLDateTime(isoDate) {
  if (!isoDate) return null;

  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;

    // 格式化为 'YYYY-MM-DD HH:MM:SS'
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.warn(`⚠️  日期转换失败: ${isoDate}`, error);
    return null;
  }
}

async function migrateData() {
  let conn;
  try {
    console.log('🔄 开始数据迁移...');

    // 连接 SQLite
    const sqliteDb = new sqlite3.Database('./accounts.db.backup');

    // 连接 MariaDB
    conn = await getConnection();

    // 迁移 oauth_apps 表
    console.log('📦 迁移 oauth_apps 表...');
    const oauthApps = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM oauth_apps', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    for (const app of oauthApps) {
      await conn.query(
        `INSERT INTO oauth_apps (id, platform, name, client_id, client_secret, redirect_uri, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         platform = VALUES(platform),
         name = VALUES(name),
         client_id = VALUES(client_id),
         client_secret = VALUES(client_secret),
         redirect_uri = VALUES(redirect_uri),
         is_active = VALUES(is_active)`,
        [app.id, app.platform, app.name, app.client_id, app.client_secret, app.redirect_uri, app.is_active, convertToMySQLDateTime(app.created_at)]
      );
    }
    console.log(`✅ 迁移了 ${oauthApps.length} 条 oauth_apps 记录`);

    // 迁移 user_tokens 表（为所有记录分配默认 client_id）
    console.log('📦 迁移 user_tokens 表...');
    const userTokens = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM user_tokens', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const defaultClientId = '00000000-0000-0000-0000-000000000000'; // 默认 client_id

    for (const token of userTokens) {
      await conn.query(
        `INSERT INTO user_tokens
         (id, oauth_app_id, user_identifier, display_name, name, access_token, refresh_token, expires_at, user_info, client_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         access_token = VALUES(access_token),
         refresh_token = VALUES(refresh_token),
         expires_at = VALUES(expires_at),
         user_info = VALUES(user_info),
         display_name = VALUES(display_name),
         name = VALUES(name),
         is_active = VALUES(is_active)`,
        [
          token.id,
          token.oauth_app_id,
          token.user_identifier,
          token.display_name,
          token.name,
          token.access_token,
          token.refresh_token,
          convertToMySQLDateTime(token.expires_at),
          token.user_info,
          defaultClientId, // 使用默认 client_id
          token.is_active,
          convertToMySQLDateTime(token.created_at),
          convertToMySQLDateTime(token.updated_at)
        ]
      );
    }
    console.log(`✅ 迁移了 ${userTokens.length} 条 user_tokens 记录`);
    console.log(`⚠️  所有 token 使用默认 client_id: ${defaultClientId}`);

    sqliteDb.close();
    console.log('✅ 数据迁移完成！');

  } catch (error) {
    console.error('❌ 数据迁移失败:', error);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

migrateData();
