// 限流中间件
// 简单的内存限流实现，生产环境建议使用Redis

const requestCounts = new Map();

/**
 * 限流中间件
 * @param {Number} maxRequests - 时间窗口内最大请求数
 * @param {Number} windowMs - 时间窗口（毫秒）
 */
function rateLimit(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const identifier = req.user ? `user_${req.user.id}` : req.ip;
    const now = Date.now();
    
    if (!requestCounts.has(identifier)) {
      requestCounts.set(identifier, []);
    }
    
    const requests = requestCounts.get(identifier);
    
    // 移除过期的请求记录
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    validRequests.push(now);
    requestCounts.set(identifier, validRequests);
    
    next();
  };
}

// 清理过期数据（每5分钟执行一次）
setInterval(() => {
  const now = Date.now();
  for (const [identifier, requests] of requestCounts.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < 300000);
    if (validRequests.length === 0) {
      requestCounts.delete(identifier);
    } else {
      requestCounts.set(identifier, validRequests);
    }
  }
}, 300000);

module.exports = rateLimit;

