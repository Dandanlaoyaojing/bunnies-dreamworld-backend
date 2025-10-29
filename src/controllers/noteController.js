// 笔记控制器
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');
const { sanitizeHtml } = require('../middleware/validator');

/**
 * 获取用户笔记列表
 * GET /api/v1/notes
 */
async function getNotes(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, category, favorite } = req.query;
    
    const offset = (page - 1) * limit;
    
    let whereConditions = ['user_id = ?', 'is_deleted = false'];
    let params = [userId];
    
    if (category) {
      whereConditions.push('category = ?');
      params.push(category);
    }
    
    if (favorite === 'true') {
      whereConditions.push('is_favorite = true');
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // 查询笔记列表（包含标签信息）
    const [notes] = await pool.query(
      `SELECT n.id, n.title, n.content, n.category, n.is_favorite, n.word_count, 
              n.created_at, n.updated_at, n.source, n.url, n.category_tag,
              GROUP_CONCAT(t.name) as tags
       FROM notes n 
       LEFT JOIN note_tags nt ON n.id = nt.note_id 
       LEFT JOIN tags t ON nt.tag_id = t.id 
       WHERE ${whereClause.replace('user_id = ?', 'n.user_id = ?')} 
       GROUP BY n.id
       ORDER BY n.updated_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    
    // 处理标签数据
    notes.forEach(note => {
      note.tags = note.tags ? note.tags.split(',') : [];
    });
    
    // 查询总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notes WHERE ${whereClause}`,
      params
    );
    
    return success(res, {
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    }, '获取笔记列表成功');
    
  } catch (err) {
    console.error('获取笔记列表失败:', err);
    return error(res, '获取笔记列表失败', 500);
  }
}

/**
 * 获取单条笔记详情
 * GET /api/v1/notes/:id
 */
async function getNoteById(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    
    const [notes] = await pool.query(
      `SELECT n.*, GROUP_CONCAT(t.name) as tags 
       FROM notes n 
       LEFT JOIN note_tags nt ON n.id = nt.note_id 
       LEFT JOIN tags t ON nt.tag_id = t.id 
       WHERE n.id = ? AND n.user_id = ? 
       GROUP BY n.id`,
      [noteId, userId]
    );
    
    if (notes.length === 0) {
      return error(res, '笔记不存在', 404);
    }
    
    const note = notes[0];
    note.tags = note.tags ? note.tags.split(',') : [];
    
    return success(res, note, '获取笔记详情成功');
    
  } catch (err) {
    console.error('获取笔记详情失败:', err);
    return error(res, '获取笔记详情失败', 500);
  }
}

/**
 * 创建笔记
 * POST /api/v1/notes
 */
async function createNote(req, res) {
  try {
    const userId = req.user.id;
    const { title, content, category = 'knowledge', tags = [], source, url, category_tag } = req.body;
    
    if (!title || !content) {
      return error(res, '标题和内容不能为空');
    }
    
    // 计算字数
    const wordCount = content.replace(/\s/g, '').length;
    
    // 清理HTML标签（XSS防护）
    const sanitizedTitle = sanitizeHtml(title);
    const sanitizedContent = sanitizeHtml(content);
    
    // 插入笔记（包含新字段）
    const [result] = await pool.query(
      'INSERT INTO notes (user_id, title, content, category, word_count, source, url, category_tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, sanitizedTitle, sanitizedContent, category, wordCount, source || null, url || null, category_tag || null]
    );
    
    const noteId = result.insertId;
    
    // 处理标签
    if (tags && tags.length > 0) {
      await attachTags(noteId, userId, tags);
    }
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'create_note', 'note', noteId]
    );
    
    return success(res, { id: noteId }, '笔记创建成功', 201);
    
  } catch (err) {
    console.error('创建笔记失败:', err);
    return error(res, '创建笔记失败', 500);
  }
}

/**
 * 更新笔记
 * PUT /api/v1/notes/:id
 */
async function updateNote(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    const { title, content, category, tags, source, url, category_tag } = req.body;
    
    // 验证笔记所有权
    const [notes] = await pool.query(
      'SELECT id FROM notes WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    if (notes.length === 0) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    const updates = [];
    const values = [];
    
    if (title) {
      updates.push('title = ?');
      values.push(sanitizeHtml(title));
    }
    
    if (content) {
      updates.push('content = ?');
      values.push(sanitizeHtml(content));
      
      // 更新字数
      const wordCount = content.replace(/\s/g, '').length;
      updates.push('word_count = ?');
      values.push(wordCount);
    }
    
    if (category) {
      updates.push('category = ?');
      values.push(category);
    }
    
    if (source !== undefined) {
      updates.push('source = ?');
      values.push(source || null);
    }
    
    if (url !== undefined) {
      updates.push('url = ?');
      values.push(url || null);
    }
    
    if (category_tag !== undefined) {
      updates.push('category_tag = ?');
      values.push(category_tag || null);
    }
    
    if (updates.length > 0) {
      values.push(noteId);
      await pool.query(
        `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    // 更新标签
    if (tags) {
      // 删除旧标签
      await pool.query('DELETE FROM note_tags WHERE note_id = ?', [noteId]);
      // 添加新标签
      if (tags.length > 0) {
        await attachTags(noteId, userId, tags);
      }
    }
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'update_note', 'note', noteId]
    );
    
    return success(res, null, '笔记更新成功');
    
  } catch (err) {
    console.error('更新笔记失败:', err);
    return error(res, '更新笔记失败', 500);
  }
}

/**
 * 删除笔记（软删除）
 * DELETE /api/v1/notes/:id
 */
async function deleteNote(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    
    const [result] = await pool.query(
      'UPDATE notes SET is_deleted = true, deleted_at = NOW() WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'delete_note', 'note', noteId]
    );
    
    return success(res, null, '笔记已移至回收站');
    
  } catch (err) {
    console.error('删除笔记失败:', err);
    return error(res, '删除笔记失败', 500);
  }
}

/**
 * 批量删除笔记
 * POST /api/v1/notes/batch-delete
 */
async function batchDeleteNotes(req, res) {
  try {
    const userId = req.user.id;
    const { noteIds } = req.body;
    
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return error(res, '请提供要删除的笔记ID列表');
    }
    
    const placeholders = noteIds.map(() => '?').join(',');
    
    const [result] = await pool.query(
      `UPDATE notes SET is_deleted = true, deleted_at = NOW() 
       WHERE id IN (${placeholders}) AND user_id = ?`,
      [...noteIds, userId]
    );
    
    return success(res, { deletedCount: result.affectedRows }, '批量删除成功');
    
  } catch (err) {
    console.error('批量删除失败:', err);
    return error(res, '批量删除失败', 500);
  }
}

/**
 * 恢复已删除的笔记
 * POST /api/v1/notes/:id/restore
 */
async function restoreNote(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    
    const [result] = await pool.query(
      'UPDATE notes SET is_deleted = false, deleted_at = NULL WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    return success(res, null, '笔记恢复成功');
    
  } catch (err) {
    console.error('恢复笔记失败:', err);
    return error(res, '恢复笔记失败', 500);
  }
}

/**
 * 永久删除笔记
 * DELETE /api/v1/notes/:id/permanent
 */
async function permanentDeleteNote(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    
    const [result] = await pool.query(
      'DELETE FROM notes WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    return success(res, null, '笔记已永久删除');
    
  } catch (err) {
    console.error('永久删除笔记失败:', err);
    return error(res, '永久删除笔记失败', 500);
  }
}

/**
 * 搜索笔记
 * GET /api/v1/notes/search
 */
async function searchNotes(req, res) {
  try {
    const userId = req.user.id;
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q) {
      return error(res, '请提供搜索关键词');
    }
    
    const offset = (page - 1) * limit;
    const searchTerm = `%${q}%`;
    
    const [notes] = await pool.query(
      `SELECT id, title, content, category, is_favorite, word_count, created_at, updated_at 
       FROM notes 
       WHERE user_id = ? AND is_deleted = false 
       AND (title LIKE ? OR content LIKE ?) 
       ORDER BY updated_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, searchTerm, searchTerm, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notes 
       WHERE user_id = ? AND is_deleted = false 
       AND (title LIKE ? OR content LIKE ?)`,
      [userId, searchTerm, searchTerm]
    );
    
    return success(res, {
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    }, '搜索成功');
    
  } catch (err) {
    console.error('搜索笔记失败:', err);
    return error(res, '搜索笔记失败', 500);
  }
}

/**
 * 按分类获取笔记
 * GET /api/v1/notes/by-category/:category
 */
async function getNotesByCategory(req, res) {
  try {
    const userId = req.user.id;
    const category = req.params.category;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const [notes] = await pool.query(
      `SELECT id, title, content, category, is_favorite, word_count, created_at, updated_at 
       FROM notes 
       WHERE user_id = ? AND category = ? AND is_deleted = false 
       ORDER BY updated_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, category, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND category = ? AND is_deleted = false',
      [userId, category]
    );
    
    return success(res, {
      notes,
      category,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    }, '获取分类笔记成功');
    
  } catch (err) {
    console.error('获取分类笔记失败:', err);
    return error(res, '获取分类笔记失败', 500);
  }
}

/**
 * 按标签获取笔记
 * GET /api/v1/notes/by-tag/:tag
 */
async function getNotesByTag(req, res) {
  try {
    const userId = req.user.id;
    const tagName = req.params.tag;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const [notes] = await pool.query(
      `SELECT DISTINCT n.id, n.title, n.content, n.category, n.is_favorite, n.word_count, n.created_at, n.updated_at 
       FROM notes n 
       JOIN note_tags nt ON n.id = nt.note_id 
       JOIN tags t ON nt.tag_id = t.id 
       WHERE n.user_id = ? AND t.name = ? AND n.is_deleted = false 
       ORDER BY n.updated_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, tagName, parseInt(limit), parseInt(offset)]
    );
    
    return success(res, { notes, tag: tagName }, '获取标签笔记成功');
    
  } catch (err) {
    console.error('获取标签笔记失败:', err);
    return error(res, '获取标签笔记失败', 500);
  }
}

/**
 * 收藏笔记
 * POST /api/v1/notes/:id/favorite
 */
async function favoriteNote(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    
    const [result] = await pool.query(
      'UPDATE notes SET is_favorite = true WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    return success(res, null, '已收藏');
    
  } catch (err) {
    console.error('收藏笔记失败:', err);
    return error(res, '收藏笔记失败', 500);
  }
}

/**
 * 取消收藏
 * DELETE /api/v1/notes/:id/favorite
 */
async function unfavoriteNote(req, res) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;
    
    const [result] = await pool.query(
      'UPDATE notes SET is_favorite = false WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    return success(res, null, '已取消收藏');
    
  } catch (err) {
    console.error('取消收藏失败:', err);
    return error(res, '取消收藏失败', 500);
  }
}

/**
 * 获取收藏列表
 * GET /api/v1/favorites
 */
async function getFavorites(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const [notes] = await pool.query(
      `SELECT id, title, content, category, word_count, created_at, updated_at 
       FROM notes 
       WHERE user_id = ? AND is_favorite = true AND is_deleted = false 
       ORDER BY updated_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND is_favorite = true AND is_deleted = false',
      [userId]
    );
    
    return success(res, {
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    }, '获取收藏列表成功');
    
  } catch (err) {
    console.error('获取收藏列表失败:', err);
    return error(res, '获取收藏列表失败', 500);
  }
}

/**
 * 获取回收站列表
 * GET /api/v1/trash
 */
async function getTrash(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const [notes] = await pool.query(
      `SELECT id, title, content, category, deleted_at, word_count 
       FROM notes 
       WHERE user_id = ? AND is_deleted = true 
       ORDER BY deleted_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND is_deleted = true',
      [userId]
    );
    
    return success(res, {
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    }, '获取回收站列表成功');
    
  } catch (err) {
    console.error('获取回收站列表失败:', err);
    return error(res, '获取回收站列表失败', 500);
  }
}

/**
 * 清空回收站
 * POST /api/v1/trash/clear
 */
async function clearTrash(req, res) {
  try {
    const userId = req.user.id;
    
    const [result] = await pool.query(
      'DELETE FROM notes WHERE user_id = ? AND is_deleted = true',
      [userId]
    );
    
    return success(res, { deletedCount: result.affectedRows }, '回收站已清空');
    
  } catch (err) {
    console.error('清空回收站失败:', err);
    return error(res, '清空回收站失败', 500);
  }
}

// ===== 辅助函数 =====

/**
 * 附加标签到笔记
 */
async function attachTags(noteId, userId, tags) {
  for (const tagName of tags) {
    if (!tagName) continue;
    
    // 查找或创建标签
    let [existingTags] = await pool.query(
      'SELECT id FROM tags WHERE user_id = ? AND name = ?',
      [userId, tagName]
    );
    
    let tagId;
    if (existingTags.length > 0) {
      tagId = existingTags[0].id;
      // 更新使用次数
      await pool.query(
        'UPDATE tags SET use_count = use_count + 1 WHERE id = ?',
        [tagId]
      );
    } else {
      // 创建新标签
      const [result] = await pool.query(
        'INSERT INTO tags (user_id, name, use_count) VALUES (?, ?, 1)',
        [userId, tagName]
      );
      tagId = result.insertId;
    }
    
    // 关联标签和笔记
    await pool.query(
      'INSERT IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
      [noteId, tagId]
    );
  }
}

module.exports = {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  batchDeleteNotes,
  restoreNote,
  permanentDeleteNote,
  searchNotes,
  getNotesByCategory,
  getNotesByTag,
  favoriteNote,
  unfavoriteNote,
  getFavorites,
  getTrash,
  clearTrash
};

