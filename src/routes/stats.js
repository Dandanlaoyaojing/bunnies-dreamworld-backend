// 统计路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取数据仪表盘
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [noteStats] = await pool.query(
      'SELECT COUNT(*) as total, SUM(word_count) as totalWords FROM notes WHERE user_id = ? AND is_deleted = false',
      [userId]
    );
    
    const [categoryStats] = await pool.query(
      'SELECT category, COUNT(*) as count FROM notes WHERE user_id = ? AND is_deleted = false GROUP BY category',
      [userId]
    );
    
    return success(res, {
      noteCount: noteStats[0].total || 0,
      totalWords: noteStats[0].totalWords || 0,
      categoryDistribution: categoryStats
    }, '获取仪表盘数据成功');
  } catch (err) {
    return error(res, '获取仪表盘数据失败', 500);
  }
});

// 其他统计接口
router.get('/timeline', async (req, res) => {
  return success(res, { timeline: [] }, '获取时间线成功');
});

router.get('/word-cloud', async (req, res) => {
  return success(res, { words: [] }, '获取词云数据成功');
});

router.get('/category-distribution', async (req, res) => {
  return success(res, { distribution: [] }, '获取分类分布成功');
});

router.get('/writing-habits', async (req, res) => {
  return success(res, { habits: {} }, '获取写作习惯成功');
});

module.exports = router;

