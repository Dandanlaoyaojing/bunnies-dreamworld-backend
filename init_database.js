// 初始化数据库脚本
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  console.log('🔄 开始初始化数据库...');
  
  try {
    // 读取SQL文件
    const sql = fs.readFileSync('database_schema.sql', 'utf8');
    
    // 创建数据库连接
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bunnies_dreamworld',
      multipleStatements: true,
      charset: 'utf8mb4'
    });
    
    console.log('✅ 数据库连接成功');
    
    // 执行SQL脚本
    await connection.query(sql);
    
    console.log('✅ 数据库表结构创建完成！');
    
    // 关闭连接
    await connection.end();
    
    console.log('🎉 数据库初始化完成！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    process.exit(1);
  }
}

initDatabase();

