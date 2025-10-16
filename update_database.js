// 数据库更新脚本 - 添加组群协作功能表
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

async function updateDatabase() {
  let connection;
  
  try {
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bunnies_dreamworld',
      multipleStatements: true
    });
    
    console.log('✅ 数据库连接成功');
    
    // 读取SQL文件
    const sqlContent = fs.readFileSync('update_database_groups.sql', 'utf8');
    
    // 执行SQL语句
    console.log('🔄 正在执行数据库更新...');
    await connection.execute(sqlContent);
    
    console.log('✅ 数据库更新完成！');
    
    // 验证表是否创建成功
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('groups', 'group_members', 'shared_nodes')
    `, [process.env.DB_NAME || 'bunnies_dreamworld']);
    
    console.log('📋 已创建的表:');
    tables.forEach(table => {
      console.log(`   ✅ ${table.TABLE_NAME}`);
    });
    
  } catch (error) {
    console.error('❌ 数据库更新失败:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ 数据库连接已关闭');
    }
  }
}

// 运行更新
if (require.main === module) {
  updateDatabase()
    .then(() => {
      console.log('🎉 数据库更新完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 更新失败:', error);
      process.exit(1);
    });
}

module.exports = updateDatabase;
