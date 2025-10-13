require('dotenv').config(); // 导入所需的模块
const express = require('express');
const mysql = require('mysql2/promise'); // 使用 mysql2 的 Promise 版本

// 创建 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// 中间件：解析 JSON 请求体
app.use(express.json());

// 从环境变量中获取数据库配置，并创建连接池
// 连接池优于单连接，因为它管理多个连接，提高性能
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_database',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

// 创建一个不带数据库名的配置，用于创建数据库
const dbConfigWithoutDB = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建数据库连接池
const dbPool = mysql.createPool(dbConfig);

// 定义一个异步函数来创建数据库（如果不存在）
async function createDatabaseIfNotExists() {
  let connection;
  try {
    // 使用不带数据库名的配置连接
    const tempPool = mysql.createPool(dbConfigWithoutDB);
    connection = await tempPool.getConnection();
    
    // 创建数据库（如果不存在）
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'bunnies_dreamworld'}`);
    console.log('✅ 数据库创建/确认成功！');
    
    connection.release();
    tempPool.end();
  } catch (error) {
    console.error('❌ 创建数据库失败:', error.message);
    throw error;
  }
}

// 定义一个异步函数来测试数据库连接
async function testDatabaseConnection() {
  let connection;
  try {
    // 从连接池中获取一个连接
    connection = await dbPool.getConnection();
    console.log('✅ 数据库连接成功！');
    
    // 可选：执行一个简单的查询来进一步验证
    const [rows] = await connection.query('SELECT 1 + 1 AS solution');
    console.log('✅ 数据库简单查询测试成功！结果:', rows[0].solution);
  } catch (error) {
    // 如果连接或查询失败，打印详细的错误信息
    console.error('❌ 数据库连接失败:');
    console.error(' 错误信息:', error.message);
    console.error(' 请检查 .env 文件中的 DB_HOST, DB_USER, DB_PASSWORD, DB_NAME 配置是否正确。');
    console.error(' 同时请确认您的 MySQL 服务器是否正在运行，以及用户是否有权限访问该数据库。');
    
    // 发生严重错误，退出应用
    process.exit(1);
  } finally {
    // 无论成功与否，都释放连接回连接池
    if (connection) {
      connection.release();
      console.log('✅ 数据库连接已释放回连接池。');
    }
  }
}

// 定义一个简单的路由进行测试
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hello World! 小程序后端API正在运行。' 
  });
});

// 捕获未处理的 promise 异常，防止服务器崩溃
process.on('unhandledRejection', (err) => {
  console.error('❌ 未处理的 Promise 异常:', err);
  // 通常这里可以选择记录日志后优雅地关闭服务器
  process.exit(1);
});

// 启动服务器前的初始化工作
async function startServer() {
  try {
    // 1. 创建数据库（如果不存在）
    console.log('🔄 正在创建/确认数据库...');
    await createDatabaseIfNotExists();
    
    // 2. 测试数据库连接
    console.log('🔄 正在测试数据库连接...');
    await testDatabaseConnection();
    
    // 3. 如果连接成功，启动 Express 服务器
    app.listen(port, '0.0.0.0', () => {
      console.log(`🎉 服务器正在运行：http://localhost:${port}`);
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error.message);
    process.exit(1);
  }
}

console.log("正在读取环境变量...");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD:", process.env.DB_PASSWORD ? "***密码已设置***" : "!!! 密码未设置 !!!");
console.log("DB_NAME:", process.env.DB_NAME);

// 调用启动函数
startServer();