// 认证控制器
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const { validateUsername, validatePassword } = require('../middleware/validator');

/**
 * 用户注册
 * POST /api/v1/auth/register
 */
async function register(req, res) {
  try {
    const { username, password, nickname } = req.body;
    
    // 验证输入
    if (!validateUsername(username)) {
      return error(res, '用户名格式不正确（2-50个字符）');
    }
    
    if (!validatePassword(password)) {
      return error(res, '密码长度必须在6-50位之间');
    }
    
    // 检查用户名是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      return error(res, '用户名已存在');
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 插入新用户
    const [result] = await pool.query(
      'INSERT INTO users (username, password, nickname, status) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, nickname || username, 'active']
    );
    
    const userId = result.insertId;
    
    // 生成token
    const token = generateToken({ id: userId, username });
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, details) VALUES (?, ?, ?, ?)',
      [userId, 'register', 'user', JSON.stringify({ username })]
    );
    
    return success(res, {
      user: {
        id: userId,
        username,
        nickname: nickname || username
      },
      token
    }, '注册成功', 201);
    
  } catch (err) {
    console.error('注册失败:', err);
    return error(res, '注册失败，请稍后重试', 500);
  }
}

/**
 * 用户登录
 * POST /api/v1/auth/login
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;
    
    // 查询用户
    const [users] = await pool.query(
      'SELECT id, username, password, nickname, avatar, status FROM users WHERE username = ?',
      [username]
    );
    
    if (users.length === 0) {
      return error(res, '用户名或密码错误');
    }
    
    const user = users[0];
    
    // 检查账户状态
    if (user.status !== 'active') {
      return error(res, '账户已被禁用');
    }
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return error(res, '用户名或密码错误');
    }
    
    // 生成token
    const token = generateToken({ id: user.id, username: user.username });
    
    // 更新最后登录时间
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, ip_address) VALUES (?, ?, ?, ?)',
      [user.id, 'login', 'user', req.ip]
    );
    
    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar
      },
      token
    }, '登录成功');
    
  } catch (err) {
    console.error('登录失败:', err);
    return error(res, '登录失败，请稍后重试', 500);
  }
}

/**
 * 用户登出
 * POST /api/v1/auth/logout
 */
async function logout(req, res) {
  try {
    const token = req.token;
    const userId = req.user.id;
    
    // 将token添加到黑名单
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天后过期
    
    await pool.query(
      'INSERT INTO token_blacklist (token, user_id, expires_at) VALUES (?, ?, ?)',
      [token, userId, expiresAt]
    );
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type) VALUES (?, ?, ?)',
      [userId, 'logout', 'user']
    );
    
    return success(res, null, '登出成功');
    
  } catch (err) {
    console.error('登出失败:', err);
    return error(res, '登出失败，请稍后重试', 500);
  }
}

/**
 * 刷新Token
 * POST /api/v1/auth/refresh-token
 */
async function refreshToken(req, res) {
  try {
    const userId = req.user.id;
    const username = req.user.username;
    
    // 生成新token
    const newToken = generateToken({ id: userId, username });
    
    // 将旧token加入黑名单
    const oldToken = req.token;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    await pool.query(
      'INSERT INTO token_blacklist (token, user_id, expires_at) VALUES (?, ?, ?)',
      [oldToken, userId, expiresAt]
    );
    
    return success(res, { token: newToken }, '令牌刷新成功');
    
  } catch (err) {
    console.error('刷新令牌失败:', err);
    return error(res, '刷新令牌失败', 500);
  }
}

/**
 * 验证Token有效性
 * POST /api/v1/auth/verify-token
 */
async function verifyTokenValidity(req, res) {
  try {
    // 如果能走到这里，说明token有效（已通过authenticate中间件验证）
    return success(res, {
      valid: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        nickname: req.user.nickname
      }
    }, '令牌有效');
    
  } catch (err) {
    return error(res, '验证失败', 500);
  }
}

/**
 * 微信登录
 * POST /api/v1/auth/wechat-login
 */
async function wechatLogin(req, res) {
  try {
    const { code, userInfo } = req.body;
    
    if (!code) {
      return error(res, '缺少微信登录code');
    }
    
    // 注意：实际生产环境需要调用微信API换取openid
    // 这里简化处理，直接使用code作为openid（仅用于开发测试）
    // 生产环境需要：
    // const wxResult = await axios.get(`https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`)
    // const openid = wxResult.data.openid
    
    const openid = `wx_${code}`; // 开发环境模拟
    
    // 查询是否已存在该openid的用户
    const [existingUsers] = await pool.query(
      'SELECT id, username, nickname, avatar, openid FROM users WHERE openid = ?',
      [openid]
    );
    
    let userId;
    let username;
    let nickname;
    let avatar;
    
    if (existingUsers.length > 0) {
      // 用户已存在，直接登录
      const user = existingUsers[0];
      userId = user.id;
      username = user.username;
      nickname = user.nickname;
      avatar = user.avatar;
      
      console.log('微信用户登录:', userId, nickname);
      
      // 更新最后登录时间
      await pool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = ?',
        [userId]
      );
    } else {
      // 新用户，自动注册
      nickname = userInfo?.nickName || `微信用户${Date.now().toString().slice(-6)}`;
      avatar = userInfo?.avatarUrl || '';
      username = `wx_${Date.now().toString().slice(-8)}`; // 自动生成用户名
      
      const [result] = await pool.query(
        `INSERT INTO users (username, openid, nickname, avatar, wechat_nickname, wechat_avatar, login_type, status, password) 
         VALUES (?, ?, ?, ?, ?, ?, 'wechat', 'active', '')`,
        [username, openid, nickname, avatar, nickname, avatar]
      );
      
      userId = result.insertId;
      console.log('新微信用户注册:', userId, nickname);
    }
    
    // 生成token
    const token = generateToken({ id: userId, username: username || `user_${userId}` });
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, details) VALUES (?, ?, ?, ?)',
      [userId, 'wechat_login', 'user', JSON.stringify({ openid, nickname })]
    );
    
    return success(res, {
      user: {
        id: userId,
        username: username,
        nickname: nickname,
        avatar: avatar,
        openid: openid,
        isNewUser: existingUsers.length === 0
      },
      token
    }, existingUsers.length === 0 ? '注册成功' : '登录成功');
    
  } catch (err) {
    console.error('微信登录失败:', err);
    return error(res, '微信登录失败', 500);
  }
}

/**
 * QQ登录
 * POST /api/v1/auth/qq-login
 */
async function qqLogin(req, res) {
  try {
    const { qqOpenid, userInfo } = req.body;
    
    if (!qqOpenid) {
      return error(res, '缺少QQ登录凭证');
    }
    
    // 查询是否已存在该qq_openid的用户
    const [existingUsers] = await pool.query(
      'SELECT id, username, nickname, avatar FROM users WHERE qq_openid = ?',
      [qqOpenid]
    );
    
    let userId;
    let username;
    let nickname;
    let avatar;
    
    if (existingUsers.length > 0) {
      // 用户已存在
      const user = existingUsers[0];
      userId = user.id;
      username = user.username;
      nickname = user.nickname;
      avatar = user.avatar;
      
      await pool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = ?',
        [userId]
      );
    } else {
      // 新用户，自动注册
      nickname = userInfo?.nickName || `QQ用户${Date.now().toString().slice(-6)}`;
      avatar = userInfo?.avatarUrl || '';
      username = `qq_${Date.now().toString().slice(-8)}`;
      
      const [result] = await pool.query(
        `INSERT INTO users (username, qq_openid, nickname, avatar, login_type, status, password) 
         VALUES (?, ?, ?, ?, 'qq', 'active', '')`,
        [username, qqOpenid, nickname, avatar]
      );
      
      userId = result.insertId;
    }
    
    const token = generateToken({ id: userId, username: username || `user_${userId}` });
    
    return success(res, {
      user: { id: userId, username, nickname, avatar },
      token
    }, existingUsers.length === 0 ? '注册成功' : '登录成功');
    
  } catch (err) {
    console.error('QQ登录失败:', err);
    return error(res, 'QQ登录失败', 500);
  }
}

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  verifyTokenValidity,
  wechatLogin,
  qqLogin
};

