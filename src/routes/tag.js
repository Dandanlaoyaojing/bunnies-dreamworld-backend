// 标签路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取所有标签列表
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const [tags] = await pool.query(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY use_count DESC',
      [userId]
    );
    return success(res, tags, '获取标签列表成功');
  } catch (err) {
    return error(res, '获取标签列表失败', 500);
  }
});

// 创建标签
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    const userId = req.user.id;
    
    const [result] = await pool.query(
      'INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)',
      [userId, name, color || '#5470C6']
    );
    
    return success(res, { id: result.insertId }, '标签创建成功', 201);
  } catch (err) {
    return error(res, '创建标签失败', 500);
  }
});

// 删除标签
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const tagId = req.params.id;
    
    await pool.query(
      'DELETE FROM tags WHERE id = ? AND user_id = ?',
      [tagId, userId]
    );
    
    return success(res, null, '标签删除成功');
  } catch (err) {
    return error(res, '删除标签失败', 500);
  }
});

module.exports = router;

