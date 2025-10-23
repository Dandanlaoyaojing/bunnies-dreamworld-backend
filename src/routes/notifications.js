// 通知系统路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const { pool } = require('../config/database');

router.use(authenticate);

// 获取通知列表
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, isRead } = req.query;
    
    let query = `
      SELECT id, type, title, content, data, is_read, created_at, updated_at
      FROM notifications 
      WHERE user_id = ?
    `;
    const params = [userId];
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    if (isRead !== undefined) {
      query += ' AND is_read = ?';
      params.push(isRead === 'true');
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    
    const [notifications] = await pool.query(query, params);
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?';
    const countParams = [userId];
    
    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }
    
    if (isRead !== undefined) {
      countQuery += ' AND is_read = ?';
      countParams.push(isRead === 'true');
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    
    // 获取未读数量
    const [unreadCount] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false',
      [userId]
    );
    
    return success(res, {
      notifications: notifications.map(notification => ({
        ...notification,
        data: notification.data ? JSON.parse(notification.data) : null
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit))
      },
      unreadCount: unreadCount[0].count
    }, '获取通知列表成功');
    
  } catch (err) {
    console.error('获取通知列表失败:', err);
    return error(res, '获取通知列表失败: ' + err.message, 500);
  }
});

// 标记通知为已读
router.put('/:id/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '通知不存在', 404);
    }
    
    return success(res, null, '通知已标记为已读');
    
  } catch (err) {
    console.error('标记通知失败:', err);
    return error(res, '标记通知失败: ' + err.message, 500);
  }
});

// 批量标记为已读
router.put('/batch-read', async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationIds, markAll = false } = req.body;
    
    let result;
    
    if (markAll) {
      // 标记所有通知为已读
      result = await pool.query(
        'UPDATE notifications SET is_read = true, updated_at = NOW() WHERE user_id = ? AND is_read = false',
        [userId]
      );
    } else if (notificationIds && Array.isArray(notificationIds)) {
      // 批量标记指定通知为已读
      const placeholders = notificationIds.map(() => '?').join(',');
      result = await pool.query(
        `UPDATE notifications SET is_read = true, updated_at = NOW() 
         WHERE id IN (${placeholders}) AND user_id = ?`,
        [...notificationIds, userId]
      );
    } else {
      return error(res, '请提供通知ID列表或设置markAll为true', 400);
    }
    
    return success(res, {
      affectedRows: result[0].affectedRows
    }, '批量标记成功');
    
  } catch (err) {
    console.error('批量标记失败:', err);
    return error(res, '批量标记失败: ' + err.message, 500);
  }
});

// 删除通知
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '通知不存在', 404);
    }
    
    return success(res, null, '通知删除成功');
    
  } catch (err) {
    console.error('删除通知失败:', err);
    return error(res, '删除通知失败: ' + err.message, 500);
  }
});

// 批量删除通知
router.delete('/batch-delete', async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationIds, deleteAll = false } = req.body;
    
    let result;
    
    if (deleteAll) {
      // 删除所有通知
      result = await pool.query(
        'DELETE FROM notifications WHERE user_id = ?',
        [userId]
      );
    } else if (notificationIds && Array.isArray(notificationIds)) {
      // 批量删除指定通知
      const placeholders = notificationIds.map(() => '?').join(',');
      result = await pool.query(
        `DELETE FROM notifications WHERE id IN (${placeholders}) AND user_id = ?`,
        [...notificationIds, userId]
      );
    } else {
      return error(res, '请提供通知ID列表或设置deleteAll为true', 400);
    }
    
    return success(res, {
      affectedRows: result[0].affectedRows
    }, '批量删除成功');
    
  } catch (err) {
    console.error('批量删除失败:', err);
    return error(res, '批量删除失败: ' + err.message, 500);
  }
});

// 获取通知统计
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取各类型通知数量
    const [typeStats] = await pool.query(
      `SELECT type, COUNT(*) as count, SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread_count
       FROM notifications 
       WHERE user_id = ?
       GROUP BY type`,
      [userId]
    );
    
    // 获取总统计
    const [totalStats] = await pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread_total,
         SUM(CASE WHEN is_read = true THEN 1 ELSE 0 END) as read_total
       FROM notifications 
       WHERE user_id = ?`,
      [userId]
    );
    
    // 获取最近7天的通知趋势
    const [trendStats] = await pool.query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*) as count
       FROM notifications 
       WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );
    
    return success(res, {
      typeStats,
      totalStats: totalStats[0],
      trendStats,
      generatedAt: new Date().toISOString()
    }, '获取通知统计成功');
    
  } catch (err) {
    console.error('获取通知统计失败:', err);
    return error(res, '获取通知统计失败: ' + err.message, 500);
  }
});

// 创建通知（内部使用）
router.post('/create', async (req, res) => {
  try {
    const { userId, type, title, content, data } = req.body;
    
    if (!userId || !type || !title) {
      return error(res, '用户ID、类型和标题不能为空', 400);
    }
    
    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, content, data, is_read) 
       VALUES (?, ?, ?, ?, ?, false)`,
      [userId, type, title, content || '', data ? JSON.stringify(data) : null]
    );
    
    return success(res, {
      notificationId: result.insertId
    }, '通知创建成功');
    
  } catch (err) {
    console.error('创建通知失败:', err);
    return error(res, '创建通知失败: ' + err.message, 500);
  }
});

// 获取通知详情
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    if (notifications.length === 0) {
      return error(res, '通知不存在', 404);
    }
    
    const notification = notifications[0];
    
    // 自动标记为已读
    await pool.query(
      'UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = ?',
      [id]
    );
    
    return success(res, {
      ...notification,
      data: notification.data ? JSON.parse(notification.data) : null,
      is_read: true
    }, '获取通知详情成功');
    
  } catch (err) {
    console.error('获取通知详情失败:', err);
    return error(res, '获取通知详情失败: ' + err.message, 500);
  }
});

module.exports = router;

