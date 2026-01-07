/**
 * LLM 配置表迁移脚本
 * 创建 llm_config 表并插入默认配置
 */

require('dotenv').config();

const { getConnection, testConnection } = require('./database');

async function migrate() {
  let conn;
  try {
    // 测试连接
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ 无法连接到数据库');
      process.exit(1);
    }

    conn = await getConnection();

    console.log('📋 开始创建 llm_config 表...');

    // 创建 llm_config 表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS llm_config (
        id VARCHAR(36) PRIMARY KEY,
        provider ENUM('ollama', 'openai') NOT NULL DEFAULT 'ollama',
        base_url VARCHAR(255) NOT NULL,
        api_key VARCHAR(255),
        model VARCHAR(100) NOT NULL,
        max_tokens INT DEFAULT 2048,
        temperature DECIMAL(2,1) DEFAULT 0.3,
        timeout INT DEFAULT 120000,
        is_enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ llm_config 表创建成功');

    // 检查是否已有默认配置
    const existing = await conn.query('SELECT id FROM llm_config WHERE id = ?', ['default']);

    if (existing.length === 0) {
      // 插入默认配置
      await conn.query(`
        INSERT INTO llm_config (id, provider, base_url, model, max_tokens, temperature, timeout, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'default',
        'ollama',
        'http://localhost:11434',
        'qwen2.5:7b',
        2048,
        0.3,
        120000,
        1
      ]);

      console.log('✅ 默认配置插入成功');
    } else {
      console.log('ℹ️  默认配置已存在，跳过插入');
    }

    console.log('🎉 迁移完成！');

  } catch (err) {
    console.error('❌ 迁移失败:', err);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

migrate();
