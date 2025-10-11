// 用户控制器
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');
const { validatePassword, sanitizeHtml } = require('../middleware/validator');

/**
 * 获取用户资料
 * GET /api/v1/user/profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.id;
    
    const [users] = await pool.query(
      'SELECT id, username, nickname, avatar, bio, email, phone, created_at, last_login_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return error(res, '用户不存在', 404);
    }
    
    return success(res, users[0], '获取资料成功');
    
  } catch (err) {
    console.error('获取资料失败:', err);
    return error(res, '获取资料失败', 500);
  }
}

/**
 * 更新用户资料
 * PUT /api/v1/user/profile
 */
async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { nickname, avatar, bio, email, phone } = req.body;
    
    const updates = [];
    const values = [];
    
    if (nickname) {
      updates.push('nickname = ?');
      values.push(sanitizeHtml(nickname));
    }
    
    if (avatar) {
      updates.push('avatar = ?');
      values.push(avatar);
    }
    
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(sanitizeHtml(bio));
    }
    
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    
    if (updates.length === 0) {
      return error(res, '没有要更新的内容');
    }
    
    values.push(userId);
    
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, details) VALUES (?, ?, ?, ?)',
      [userId, 'update_profile', 'user', JSON.stringify({ nickname, avatar, bio })]
    );
    
    return success(res, null, '资料更新成功');
    
  } catch (err) {
    console.error('更新资料失败:', err);
    return error(res, '更新资料失败', 500);
  }
}

/**
 * 修改密码
 * POST /api/v1/user/change-password
 */
async function changePassword(req, res) {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return error(res, '请提供旧密码和新密码');
    }
    
    if (!validatePassword(newPassword)) {
      return error(res, '新密码长度必须在6-20位之间');
    }
    
    // 查询当前密码
    const [users] = await pool.query(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return error(res, '用户不存在', 404);
    }
    
    // 验证旧密码
    const isValid = await bcrypt.compare(oldPassword, users[0].password);
    
    if (!isValid) {
      return error(res, '旧密码不正确');
    }
    
    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // 更新密码
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type) VALUES (?, ?, ?)',
      [userId, 'change_password', 'user']
    );
    
    return success(res, null, '密码修改成功');
    
  } catch (err) {
    console.error('修改密码失败:', err);
    return error(res, '修改密码失败', 500);
  }
}

/**
 * 注销账户
 * DELETE /api/v1/user/account
 */
async function deleteAccount(req, res) {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    
    if (!password) {
      return error(res, '请提供密码以确认注销');
    }
    
    // 验证密码
    const [users] = await pool.query(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return error(res, '用户不存在', 404);
    }
    
    const isValid = await bcrypt.compare(password, users[0].password);
    
    if (!isValid) {
      return error(res, '密码不正确');
    }
    
    // 软删除：更新状态为deleted
    await pool.query(
      'UPDATE users SET status = "deleted" WHERE id = ?',
      [userId]
    );
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type) VALUES (?, ?, ?)',
      [userId, 'delete_account', 'user']
    );
    
    return success(res, null, '账户注销成功');
    
  } catch (err) {
    console.error('注销账户失败:', err);
    return error(res, '注销账户失败', 500);
  }
}

/**
 * 获取用户统计信息
 * GET /api/v1/user/stats
 */
async function getStats(req, res) {
  try {
    const userId = req.user.id;
    
    // 统计笔记数量
    const [noteStats] = await pool.query(
      'SELECT COUNT(*) as total, SUM(word_count) as totalWords FROM notes WHERE user_id = ? AND is_deleted = false',
      [userId]
    );
    
    // 统计收藏数量
    const [favoriteStats] = await pool.query(
      'SELECT COUNT(*) as count FROM notes WHERE user_id = ? AND is_favorite = true AND is_deleted = false',
      [userId]
    );
    
    // 统计分类分布
    const [categoryStats] = await pool.query(
      'SELECT category, COUNT(*) as count FROM notes WHERE user_id = ? AND is_deleted = false GROUP BY category',
      [userId]
    );
    
    // 统计标签数量
    const [tagStats] = await pool.query(
      'SELECT COUNT(*) as count FROM tags WHERE user_id = ?',
      [userId]
    );
    
    return success(res, {
      noteCount: noteStats[0].total || 0,
      totalWords: noteStats[0].totalWords || 0,
      favoriteCount: favoriteStats[0].count || 0,
      tagCount: tagStats[0].count || 0,
      categoryDistribution: categoryStats
    }, '获取统计信息成功');
    
  } catch (err) {
    console.error('获取统计信息失败:', err);
    return error(res, '获取统计信息失败', 500);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  getStats
};

