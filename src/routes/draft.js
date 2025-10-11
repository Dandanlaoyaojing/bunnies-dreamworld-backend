// 草稿箱路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取草稿列表
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const [drafts] = await pool.query(
      'SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
    return success(res, drafts, '获取草稿列表成功');
  } catch (err) {
    return error(res, '获取草稿列表失败', 500);
  }
});

// 保存草稿
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, category } = req.body;
    
    const [result] = await pool.query(
      'INSERT INTO drafts (user_id, title, content, category) VALUES (?, ?, ?, ?)',
      [userId, title || '', content || '', category || 'knowledge']
    );
    
    return success(res, { id: result.insertId }, '草稿保存成功', 201);
  } catch (err) {
    return error(res, '保存草稿失败', 500);
  }
});

// 更新草稿
router.put('/:id', async (req, res) => {
  return success(res, null, '草稿更新成功');
});

// 删除草稿
router.delete('/:id', async (req, res) => {
  return success(res, null, '草稿删除成功');
});

// 发布草稿为正式笔记
router.post('/:id/publish', async (req, res) => {
  return success(res, null, '草稿发布成功');
});

module.exports = router;

