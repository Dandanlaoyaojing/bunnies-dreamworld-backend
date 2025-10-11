// 参数验证中间件

/**
 * 验证必填字段
 * @param {Array} fields - 必填字段列表
 */
function validateRequired(fields) {
  return (req, res, next) => {
    const data = { ...req.body, ...req.query, ...req.params };
    const missing = [];
    
    for (const field of fields) {
      if (!data[field] && data[field] !== 0 && data[field] !== false) {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `缺少必填字段: ${missing.join(', ')}`
      });
    }
    
    next();
  };
}

/**
 * 验证邮箱格式
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证手机号格式（中国大陆）
 */
function validatePhone(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 验证用户名格式（4-20位字母数字下划线）
 */
function validateUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]{4,20}$/;
  return usernameRegex.test(username);
}

/**
 * 验证密码强度（6-20位）
 */
function validatePassword(password) {
  return password && password.length >= 6 && password.length <= 20;
}

/**
 * XSS防护 - 清理HTML标签
 */
function sanitizeHtml(text) {
  if (!text) return text;
  return text.replace(/<[^>]*>/g, '');
}

module.exports = {
  validateRequired,
  validateEmail,
  validatePhone,
  validateUsername,
  validatePassword,
  sanitizeHtml
};

