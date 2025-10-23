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

// 获取时间线数据
router.get('/timeline', async (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;
    
    let dateFilter = '';
    const params = [userId];
    
    if (year && month) {
      dateFilter = 'AND YEAR(created_at) = ? AND MONTH(created_at) = ?';
      params.push(year, month);
    } else if (year) {
      dateFilter = 'AND YEAR(created_at) = ?';
      params.push(year);
    }
    
    const [timeline] = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as note_count,
        SUM(word_count) as total_words,
        GROUP_CONCAT(DISTINCT category) as categories
       FROM notes 
       WHERE user_id = ? AND is_deleted = false ${dateFilter}
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );
    
    return success(res, { timeline }, '获取时间线成功');
  } catch (err) {
    return error(res, '获取时间线失败', 500);
  }
});

// 获取词云数据
router.get('/word-cloud', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50 } = req.query;
    
    // 获取标签使用统计
    const [tags] = await pool.query(
      `SELECT name, use_count, color 
       FROM tags 
       WHERE user_id = ? 
       ORDER BY use_count DESC 
       LIMIT ?`,
      [userId, parseInt(limit)]
    );
    
    // 获取高频词汇（从笔记标题和内容中提取）
    const [words] = await pool.query(
      `SELECT 
        SUBSTRING_INDEX(SUBSTRING_INDEX(title, ' ', numbers.n), ' ', -1) as word,
        COUNT(*) as frequency
       FROM notes 
       CROSS JOIN (
         SELECT 1 n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
       ) numbers
       WHERE user_id = ? 
         AND is_deleted = false 
         AND CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(title, ' ', numbers.n), ' ', -1)) > 1
       GROUP BY word
       HAVING frequency > 1
       ORDER BY frequency DESC
       LIMIT ?`,
      [userId, parseInt(limit)]
    );
    
    return success(res, { 
      tags: tags.map(tag => ({
        text: tag.name,
        weight: tag.use_count,
        color: tag.color
      })),
      words: words.map(word => ({
        text: word.word,
        weight: word.frequency
      }))
    }, '获取词云数据成功');
  } catch (err) {
    return error(res, '获取词云数据失败', 500);
  }
});

// 获取分类分布
router.get('/category-distribution', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [distribution] = await pool.query(
      `SELECT 
        category,
        COUNT(*) as count,
        SUM(word_count) as total_words,
        AVG(word_count) as avg_words,
        MAX(created_at) as last_note_time
       FROM notes 
       WHERE user_id = ? AND is_deleted = false
       GROUP BY category
       ORDER BY count DESC`,
      [userId]
    );
    
    // 获取分类图标信息
    const [categories] = await pool.query(
      'SELECT name, icon FROM categories WHERE is_system = true'
    );
    
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.name] = cat.icon;
    });
    
    const result = distribution.map(item => ({
      ...item,
      icon: categoryMap[item.category] || 'default.png',
      percentage: 0 // 将在前端计算
    }));
    
    return success(res, { distribution: result }, '获取分类分布成功');
  } catch (err) {
    return error(res, '获取分类分布失败', 500);
  }
});

// 获取写作习惯分析
router.get('/writing-habits', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 按小时统计写作时间
    const [hourlyStats] = await pool.query(
      `SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as count
       FROM notes 
       WHERE user_id = ? AND is_deleted = false
       GROUP BY HOUR(created_at)
       ORDER BY hour`,
      [userId]
    );
    
    // 按星期统计写作时间
    const [weeklyStats] = await pool.query(
      `SELECT 
        DAYOFWEEK(created_at) as day_of_week,
        COUNT(*) as count
       FROM notes 
       WHERE user_id = ? AND is_deleted = false
       GROUP BY DAYOFWEEK(created_at)
       ORDER BY day_of_week`,
      [userId]
    );
    
    // 按月份统计写作时间
    const [monthlyStats] = await pool.query(
      `SELECT 
        MONTH(created_at) as month,
        COUNT(*) as count,
        SUM(word_count) as total_words
       FROM notes 
       WHERE user_id = ? AND is_deleted = false
       GROUP BY MONTH(created_at)
       ORDER BY month`,
      [userId]
    );
    
    // 计算平均写作长度
    const [avgLength] = await pool.query(
      `SELECT 
        AVG(word_count) as avg_word_count,
        MAX(word_count) as max_word_count,
        MIN(word_count) as min_word_count
       FROM notes 
       WHERE user_id = ? AND is_deleted = false`,
      [userId]
    );
    
    // 获取最活跃的写作时间段
    const mostActiveHour = hourlyStats.reduce((max, current) => 
      current.count > max.count ? current : max, hourlyStats[0] || { hour: 0, count: 0 }
    );
    
    const mostActiveDay = weeklyStats.reduce((max, current) => 
      current.count > max.count ? current : max, weeklyStats[0] || { day_of_week: 1, count: 0 }
    );
    
    const habits = {
      hourlyDistribution: hourlyStats,
      weeklyDistribution: weeklyStats,
      monthlyDistribution: monthlyStats,
      averageLength: avgLength[0],
      mostActiveHour: mostActiveHour,
      mostActiveDay: mostActiveDay,
      totalNotes: hourlyStats.reduce((sum, item) => sum + item.count, 0)
    };
    
    return success(res, { habits }, '获取写作习惯成功');
  } catch (err) {
    return error(res, '获取写作习惯失败', 500);
  }
});

// 获取详细统计报告
router.get('/report', async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30' } = req.query; // 默认30天
    
    // 基础统计
    const [basicStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_notes,
        SUM(word_count) as total_words,
        AVG(word_count) as avg_words_per_note,
        COUNT(DISTINCT category) as categories_used,
        COUNT(DISTINCT DATE(created_at)) as active_days
       FROM notes 
       WHERE user_id = ? 
         AND is_deleted = false 
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [userId, parseInt(period)]
    );
    
    // 最近活动
    const [recentActivity] = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as notes_count,
        SUM(word_count) as words_count
       FROM notes 
       WHERE user_id = ? AND is_deleted = false
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 7`,
      [userId]
    );
    
    // 热门标签
    const [popularTags] = await pool.query(
      `SELECT name, use_count, color
       FROM tags 
       WHERE user_id = ?
       ORDER BY use_count DESC
       LIMIT 10`,
      [userId]
    );
    
    // 分类统计
    const [categoryStats] = await pool.query(
      `SELECT 
        category,
        COUNT(*) as count,
        SUM(word_count) as total_words
       FROM notes 
       WHERE user_id = ? AND is_deleted = false
       GROUP BY category
       ORDER BY count DESC`,
      [userId]
    );
    
    const report = {
      period: `${period}天`,
      basicStats: basicStats[0],
      recentActivity,
      popularTags,
      categoryStats,
      generatedAt: new Date().toISOString()
    };
    
    return success(res, { report }, '获取统计报告成功');
  } catch (err) {
    return error(res, '获取统计报告失败', 500);
  }
});

module.exports = router;

