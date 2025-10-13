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
 * 验证用户名格式（2-50位任意字符）
 */
function validateUsername(username) {
  // 取消格式限制，只验证长度
  return username && username.length >= 2 && username.length <= 50;
}

/**
 * 验证密码强度（6-50位）
 */
function validatePassword(password) {
  return password && password.length >= 6 && password.length <= 50;
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

