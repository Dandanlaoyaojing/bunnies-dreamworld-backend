// 收藏夹路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取收藏列表
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'all', sortBy = 'favorite_time', sortOrder = 'DESC', page = 1, limit = 20 } = req.query;
    
    let query, params;
    
    if (type === 'all') {
      // 获取所有类型的收藏
      query = `
        SELECT 
          'note' as type,
          n.id,
          n.title as name,
          n.content,
          n.category,
          n.tags,
          n.word_count,
          n.is_favorite as favorite_status,
          n.created_at,
          n.updated_at,
          f.created_at as favorite_time
        FROM favorites f
        JOIN notes n ON f.item_id = n.id AND f.item_type = 'note'
        WHERE f.user_id = ? AND n.user_id = ?
        
        UNION ALL
        
        SELECT 
          'knowledge' as type,
          k.id,
          k.name,
          k.description as content,
          k.category,
          '[]' as tags,
          LENGTH(k.description) as word_count,
          true as favorite_status,
          k.created_at,
          k.updated_at,
          f.created_at as favorite_time
        FROM favorites f
        JOIN knowledge_nodes k ON f.item_id = k.id AND f.item_type = 'knowledge'
        WHERE f.user_id = ? AND k.user_id = ?
        
        UNION ALL
        
        SELECT 
          'dream' as type,
          d.id,
          d.title as name,
          d.content,
          d.dream_type as category,
          '[]' as tags,
          LENGTH(d.content) as word_count,
          true as favorite_status,
          d.created_at,
          d.updated_at,
          f.created_at as favorite_time
        FROM favorites f
        JOIN dreams d ON f.item_id = d.id AND f.item_type = 'dream'
        WHERE f.user_id = ? AND d.user_id = ?
      `;
      params = [userId, userId, userId, userId, userId, userId];
    } else {
      // 获取特定类型的收藏
      query = `
        SELECT 
          f.item_type as type,
          f.item_id as id,
          f.created_at as favorite_time,
          f.updated_at
        FROM favorites f
        WHERE f.user_id = ? AND f.item_type = ?
      `;
      params = [userId, type];
      
      // 根据类型获取详细信息
      if (type === 'note') {
        query = `
          SELECT 
            'note' as type,
            n.id,
            n.title as name,
            n.content,
            n.category,
            n.tags,
            n.word_count,
            n.is_favorite as favorite_status,
            n.created_at,
            n.updated_at,
            f.created_at as favorite_time
          FROM favorites f
          JOIN notes n ON f.item_id = n.id
          WHERE f.user_id = ? AND f.item_type = 'note'
        `;
        params = [userId];
      } else if (type === 'knowledge') {
        query = `
          SELECT 
            'knowledge' as type,
            k.id,
            k.name,
            k.description as content,
            k.category,
            '[]' as tags,
            LENGTH(k.description) as word_count,
            true as favorite_status,
            k.created_at,
            k.updated_at,
            f.created_at as favorite_time
          FROM favorites f
          JOIN knowledge_nodes k ON f.item_id = k.id
          WHERE f.user_id = ? AND f.item_type = 'knowledge'
        `;
        params = [userId];
      } else if (type === 'dream') {
        query = `
          SELECT 
            'dream' as type,
            d.id,
            d.title as name,
            d.content,
            d.dream_type as category,
            '[]' as tags,
            LENGTH(d.content) as word_count,
            true as favorite_status,
            d.created_at,
            d.updated_at,
            f.created_at as favorite_time
          FROM favorites f
          JOIN dreams d ON f.item_id = d.id
          WHERE f.user_id = ? AND f.item_type = 'dream'
        `;
        params = [userId];
      }
    }
    
    // 添加排序
    const validSortFields = ['favorite_time', 'created_at', 'name', 'word_count'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'favorite_time';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${order}`;
    
    // 添加分页
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [favorites] = await pool.query(query, params);
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?';
    const countParams = [userId];
    if (type !== 'all') {
      countQuery += ' AND item_type = ?';
      countParams.push(type);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    
    // 处理收藏数据
    const processedFavorites = favorites.map(item => ({
      ...item,
      tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags,
      favorite_time_formatted: new Date(item.favorite_time).toLocaleString('zh-CN'),
      created_at_formatted: new Date(item.created_at).toLocaleString('zh-CN')
    }));
    
    return success(res, {
      favorites: processedFavorites,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }, '获取收藏列表成功');
  } catch (err) {
    console.error('获取收藏列表失败:', err);
    return error(res, '获取收藏列表失败', 500);
  }
});

// 添加收藏
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id, item_type } = req.body;
    
    // 验证参数
    if (!item_id || !item_type) {
      return error(res, '缺少必要参数', 400);
    }
    
    const validTypes = ['note', 'knowledge', 'dream'];
    if (!validTypes.includes(item_type)) {
      return error(res, '无效的收藏类型', 400);
    }
    
    // 检查是否已收藏
    const [existing] = await pool.query(
      'SELECT id FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
      [userId, item_id, item_type]
    );
    
    if (existing.length > 0) {
      return error(res, '已经收藏过了', 400);
    }
    
    // 验证项目是否存在
    let itemExists = false;
    if (item_type === 'note') {
      const [notes] = await pool.query('SELECT id FROM notes WHERE id = ? AND user_id = ?', [item_id, userId]);
      itemExists = notes.length > 0;
    } else if (item_type === 'knowledge') {
      const [knowledge] = await pool.query('SELECT id FROM knowledge_nodes WHERE id = ? AND user_id = ?', [item_id, userId]);
      itemExists = knowledge.length > 0;
    } else if (item_type === 'dream') {
      const [dreams] = await pool.query('SELECT id FROM dreams WHERE id = ? AND user_id = ?', [item_id, userId]);
      itemExists = dreams.length > 0;
    }
    
    if (!itemExists) {
      return error(res, '要收藏的项目不存在', 404);
    }
    
    // 添加收藏
    const [result] = await pool.query(
      'INSERT INTO favorites (user_id, item_id, item_type) VALUES (?, ?, ?)',
      [userId, item_id, item_type]
    );
    
    // 如果是笔记，更新is_favorite字段
    if (item_type === 'note') {
      await pool.query(
        'UPDATE notes SET is_favorite = true WHERE id = ? AND user_id = ?',
        [item_id, userId]
      );
    }
    
    return success(res, { 
      id: result.insertId,
      item_id,
      item_type
    }, '收藏成功', 201);
  } catch (err) {
    console.error('添加收藏失败:', err);
    return error(res, '添加收藏失败', 500);
  }
});

// 取消收藏
router.delete('/:item_id/:item_type', async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id, item_type } = req.params;
    
    const validTypes = ['note', 'knowledge', 'dream'];
    if (!validTypes.includes(item_type)) {
      return error(res, '无效的收藏类型', 400);
    }
    
    const [result] = await pool.query(
      'DELETE FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
      [userId, item_id, item_type]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '收藏记录不存在', 404);
    }
    
    // 如果是笔记，更新is_favorite字段
    if (item_type === 'note') {
      await pool.query(
        'UPDATE notes SET is_favorite = false WHERE id = ? AND user_id = ?',
        [item_id, userId]
      );
    }
    
    return success(res, null, '取消收藏成功');
  } catch (err) {
    console.error('取消收藏失败:', err);
    return error(res, '取消收藏失败', 500);
  }
});

// 批量取消收藏
router.post('/batch-remove', async (req, res) => {
  try {
    const userId = req.user.id;
    const { favorites } = req.body; // [{ item_id, item_type }]
    
    if (!Array.isArray(favorites) || favorites.length === 0) {
      return error(res, '请选择要取消收藏的项目', 400);
    }
    
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };
    
    for (const favorite of favorites) {
      try {
        const { item_id, item_type } = favorite;
        
        if (!item_id || !item_type) {
          results.failCount++;
          results.errors.push('缺少必要参数');
          continue;
        }
        
        const validTypes = ['note', 'knowledge', 'dream'];
        if (!validTypes.includes(item_type)) {
          results.failCount++;
          results.errors.push(`无效的收藏类型: ${item_type}`);
          continue;
        }
        
        const [result] = await pool.query(
          'DELETE FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
          [userId, item_id, item_type]
        );
        
        if (result.affectedRows > 0) {
          // 如果是笔记，更新is_favorite字段
          if (item_type === 'note') {
            await pool.query(
              'UPDATE notes SET is_favorite = false WHERE id = ? AND user_id = ?',
              [item_id, userId]
            );
          }
          results.successCount++;
        } else {
          results.failCount++;
          results.errors.push(`收藏记录不存在: ${item_id}`);
        }
      } catch (err) {
        results.failCount++;
        results.errors.push(`处理失败: ${err.message}`);
      }
    }
    
    return success(res, results, `批量取消收藏完成：成功 ${results.successCount} 个，失败 ${results.failCount} 个`);
  } catch (err) {
    console.error('批量取消收藏失败:', err);
    return error(res, '批量取消收藏失败', 500);
  }
});

// 清空收藏夹
router.delete('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query; // 可选：只清空特定类型
    
    let query = 'DELETE FROM favorites WHERE user_id = ?';
    const params = [userId];
    
    if (type) {
      query += ' AND item_type = ?';
      params.push(type);
    }
    
    const [result] = await pool.query(query, params);
    
    // 如果是清空笔记收藏，需要更新notes表的is_favorite字段
    if (!type || type === 'note') {
      await pool.query(
        'UPDATE notes SET is_favorite = false WHERE user_id = ?',
        [userId]
      );
    }
    
    return success(res, { 
      deletedCount: result.affectedRows 
    }, `成功清空收藏夹，删除了 ${result.affectedRows} 个收藏`);
  } catch (err) {
    console.error('清空收藏夹失败:', err);
    return error(res, '清空收藏夹失败', 500);
  }
});

// 检查收藏状态
router.get('/check/:item_id/:item_type', async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id, item_type } = req.params;
    
    const validTypes = ['note', 'knowledge', 'dream'];
    if (!validTypes.includes(item_type)) {
      return error(res, '无效的收藏类型', 400);
    }
    
    const [favorites] = await pool.query(
      'SELECT id, created_at FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
      [userId, item_id, item_type]
    );
    
    return success(res, {
      is_favorite: favorites.length > 0,
      favorite_time: favorites.length > 0 ? favorites[0].created_at : null
    }, '检查收藏状态成功');
  } catch (err) {
    console.error('检查收藏状态失败:', err);
    return error(res, '检查收藏状态失败', 500);
  }
});

// 获取收藏统计信息
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN item_type = 'note' THEN 1 END) as note_count,
        COUNT(CASE WHEN item_type = 'knowledge' THEN 1 END) as knowledge_count,
        COUNT(CASE WHEN item_type = 'dream' THEN 1 END) as dream_count,
        MIN(created_at) as first_favorite,
        MAX(created_at) as latest_favorite
      FROM favorites 
      WHERE user_id = ?
    `, [userId]);
    
    const stat = stats[0];
    
    // 获取收藏的笔记总字数
    const [wordStats] = await pool.query(`
      SELECT SUM(n.word_count) as total_words
      FROM favorites f
      JOIN notes n ON f.item_id = n.id
      WHERE f.user_id = ? AND f.item_type = 'note'
    `, [userId]);
    
    return success(res, {
      total_count: parseInt(stat.total_count),
      type_counts: {
        note: parseInt(stat.note_count),
        knowledge: parseInt(stat.knowledge_count),
        dream: parseInt(stat.dream_count)
      },
      total_words: parseInt(wordStats[0]?.total_words) || 0,
      first_favorite: stat.first_favorite,
      latest_favorite: stat.latest_favorite,
      favorite_days: stat.first_favorite ? 
        Math.ceil((new Date(stat.latest_favorite) - new Date(stat.first_favorite)) / (1000 * 60 * 60 * 24)) + 1 : 0
    }, '获取收藏统计成功');
  } catch (err) {
    console.error('获取收藏统计失败:', err);
    return error(res, '获取收藏统计失败', 500);
  }
});

// 搜索收藏
router.get('/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyword, type = 'all', page = 1, limit = 20 } = req.query;
    
    if (!keyword || keyword.trim() === '') {
      return error(res, '请输入搜索关键词', 400);
    }
    
    const searchKeyword = `%${keyword.trim()}%`;
    let query, params;
    
    if (type === 'all') {
      query = `
        SELECT 
          'note' as type,
          n.id,
          n.title as name,
          n.content,
          n.category,
          n.tags,
          n.word_count,
          n.is_favorite as favorite_status,
          n.created_at,
          n.updated_at,
          f.created_at as favorite_time
        FROM favorites f
        JOIN notes n ON f.item_id = n.id AND f.item_type = 'note'
        WHERE f.user_id = ? AND (n.title LIKE ? OR n.content LIKE ?)
        
        UNION ALL
        
        SELECT 
          'knowledge' as type,
          k.id,
          k.name,
          k.description as content,
          k.category,
          '[]' as tags,
          LENGTH(k.description) as word_count,
          true as favorite_status,
          k.created_at,
          k.updated_at,
          f.created_at as favorite_time
        FROM favorites f
        JOIN knowledge_nodes k ON f.item_id = k.id AND f.item_type = 'knowledge'
        WHERE f.user_id = ? AND k.name LIKE ?
        
        UNION ALL
        
        SELECT 
          'dream' as type,
          d.id,
          d.title as name,
          d.content,
          d.dream_type as category,
          '[]' as tags,
          LENGTH(d.content) as word_count,
          true as favorite_status,
          d.created_at,
          d.updated_at,
          f.created_at as favorite_time
        FROM favorites f
        JOIN dreams d ON f.item_id = d.id AND f.item_type = 'dream'
        WHERE f.user_id = ? AND (d.title LIKE ? OR d.content LIKE ?)
        
        ORDER BY favorite_time DESC
      `;
      params = [userId, searchKeyword, searchKeyword, userId, searchKeyword, userId, searchKeyword, searchKeyword];
    } else {
      // 根据类型搜索
      if (type === 'note') {
        query = `
          SELECT 
            'note' as type,
            n.id,
            n.title as name,
            n.content,
            n.category,
            n.tags,
            n.word_count,
            n.is_favorite as favorite_status,
            n.created_at,
            n.updated_at,
            f.created_at as favorite_time
          FROM favorites f
          JOIN notes n ON f.item_id = n.id
          WHERE f.user_id = ? AND f.item_type = 'note' 
          AND (n.title LIKE ? OR n.content LIKE ?)
          ORDER BY f.created_at DESC
        `;
        params = [userId, searchKeyword, searchKeyword];
      } else if (type === 'knowledge') {
        query = `
          SELECT 
            'knowledge' as type,
            k.id,
            k.name,
            k.description as content,
            k.category,
            '[]' as tags,
            LENGTH(k.description) as word_count,
            true as favorite_status,
            k.created_at,
            k.updated_at,
            f.created_at as favorite_time
          FROM favorites f
          JOIN knowledge_nodes k ON f.item_id = k.id
          WHERE f.user_id = ? AND f.item_type = 'knowledge' 
          AND k.name LIKE ?
          ORDER BY f.created_at DESC
        `;
        params = [userId, searchKeyword];
      } else if (type === 'dream') {
        query = `
          SELECT 
            'dream' as type,
            d.id,
            d.title as name,
            d.content,
            d.dream_type as category,
            '[]' as tags,
            LENGTH(d.content) as word_count,
            true as favorite_status,
            d.created_at,
            d.updated_at,
            f.created_at as favorite_time
          FROM favorites f
          JOIN dreams d ON f.item_id = d.id
          WHERE f.user_id = ? AND f.item_type = 'dream' 
          AND (d.title LIKE ? OR d.content LIKE ?)
          ORDER BY f.created_at DESC
        `;
        params = [userId, searchKeyword, searchKeyword];
      }
    }
    
    // 添加分页
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [favorites] = await pool.query(query, params);
    
    // 处理搜索结果
    const processedFavorites = favorites.map(item => ({
      ...item,
      tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags,
      favorite_time_formatted: new Date(item.favorite_time).toLocaleString('zh-CN'),
      created_at_formatted: new Date(item.created_at).toLocaleString('zh-CN')
    }));
    
    return success(res, {
      favorites: processedFavorites,
      keyword,
      type,
      count: favorites.length
    }, '搜索收藏成功');
  } catch (err) {
    console.error('搜索收藏失败:', err);
    return error(res, '搜索收藏失败', 500);
  }
});

module.exports = router;
