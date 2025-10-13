// 更新数据库以支持微信登录
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateDatabase() {
  console.log('🔄 开始更新数据库结构（添加微信登录支持）...');
  
  try {
    const sql = fs.readFileSync('update_schema_wechat.sql', 'utf8');
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bunnies_dreamworld',
      multipleStatements: true,
      charset: 'utf8mb4'
    });
    
    console.log('✅ 数据库连接成功');
    
    await connection.query(sql);
    
    console.log('✅ 数据库结构更新完成！');
    
    await connection.end();
    
    console.log('🎉 微信登录支持已添加！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 数据库更新失败:', error.message);
    process.exit(1);
  }
}

updateDatabase();

