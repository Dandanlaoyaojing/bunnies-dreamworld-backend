// 笔记控制器
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');
const { sanitizeHtml } = require('../middleware/validator');

// ===== 通用辅助方法（用于确保返回权威数据） =====
async function fetchNoteWithTags(noteId, userId) {
  // 查询笔记及其标签（包含 source 字段）
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
    source: row.source || 'ai' // 兼容旧数据（如果没有 source，默认为 'ai'）
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

async function fetchTrashListForUser(userId, query) {
  const { page = 1, limit = 20 } = query || {};
  const offset = (page - 1) * limit;
  const [notes] = await pool.query(
    `SELECT id, original_note_id, title, content, category, is_favorite,
            word_count, source, url, category_tag, created_at, updated_at,
            deleted_at, expire_at
     FROM note_trash
     WHERE user_id = ?
     ORDER BY deleted_at DESC
     LIMIT ? OFFSET ?`,
    [userId, parseInt(limit), parseInt(offset)]
  );
  const [countResult] = await pool.query(
    'SELECT COUNT(*) as total FROM note_trash WHERE user_id = ?',
    [userId]
  );
  return {
    notes,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult[0].total,
      pages: Math.ceil(countResult[0].total / limit)
    }
  };
}

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
      category ? [userId, category, parseInt(limit), parseInt(offset)] : [userId, parseInt(limit), parseInt(offset)]
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
    
    // 查询总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notes n 
       WHERE n.user_id = ? AND n.is_deleted = false 
       ${category ? 'AND n.category = ?' : ''}
       ${favorite === 'true' ? 'AND n.is_favorite = true' : ''}`,
      category ? [userId, category] : [userId]
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
    
    // 使用统一的 fetchNoteWithTags 函数，自动包含 source 字段
    const note = await fetchNoteWithTags(noteId, userId);
    
    if (!note) {
      return error(res, '笔记不存在或无权访问', 404);
    }
    
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
    
    // 防重复检查：检查用户是否在最近10秒内创建了相同标题和内容的笔记
    // 这样可以防止发布草稿时重复保存的问题
    const [duplicateCheck] = await pool.query(
      `SELECT id FROM notes 
       WHERE user_id = ? 
         AND title = ? 
         AND content = ? 
         AND category = ?
         AND is_deleted = false
         AND created_at > DATE_SUB(NOW(), INTERVAL 10 SECOND)
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, sanitizedTitle, sanitizedContent, category]
    );
    
    if (duplicateCheck.length > 0) {
      // 找到重复的笔记，直接返回已存在的笔记
      console.log(`⚠️ 检测到重复创建笔记（用户ID: ${userId}, 标题: ${sanitizedTitle.substring(0, 20)}...），返回已存在的笔记`);
      const existingNoteId = duplicateCheck[0].id;
      const existingNote = await fetchNoteWithTags(existingNoteId, userId);
      let listPayload = null;
      if (req.query.returnList === 'true') {
        listPayload = await fetchNotesListForUser(userId, req.query);
      }
      return success(
        res,
        {
          note: existingNote,
          isDuplicate: true,
          ...(listPayload ? { list: listPayload } : {}),
        },
        '笔记已存在（防重复保存）',
        200
      );
    }
    
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
    
    // 返回权威数据（新建的完整笔记），可选带列表
    const createdNote = await fetchNoteWithTags(noteId, userId);
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchNotesListForUser(userId, req.query);
    }
    return success(
      res,
      {
        note: createdNote,
        ...(listPayload ? { list: listPayload } : {}),
      },
      '笔记创建成功',
      201
    );
    
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
    
    // 返回权威数据（更新后的完整笔记），可选带列表
    const updated = await fetchNoteWithTags(noteId, userId);
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchNotesListForUser(userId, req.query);
    }
    return success(res, { note: updated, ...(listPayload ? { list: listPayload } : {}) }, '笔记更新成功');
    
  } catch (err) {
    console.error('更新笔记失败:', err);
    return error(res, '更新笔记失败', 500);
  }
}

/**
 * 删除笔记（真正删除到回收站）
 * DELETE /api/v1/notes/:id
 */
async function deleteNote(req, res) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const userId = req.user.id;
    const noteId = req.params.id;
    
    // 1. 获取笔记完整信息
    const [noteRows] = await connection.query(
      `SELECT id, title, content, category, is_favorite, word_count, 
              source, url, category_tag, created_at, updated_at
       FROM notes 
       WHERE id = ? AND user_id = ? AND is_deleted = false`,
      [noteId, userId]
    );
    
    if (noteRows.length === 0) {
      await connection.rollback();
      return error(res, '笔记不存在或无权访问', 404);
    }
    
    const note = noteRows[0];
    
    // 2. 将笔记移动到回收站（30天后过期）
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 30); // 30天后过期
    
    await connection.query(
      `INSERT INTO note_trash 
       (original_note_id, user_id, title, content, category, is_favorite, 
        word_count, source, url, category_tag, created_at, updated_at, 
        deleted_at, expire_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        note.id, userId, note.title, note.content, note.category, 
        note.is_favorite, note.word_count, note.source, note.url, 
        note.category_tag, note.created_at, note.updated_at, expireAt
      ]
    );
    
    // 3. 从笔记表中真正删除
    await connection.query(
      'DELETE FROM notes WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    
    // 4. 删除相关的标签关联
    await connection.query(
      'DELETE FROM note_tags WHERE note_id = ?',
      [noteId]
    );
    
    // 5. 记录操作日志
    await connection.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'delete_note', 'note', noteId]
    );
    
    await connection.commit();
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchNotesListForUser(userId, req.query);
    }
    return success(res, { deletedId: noteId, ...(listPayload ? { list: listPayload } : {}) }, '笔记已移至回收站，30天后将自动清理');
    
  } catch (err) {
    await connection.rollback();
    console.error('删除笔记失败:', err);
    return error(res, '删除笔记失败', 500);
  } finally {
    connection.release();
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
 * 恢复已删除的笔记（已迁移到回收站机制）
 * POST /api/v1/notes/:id/restore
 * 注意：此路由保留用于向后兼容，实际应该使用 /api/v1/notes/trash/:id/restore
 */
async function restoreNote(req, res) {
  return error(res, '请使用回收站恢复功能：POST /api/v1/notes/trash/:id/restore', 404);
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
      
      note.tags = tagRows.map(row => ({
        name: row.name,
        source: row.source || 'ai'
      }));
    }
    
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
      
      note.tags = tagRows.map(row => ({
        name: row.name,
        source: row.source || 'ai'
      }));
    }
    
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
      
      note.tags = tagRows.map(row => ({
        name: row.name,
        source: row.source || 'ai'
      }));
    }
    
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
    const updated = await fetchNoteWithTags(noteId, userId);
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchNotesListForUser(userId, req.query);
    }
    return success(res, { note: updated, ...(listPayload ? { list: listPayload } : {}) }, '已收藏');
    
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
    const updated = await fetchNoteWithTags(noteId, userId);
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchNotesListForUser(userId, req.query);
    }
    return success(res, { note: updated, ...(listPayload ? { list: listPayload } : {}) }, '已取消收藏');
    
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

// 旧的getTrash函数已删除，使用新的getTrashNotes函数

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
 * 规范化标签格式（兼容字符串和对象格式）
 * @param {string|object} tag - 标签（字符串或对象）
 * @returns {object} 规范化的标签对象 {name: string, source: 'manual'|'ai'|'origin'}
 */
function normalizeTag(tag) {
  if (typeof tag === 'string') {
    // 字符串格式：默认为 AI 生成
    return {
      name: tag.trim(),
      source: 'ai'
    };
  } else if (typeof tag === 'object' && tag !== null) {
    // 对象格式：提取 name 和 source
    // source 可选值：'manual'（手动添加）、'ai'（AI生成）、'origin'（从笔记出处字段生成的）
    const validSource = ['manual', 'ai', 'origin'].includes(tag.source) ? tag.source : 'ai';
    return {
      name: (tag.name || tag).trim(),
      source: validSource
    };
  }
  return null;
}

/**
 * 附加标签到笔记（支持 source 字段）
 */
async function attachTags(noteId, userId, tags) {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return;
  }
  
  for (const tag of tags) {
    // 规范化标签格式（兼容字符串和对象）
    const normalizedTag = normalizeTag(tag);
    
    if (!normalizedTag || !normalizedTag.name) {
      console.warn('⚠️ 跳过无效标签:', tag);
      continue;
    }
    
    const tagName = normalizedTag.name;
    const tagSource = normalizedTag.source || 'ai'; // 默认为 AI
    
    // 查找或创建标签（标签名称全局唯一，source 在 note_tags 关联表中）
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
    
    // 关联标签和笔记（包含 source 字段）
    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 来处理重复插入
    await pool.query(
      `INSERT INTO note_tags (note_id, tag_id, source) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE source = VALUES(source)`,
      [noteId, tagId, tagSource]
    );
    
    console.log(`✅ 关联标签: ${tagName} (source: ${tagSource})`);
  }
}

// ===== 回收站功能 =====

/**
 * 获取回收站笔记
 * GET /api/v1/notes/trash
 */
async function getTrashNotes(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const [notes] = await pool.query(
      `SELECT id, original_note_id, title, content, category, is_favorite, 
              word_count, source, url, category_tag, created_at, updated_at, 
              deleted_at, expire_at
       FROM note_trash 
       WHERE user_id = ? 
       ORDER BY deleted_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM note_trash WHERE user_id = ?',
      [userId]
    );
    
    return success(res, {
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit)
      }
    }, '获取回收站笔记成功');
    
  } catch (err) {
    console.error('获取回收站笔记失败:', err);
    return error(res, '获取回收站笔记失败', 500);
  }
}

/**
 * 从回收站恢复笔记
 * POST /api/v1/notes/trash/:id/restore
 */
async function restoreTrashNote(req, res) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const userId = req.user.id;
    const trashId = req.params.id;
    
    // 1. 获取回收站中的笔记
    const [trashRows] = await connection.query(
      `SELECT * FROM note_trash 
       WHERE id = ? AND user_id = ?`,
      [trashId, userId]
    );
    
    if (trashRows.length === 0) {
      await connection.rollback();
      return error(res, '回收站笔记不存在', 404);
    }
    
    const trashNote = trashRows[0];
    
    // 2. 恢复笔记到原表
    await connection.query(
      `INSERT INTO notes 
       (id, user_id, title, content, category, is_favorite, word_count, 
        source, url, category_tag, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trashNote.original_note_id, userId, trashNote.title, 
        trashNote.content, trashNote.category, trashNote.is_favorite,
        trashNote.word_count, trashNote.source, trashNote.url,
        trashNote.category_tag, trashNote.created_at, trashNote.updated_at
      ]
    );
    
    // 3. 从回收站删除
    await connection.query(
      'DELETE FROM note_trash WHERE id = ? AND user_id = ?',
      [trashId, userId]
    );
    
    // 4. 记录操作日志
    await connection.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'restore_note', 'note', trashNote.original_note_id]
    );
    
    await connection.commit();
    // 返回权威数据：恢复后的笔记与可选的笔记列表（不是回收站列表）
    const restoredNote = await fetchNoteWithTags(trashNote.original_note_id, userId);
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchNotesListForUser(userId, req.query);
    }
    return success(res, { restoredId: trashNote.original_note_id, note: restoredNote, ...(listPayload ? { list: listPayload } : {}) }, '笔记已恢复');
    
  } catch (err) {
    await connection.rollback();
    console.error('恢复笔记失败:', err);
    return error(res, '恢复笔记失败', 500);
  } finally {
    connection.release();
  }
}

/**
 * 永久删除回收站中的笔记
 * DELETE /api/v1/notes/trash/:id
 */
async function permanentDeleteTrashNote(req, res) {
  try {
    const userId = req.user.id;
    const trashId = req.params.id;
    
    const [result] = await pool.query(
      'DELETE FROM note_trash WHERE id = ? AND user_id = ?',
      [trashId, userId]
    );
    
    if (result.affectedRows === 0) {
      return error(res, '回收站笔记不存在', 404);
    }
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'permanent_delete_note', 'note', trashId]
    );
    // 可选返回回收站最新列表
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchTrashListForUser(userId, req.query);
    }
    return success(res, { deletedTrashId: trashId, ...(listPayload ? { list: listPayload } : {}) }, '笔记已永久删除');
    
  } catch (err) {
    console.error('永久删除笔记失败:', err);
    return error(res, '永久删除笔记失败', 500);
  }
}

/**
 * 清空回收站
 * DELETE /api/v1/notes/trash
 */
async function emptyTrash(req, res) {
  try {
    const userId = req.user.id;
    
    const [result] = await pool.query(
      'DELETE FROM note_trash WHERE user_id = ?',
      [userId]
    );
    
    // 记录操作日志
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, resource_type, resource_id) VALUES (?, ?, ?, ?)',
      [userId, 'empty_trash', 'note', 0]
    );
    // 可选返回回收站最新列表（应为空或剩余）
    let listPayload = null;
    if (req.query.returnList === 'true') {
      listPayload = await fetchTrashListForUser(userId, req.query);
    }
    return success(res, { deletedCount: result.affectedRows, ...(listPayload ? { list: listPayload } : {}) }, '回收站已清空');
    
  } catch (err) {
    console.error('清空回收站失败:', err);
    return error(res, '清空回收站失败', 500);
  }
}

/**
 * 清理过期笔记
 * POST /api/v1/notes/trash/cleanup
 */
async function cleanupExpiredNotes(req, res) {
  try {
    const [result] = await pool.query(
      'DELETE FROM note_trash WHERE expire_at < NOW()'
    );
    
    return success(res, { cleanedCount: result.affectedRows }, '过期笔记已清理');
    
  } catch (err) {
    console.error('清理过期笔记失败:', err);
    return error(res, '清理过期笔记失败', 500);
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
  clearTrash,
  // 回收站相关功能
  getTrashNotes,
  restoreTrashNote,
  permanentDeleteTrashNote,
  emptyTrash,
  cleanupExpiredNotes
};

