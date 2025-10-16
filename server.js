// 小兔的梦幻世界笔记本 - 后端服务器
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./src/config/database');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');
const rateLimit = require('./src/middleware/rateLimit');

// 创建Express应用
const app = express();
const port = process.env.PORT || 3000;

// ===== 中间件配置 =====

// 跨域配置
app.use(cors({
  origin: '*', // 生产环境应该设置为具体的小程序域名
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 解析JSON请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 全局限流（每分钟60次请求）
app.use(rateLimit(60, 60000));

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ===== API路由 =====

// 健康检查（简单路由，不需要导入）
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: '服务器运行正常',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  });
});

// 系统版本信息
app.get('/api/v1/system/version', (req, res) => {
  res.json({
    success: true,
    message: '获取版本信息成功',
    data: {
      version: '1.0.0',
      apiPrefix: '/api/v1',
      features: {
        authentication: true,
        fileUpload: true,
        ai: true,
        cloudSync: true,
        groupCollaboration: true,
        knowledgeMapFusion: true
      }
    }
  });
});

// 导入路由模块（使用try-catch防止模块加载失败）
try {
  const authRoutes = require('./src/routes/auth');
  const userRoutes = require('./src/routes/user');
  const noteRoutes = require('./src/routes/note');
  const fileRoutes = require('./src/routes/file');
  const categoryRoutes = require('./src/routes/category');
  const tagRoutes = require('./src/routes/tag');
  const statsRoutes = require('./src/routes/stats');
  const draftRoutes = require('./src/routes/draft');
  const syncRoutes = require('./src/routes/sync');
  const systemRoutes = require('./src/routes/system');
  
  // 新增路由模块
  const favoriteRoutes = require('./src/routes/favorite');
  const knowledgeMapRoutes = require('./src/routes/knowledge-map');
  const backupRoutes = require('./src/routes/backup');
  
  // 组群协作路由模块
  const groupsRoutes = require('./src/routes/groups');
  const groupFusionRoutes = require('./src/routes/group-fusion');

  // 注册路由
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/user', userRoutes);
  app.use('/api/v1/notes', noteRoutes);
  app.use('/api/v1', fileRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/tags', tagRoutes);
  app.use('/api/v1/stats', statsRoutes);
  app.use('/api/v1/drafts', draftRoutes);
  app.use('/api/v1/sync', syncRoutes);
  app.use('/api/v1', systemRoutes);
  
  // 注册新增路由
  app.use('/api/v1/favorites', favoriteRoutes);
  app.use('/api/v1/knowledge-map', knowledgeMapRoutes);
  app.use('/api/v1/backup', backupRoutes);
  
  // 注册组群协作路由
  app.use('/api/v1/groups', groupsRoutes);
  app.use('/api/v1/groups', groupFusionRoutes);
  
  console.log('✅ 所有路由模块加载成功');
} catch (err) {
  console.error('❌ 路由模块加载失败:', err.message);
}

// ===== 错误处理 =====

// 404处理
app.use(notFound);

// 全局错误处理
app.use(errorHandler);

// ===== 启动服务器 =====

async function startServer() {
  try {
    // 测试数据库连接
    console.log('🔄 正在测试数据库连接...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ 数据库连接失败，请检查配置');
      process.exit(1);
    }
    
    // 启动服务器
    app.listen(port, '0.0.0.0', () => {
      console.log('='.repeat(60));
      console.log('🎉 小兔的梦幻世界笔记本 - 后端服务器');
      console.log('='.repeat(60));
      console.log(`✅ 服务器运行在: http://localhost:${port}`);
      console.log(`✅ API文档前缀: /api/v1`);
      console.log(`✅ 健康检查: http://localhost:${port}/api/v1/health`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 未捕获的Promise异常
process.on('unhandledRejection', (err) => {
  console.error('❌ 未处理的Promise异常:', err);
});

// 启动服务器
startServer();

module.exports = app;

