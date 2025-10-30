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
            n.created_at, n.updated_at, n.source, n.url, n.category_tag,
            GROUP_CONCAT(t.name) AS tags
     FROM notes n
     LEFT JOIN note_tags nt ON n.id = nt.note_id
     LEFT JOIN tags t ON nt.tag_id = t.id
     WHERE n.id = ? AND n.user_id = ?
     GROUP BY n.id`,
    [noteId, userId]
  );
  if (rows.length === 0) return null;
  const note = rows[0];
  note.tags = note.tags ? note.tags.split(',') : [];
  return note;
}

async function fetchNotesListForUser(userId, query) {
  const { page = 1, limit = 20, category, favorite } = query || {};
  const offset = (page - 1) * limit;
  const [notes] = await pool.query(
    `SELECT n.id, n.title, n.content, n.category, n.is_favorite, n.word_count,
            n.created_at, n.updated_at, n.source, n.url, n.category_tag,
            GROUP_CONCAT(t.name) AS tags
     FROM notes n
     LEFT JOIN note_tags nt ON n.id = nt.note_id
     LEFT JOIN tags t ON nt.tag_id = t.id
     WHERE n.user_id = ? AND n.is_deleted = false
       ${category ? 'AND n.category = ?' : ''}
       ${favorite === 'true' ? 'AND n.is_favorite = true' : ''}
     GROUP BY n.id
     ORDER BY n.updated_at DESC
     LIMIT ? OFFSET ?`,
    category
      ? [userId, category, parseInt(limit), parseInt(offset)]
      : [userId, parseInt(limit), parseInt(offset)]
  );
  notes.forEach(n => { n.tags = n.tags ? n.tags.split(',') : []; });
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

async function attachTagsToNote(noteId, userId, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return;
  for (const tagName of tags) {
    if (!tagName) continue;
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
    await pool.query('INSERT IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tagId]);
  }
}

// 获取草稿列表
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, sortBy = 'updated_at', sortOrder = 'DESC', page = 1, limit = 20 } = req.query;
    
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
    
    // 处理草稿数据
    const processedDrafts = drafts.map(draft => ({
      ...draft,
      word_count: draft.content ? draft.content.length : 0,
      preview: draft.content ? draft.content.substring(0, 100) + '...' : '',
      created_at_formatted: new Date(draft.created_at).toLocaleString('zh-CN'),
      updated_at_formatted: new Date(draft.updated_at).toLocaleString('zh-CN')
    }));
    
    return success(res, {
      drafts: processedDrafts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
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
    
    const [result] = await pool.query(
      'DELETE FROM drafts WHERE id = ? AND user_id = ?',
      [draftId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '草稿不存在', 404);
    }
    
    return success(res, null, '草稿删除成功');
  } catch (err) {
    console.error('删除草稿失败:', err);
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

