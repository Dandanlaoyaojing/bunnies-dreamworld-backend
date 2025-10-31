// 草稿箱路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// ===== 本模块内辅助方法（与笔记控制器保持一致的返回形态） =====
async function fetchNoteWithTags(noteId, userId) {
  const [rows] = await pool.query(
    `SELECT n.id, n.title, n.content, n.category, n.is_favorite, n.word_count,
            n.created_at, n.updated_at, n.source, n.url, n.category_tag
     FROM notes n
     WHERE n.id = ? AND n.user_id = ?`,
    [noteId, userId]
  );
  if (rows.length === 0) return null;
  
  const note = rows[0];
  
  // 单独查询标签（包含 source 字段）
  const [tagRows] = await pool.query(
    `SELECT t.name, nt.source
     FROM note_tags nt
     JOIN tags t ON nt.tag_id = t.id
     WHERE nt.note_id = ?
     ORDER BY nt.created_at ASC`,
    [noteId]
  );
  
  // 将标签转换为对象数组格式
  note.tags = tagRows.map(row => ({
    name: row.name,
    source: row.source || 'ai' // 兼容旧数据
  }));
  
  return note;
}

async function fetchNotesListForUser(userId, query) {
  const { page = 1, limit = 20, category, favorite } = query || {};
  const offset = (page - 1) * limit;
  
  // 先查询笔记列表（不包含标签）
  const [notes] = await pool.query(
    `SELECT n.id, n.title, n.content, n.category, n.is_favorite, n.word_count,
            n.created_at, n.updated_at, n.source, n.url, n.category_tag
     FROM notes n
     WHERE n.user_id = ? AND n.is_deleted = false
       ${category ? 'AND n.category = ?' : ''}
       ${favorite === 'true' ? 'AND n.is_favorite = true' : ''}
     ORDER BY n.updated_at DESC
     LIMIT ? OFFSET ?`,
    category
      ? [userId, category, parseInt(limit), parseInt(offset)]
      : [userId, parseInt(limit), parseInt(offset)]
  );
  
  // 为每个笔记查询标签（包含 source 字段）
  for (const note of notes) {
    const [tagRows] = await pool.query(
      `SELECT t.name, nt.source
       FROM note_tags nt
       JOIN tags t ON nt.tag_id = t.id
       WHERE nt.note_id = ?
       ORDER BY nt.created_at ASC`,
      [note.id]
    );
    
    // 转换为对象数组格式
    note.tags = tagRows.map(row => ({
      name: row.name,
      source: row.source || 'ai' // 兼容旧数据
    }));
  }
  
  const [countResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM notes n
     WHERE n.user_id = ? AND n.is_deleted = false
       ${category ? 'AND n.category = ?' : ''}
       ${favorite === 'true' ? 'AND n.is_favorite = true' : ''}`,
    category ? [userId, category] : [userId]
  );
  return {
    notes,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult[0].total,
      totalPages: Math.ceil(countResult[0].total / limit)
    }
  };
}

/**
 * 规范化标签格式（兼容字符串和对象格式）
 */
function normalizeTag(tag) {
  if (typeof tag === 'string') {
    return { name: tag.trim(), source: 'ai' };
  } else if (typeof tag === 'object' && tag !== null) {
    // source 可选值：'manual'（手动添加）、'ai'（AI生成）、'origin'（从笔记出处字段生成的）
    const validSource = ['manual', 'ai', 'origin'].includes(tag.source) ? tag.source : 'ai';
    return {
      name: (tag.name || tag).trim(),
      source: validSource
    };
  }
  return null;
}

async function attachTagsToNote(noteId, userId, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return;
  
  for (const tag of tags) {
    // 规范化标签格式（兼容字符串和对象）
    const normalizedTag = normalizeTag(tag);
    
    if (!normalizedTag || !normalizedTag.name) {
      console.warn('⚠️ 跳过无效标签:', tag);
      continue;
    }
    
    const tagName = normalizedTag.name;
    const tagSource = normalizedTag.source || 'ai';
    
    let [existingTags] = await pool.query(
      'SELECT id FROM tags WHERE user_id = ? AND name = ?',
      [userId, tagName]
    );
    let tagId;
    if (existingTags.length > 0) {
      tagId = existingTags[0].id;
      await pool.query('UPDATE tags SET use_count = use_count + 1 WHERE id = ?', [tagId]);
    } else {
      const [result] = await pool.query('INSERT INTO tags (user_id, name, use_count) VALUES (?, ?, 1)', [userId, tagName]);
      tagId = result.insertId;
    }
    
    // 关联标签和笔记（包含 source 字段）
    await pool.query(
      `INSERT INTO note_tags (note_id, tag_id, source) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE source = VALUES(source)`,
      [noteId, tagId, tagSource]
    );
  }
}

// 获取草稿列表
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, sortBy = 'updated_at', sortOrder = 'DESC', page = 1, limit = 20 } = req.query;
    
    console.log(`📋 获取草稿列表: userId=${userId}, page=${page}, limit=${limit}, category=${category || 'all'}`);
    
    let query = 'SELECT * FROM drafts WHERE user_id = ?';
    const params = [userId];
    
    // 分类筛选
    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }
    
    // 排序
    const validSortFields = ['created_at', 'updated_at', 'title', 'word_count'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'updated_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${order}`;
    
    // 分页
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    const [drafts] = await pool.query(query, params);
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM drafts WHERE user_id = ?';
    const countParams = [userId];
    if (category && category !== 'all') {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    
    console.log(`📋 草稿列表查询结果: userId=${userId}, 返回${drafts.length}条, 总数${total}条`);
    
    // 处理草稿数据
    const processedDrafts = drafts.map(draft => ({
      ...draft,
      word_count: draft.content ? draft.content.length : 0,
      preview: draft.content ? draft.content.substring(0, 100) + '...' : '',
      created_at_formatted: new Date(draft.created_at).toLocaleString('zh-CN'),
      updated_at_formatted: new Date(draft.updated_at).toLocaleString('zh-CN')
    }));
    
    // 获取最新更新时间戳（用于前端判断是否需要刷新本地缓存）
    const [latestRow] = await pool.query(
      'SELECT MAX(updated_at) as latest_update FROM drafts WHERE user_id = ?',
      [userId]
    );
    const cacheVersion = latestRow[0].latest_update ? new Date(latestRow[0].latest_update).getTime() : Date.now();
    
    return success(res, {
      drafts: processedDrafts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      // 添加缓存版本标识，前端可以对比本地缓存的版本号，决定是否刷新
      cacheVersion: cacheVersion,
      serverTime: Date.now()
    }, '获取草稿列表成功');
  } catch (err) {
    console.error('获取草稿列表失败:', err);
    return error(res, '获取草稿列表失败', 500);
  }
});

// 获取草稿详情
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const draftId = req.params.id;
    
    const [drafts] = await pool.query(
      'SELECT * FROM drafts WHERE id = ? AND user_id = ?',
      [draftId, userId]
    );
    
    if (drafts.length === 0) {
      return error(res, '草稿不存在', 404);
    }
    
    const draft = drafts[0];
    draft.word_count = draft.content ? draft.content.length : 0;
    
    return success(res, draft, '获取草稿详情成功');
  } catch (err) {
    console.error('获取草稿详情失败:', err);
    return error(res, '获取草稿详情失败', 500);
  }
});

// 保存草稿
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, category, tags } = req.body;
    
    // 验证必填字段
    if (!content) {
      return error(res, '草稿内容不能为空', 400);
    }
    
    const wordCount = content.length;
    const tagsJson = tags ? JSON.stringify(tags) : '[]';
    
    const [result] = await pool.query(
      `INSERT INTO drafts (user_id, title, content, category, tags, word_count) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, title || '', content, category || 'knowledge', tagsJson, wordCount]
    );
    
    return success(res, { 
      id: result.insertId,
      word_count: wordCount
    }, '草稿保存成功', 201);
  } catch (err) {
    console.error('保存草稿失败:', err);
    return error(res, '保存草稿失败', 500);
  }
});

// 更新草稿
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const draftId = req.params.id;
    const { title, content, category, tags } = req.body;
    
    // 检查草稿是否存在
    const [existingDrafts] = await pool.query(
      'SELECT id FROM drafts WHERE id = ? AND user_id = ?',
      [draftId, userId]
    );
    
    if (existingDrafts.length === 0) {
      return error(res, '草稿不存在', 404);
    }
    
    const wordCount = content ? content.length : 0;
    const tagsJson = tags ? JSON.stringify(tags) : '[]';
    
    await pool.query(
      `UPDATE drafts SET title = ?, content = ?, category = ?, tags = ?, 
       word_count = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [title || '', content || '', category || 'knowledge', tagsJson, wordCount, draftId, userId]
    );
    
    return success(res, { 
      id: draftId,
      word_count: wordCount
    }, '草稿更新成功');
  } catch (err) {
    console.error('更新草稿失败:', err);
    return error(res, '更新草稿失败', 500);
  }
});

// 删除草稿
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const draftId = req.params.id;
    
    console.log(`🗑️ 删除草稿请求: userId=${userId}, draftId=${draftId}`);
    
    // 先检查草稿是否存在且属于该用户
    const [checkRows] = await pool.query(
      'SELECT id FROM drafts WHERE id = ? AND user_id = ?',
      [draftId, userId]
    );
    
    if (checkRows.length === 0) {
      console.log(`❌ 草稿不存在或无权限: draftId=${draftId}, userId=${userId}`);
      return error(res, '草稿不存在或无权访问', 404);
    }
    
    // 执行删除
    const [result] = await pool.query(
      'DELETE FROM drafts WHERE id = ? AND user_id = ?',
      [draftId, userId]
    );
    
    console.log(`✅ 删除执行结果: affectedRows=${result.affectedRows}, draftId=${draftId}`);
    
    if (result.affectedRows === 0) {
      console.log(`⚠️ 删除失败: affectedRows为0, draftId=${draftId}`);
      return error(res, '草稿删除失败', 500);
    }
    
    // 查询删除后的剩余草稿总数（便于前端判断是否需要刷新）
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM drafts WHERE user_id = ?',
      [userId]
    );
    const remainingTotal = countResult[0].total;
    
    console.log(`📊 删除后剩余草稿数: ${remainingTotal}`);
    
    return success(res, { 
      deletedId: parseInt(draftId),
      remainingTotal: parseInt(remainingTotal)
    }, '草稿删除成功');
  } catch (err) {
    console.error('❌ 删除草稿异常:', err);
    return error(res, '删除草稿失败', 500);
  }
});

// 批量删除草稿
router.post('/batch-delete', async (req, res) => {
  try {
    const userId = req.user.id;
    const { draftIds } = req.body;
    
    if (!Array.isArray(draftIds) || draftIds.length === 0) {
      return error(res, '请选择要删除的草稿', 400);
    }
    
    const placeholders = draftIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `DELETE FROM drafts WHERE id IN (${placeholders}) AND user_id = ?`,
      [...draftIds, userId]
    );
    
    return success(res, { 
      deletedCount: result.affectedRows 
    }, `成功删除 ${result.affectedRows} 个草稿`);
  } catch (err) {
    console.error('批量删除草稿失败:', err);
    return error(res, '批量删除草稿失败', 500);
  }
});

// 发布草稿为正式笔记
router.post('/:id/publish', async (req, res) => {
  try {
    const userId = req.user.id;
    const draftId = req.params.id;
    
    // 获取草稿信息
    const [drafts] = await pool.query(
      'SELECT * FROM drafts WHERE id = ? AND user_id = ?',
      [draftId, userId]
    );
    
    if (drafts.length === 0) {
      return error(res, '草稿不存在', 404);
    }
    
    const draft = drafts[0];
    let tags = [];
    if (draft.tags) {
      try { tags = JSON.parse(draft.tags); } catch (e) { tags = []; }
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 创建正式笔记（不写入tags列，项目使用 note_tags 维护标签）
      const [noteResult] = await pool.query(
        `INSERT INTO notes (user_id, title, content, category, word_count, is_favorite) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, draft.title || '', draft.content || '', draft.category || 'knowledge', draft.word_count || 0, false]
      );
      
      // 关联标签
      if (tags && tags.length > 0) {
        await attachTagsToNote(noteResult.insertId, userId, tags);
      }

      // 删除草稿
      await pool.query(
        'DELETE FROM drafts WHERE id = ? AND user_id = ?',
        [draftId, userId]
      );
      
      await pool.query('COMMIT');
      // 权威返回：发布后的完整笔记 + 可选列表
      const note = await fetchNoteWithTags(noteResult.insertId, userId);
      let listPayload = null;
      if (req.query.returnList === 'true') {
        listPayload = await fetchNotesListForUser(userId, req.query);
      }
      return success(res, { note, draftId, ...(listPayload ? { list: listPayload } : {}) }, '草稿发布成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('发布草稿失败:', err);
    return error(res, '发布草稿失败', 500);
  }
});

// 批量发布草稿
router.post('/batch-publish', async (req, res) => {
  try {
    const userId = req.user.id;
    const { draftIds } = req.body;
    
    if (!Array.isArray(draftIds) || draftIds.length === 0) {
      return error(res, '请选择要发布的草稿', 400);
    }
    
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };
    
    for (const draftId of draftIds) {
      try {
        // 获取草稿信息
        const [drafts] = await pool.query(
          'SELECT * FROM drafts WHERE id = ? AND user_id = ?',
          [draftId, userId]
        );
        
        if (drafts.length === 0) {
          results.failCount++;
          results.errors.push(`草稿 ${draftId} 不存在`);
          continue;
        }
        
        const draft = drafts[0];
        let tags = [];
        if (draft.tags) {
          try { tags = JSON.parse(draft.tags); } catch (e) { tags = []; }
        }
        
        // 开始事务
        await pool.query('START TRANSACTION');
        
        try {
          // 创建正式笔记（不写入tags列）
          const [noteResult] = await pool.query(
            `INSERT INTO notes (user_id, title, content, category, word_count, is_favorite) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, draft.title || '', draft.content || '', draft.category || 'knowledge', draft.word_count || 0, false]
          );
          if (tags && tags.length > 0) {
            await attachTagsToNote(noteResult.insertId, userId, tags);
          }
          
          // 删除草稿
          await pool.query(
            'DELETE FROM drafts WHERE id = ? AND user_id = ?',
            [draftId, userId]
          );
          
          await pool.query('COMMIT');
          results.successCount++;
        } catch (transactionErr) {
          await pool.query('ROLLBACK');
          results.failCount++;
          results.errors.push(`发布草稿 ${draftId} 失败: ${transactionErr.message}`);
        }
      } catch (err) {
        results.failCount++;
        results.errors.push(`处理草稿 ${draftId} 失败: ${err.message}`);
      }
    }
    
    return success(res, results, `批量发布完成：成功 ${results.successCount} 个，失败 ${results.failCount} 个`);
  } catch (err) {
    console.error('批量发布草稿失败:', err);
    return error(res, '批量发布草稿失败', 500);
  }
});

// 清空草稿箱
router.delete('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [result] = await pool.query(
      'DELETE FROM drafts WHERE user_id = ?',
      [userId]
    );
    
    return success(res, { 
      deletedCount: result.affectedRows 
    }, `成功清空草稿箱，删除了 ${result.affectedRows} 个草稿`);
  } catch (err) {
    console.error('清空草稿箱失败:', err);
    return error(res, '清空草稿箱失败', 500);
  }
});

// 获取草稿统计信息
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN category = 'art' THEN 1 END) as art_count,
        COUNT(CASE WHEN category = 'cute' THEN 1 END) as cute_count,
        COUNT(CASE WHEN category = 'dreams' THEN 1 END) as dreams_count,
        COUNT(CASE WHEN category = 'foods' THEN 1 END) as foods_count,
        COUNT(CASE WHEN category = 'happiness' THEN 1 END) as happiness_count,
        COUNT(CASE WHEN category = 'knowledge' THEN 1 END) as knowledge_count,
        COUNT(CASE WHEN category = 'sights' THEN 1 END) as sights_count,
        COUNT(CASE WHEN category = 'thinking' THEN 1 END) as thinking_count,
        SUM(word_count) as total_words,
        MIN(created_at) as oldest_draft,
        MAX(updated_at) as newest_draft
      FROM drafts 
      WHERE user_id = ?
    `, [userId]);
    
    const stat = stats[0];
    
    return success(res, {
      total_count: parseInt(stat.total_count),
      category_counts: {
        art: parseInt(stat.art_count),
        cute: parseInt(stat.cute_count),
        dreams: parseInt(stat.dreams_count),
        foods: parseInt(stat.foods_count),
        happiness: parseInt(stat.happiness_count),
        knowledge: parseInt(stat.knowledge_count),
        sights: parseInt(stat.sights_count),
        thinking: parseInt(stat.thinking_count)
      },
      total_words: parseInt(stat.total_words) || 0,
      oldest_draft: stat.oldest_draft,
      newest_draft: stat.newest_draft
    }, '获取草稿统计成功');
  } catch (err) {
    console.error('获取草稿统计失败:', err);
    return error(res, '获取草稿统计失败', 500);
  }
});

module.exports = router;

