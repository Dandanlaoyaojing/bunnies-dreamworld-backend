// 错误处理中间件

/**
 * 404错误处理
 */
function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.url}`,
    hint: '请检查 API 路径是否正确，或查看根路径 "/" 获取可用接口列表',
    apiPrefix: '/api/v1',
    timestamp: new Date().toISOString()
  });
}

/**
 * 全局错误处理
 */
function errorHandler(err, req, res, next) {
  console.error('❌ 错误:', err);
  
  // 数据库错误
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({
      success: false,
      message: '数据已存在，请勿重复操作'
    });
  }
  
  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: '认证令牌无效'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: '认证令牌已过期'
    });
  }
  
  // 验证错误
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  // 默认服务器错误
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = {
  notFound,
  errorHandler
};

