/**
 * MariaDB database connection module
 */

const mariadb = require('mariadb');

// Create connection pool
const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'oauth_user',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_NAME || 'oauth_server',
  connectionLimit: 5,
  charset: 'utf8mb4',
  connectTimeout: 30000, // 30 seconds connection timeout
  acquireTimeout: 30000, // 30 seconds acquire timeout
  socketTimeout: 30000   // 30 seconds socket timeout
});

/**
 * Get database connection
 */
async function getConnection() {
  try {
    return await pool.getConnection();
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    throw err;
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  let conn;
  try {
    conn = await getConnection();
    console.log('✅ MariaDB connected successfully');
    console.log('   Host:', process.env.DB_HOST || 'localhost');
    console.log('   Port:', process.env.DB_PORT || '3306');
    console.log('   Database:', process.env.DB_NAME || 'oauth_server');
    return true;
  } catch (err) {
    console.error('❌ MariaDB connection failed:', err);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  pool,
  getConnection,
  testConnection
};
