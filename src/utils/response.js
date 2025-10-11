// 统一响应格式工具

/**
 * 成功响应
 * @param {Object} res - Express响应对象
 * @param {*} data - 响应数据
 * @param {String} message - 提示信息
 * @param {Number} statusCode - HTTP状态码
 */
function success(res, data = null, message = '操作成功', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message: message,
    data: data
  });
}

/**
 * 失败响应
 * @param {Object} res - Express响应对象
 * @param {String} message - 错误信息
 * @param {Number} statusCode - HTTP状态码
 * @param {*} error - 错误详情（仅开发环境返回）
 */
function error(res, message = '操作失败', statusCode = 400, error = null) {
  const response = {
    success: false,
    message: message
  };
  
  // 仅在开发环境返回错误详情
  if (process.env.NODE_ENV === 'development' && error) {
    response.error = error;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * 未授权响应
 * @param {Object} res - Express响应对象
 * @param {String} message - 错误信息
 */
function unauthorized(res, message = '未授权，请先登录') {
  return error(res, message, 401);
}

/**
 * 禁止访问响应
 * @param {Object} res - Express响应对象
 * @param {String} message - 错误信息
 */
function forbidden(res, message = '没有权限访问') {
  return error(res, message, 403);
}

/**
 * 资源不存在响应
 * @param {Object} res - Express响应对象
 * @param {String} message - 错误信息
 */
function notFound(res, message = '资源不存在') {
  return error(res, message, 404);
}

/**
 * 服务器错误响应
 * @param {Object} res - Express响应对象
 * @param {String} message - 错误信息
 * @param {*} error - 错误详情
 */
function serverError(res, message = '服务器内部错误', error = null) {
  console.error('❌ 服务器错误:', error);
  return error(res, message, 500, error);
}

module.exports = {
  success,
  error,
  unauthorized,
  forbidden,
  notFound,
  serverError
};

