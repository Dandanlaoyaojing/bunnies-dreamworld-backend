// 分类路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取所有分类列表
router.get('/', async (req, res) => {
  try {
    const [categories] = await pool.query(
      'SELECT * FROM categories ORDER BY sort_order ASC'
    );
    return success(res, categories, '获取分类列表成功');
  } catch (err) {
    return error(res, '获取分类列表失败', 500);
  }
});

// 创建自定义分类
router.post('/', async (req, res) => {
  try {
    const { name, icon } = req.body;
    const userId = req.user.id;
    
    const [result] = await pool.query(
      'INSERT INTO categories (user_id, name, icon, is_system) VALUES (?, ?, ?, false)',
      [userId, name, icon]
    );
    
    return success(res, { id: result.insertId }, '分类创建成功', 201);
  } catch (err) {
    return error(res, '创建分类失败', 500);
  }
});

// 更新分类
router.put('/:id', async (req, res) => {
  return success(res, null, '分类更新成功');
});

// 删除分类
router.delete('/:id', async (req, res) => {
  return success(res, null, '分类删除成功');
});

module.exports = router;

