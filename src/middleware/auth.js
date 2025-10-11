// JWT认证中间件
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { unauthorized, error } = require('../utils/response');

// JWT密钥（从环境变量获取）
const JWT_SECRET = process.env.JWT_SECRET || 'bunnies-dreamworld-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'; // 30天有效期

/**
 * 生成JWT Token
 * @param {Object} user - 用户信息
 * @returns {String} JWT Token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 验证JWT Token
 * @param {String} token - JWT Token
 * @returns {Object} 解码后的用户信息
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * 认证中间件
 * 验证请求头中的JWT Token
 */
async function authenticate(req, res, next) {
  try {
    // 从请求头获取token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, '请提供有效的认证令牌');
    }
    
    const token = authHeader.substring(7); // 移除 "Bearer " 前缀
    
    // 检查token是否在黑名单中（已登出）
    const [blacklist] = await pool.query(
      'SELECT id FROM token_blacklist WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    
    if (blacklist.length > 0) {
      return unauthorized(res, '令牌已失效，请重新登录');
    }
    
    // 验证token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return unauthorized(res, '令牌无效或已过期');
    }
    
    // 查询用户信息
    const [users] = await pool.query(
      'SELECT id, username, nickname, avatar, email, status FROM users WHERE id = ? AND status = "active"',
      [decoded.id]
    );
    
    if (users.length === 0) {
      return unauthorized(res, '用户不存在或已被禁用');
    }
    
    // 将用户信息附加到请求对象
    req.user = users[0];
    req.token = token;
    
    next();
  } catch (err) {
    console.error('认证中间件错误:', err);
    return error(res, '认证失败', 500);
  }
}

/**
 * 可选认证中间件
 * Token无效时不会拦截请求，但会设置req.user
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        const [users] = await pool.query(
          'SELECT id, username, nickname, avatar FROM users WHERE id = ? AND status = "active"',
          [decoded.id]
        );
        
        if (users.length > 0) {
          req.user = users[0];
        }
      }
    }
    
    next();
  } catch (err) {
    next();
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN
};

