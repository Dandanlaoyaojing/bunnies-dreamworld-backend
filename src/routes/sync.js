// 云同步路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const { pool } = require('../config/database');

router.use(authenticate);

// 上传数据到云端
router.post('/upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { notes, tags, drafts, lastSyncTime } = req.body;
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      const results = {
        notes: { created: 0, updated: 0, skipped: 0 },
        tags: { created: 0, updated: 0, skipped: 0 },
        drafts: { created: 0, updated: 0, skipped: 0 }
      };
      
      // 处理笔记数据
      if (notes && Array.isArray(notes)) {
        for (const note of notes) {
          const [existing] = await pool.query(
            'SELECT id, updated_at FROM notes WHERE id = ? AND user_id = ?',
            [note.id, userId]
          );
          
          if (existing.length > 0) {
            // 检查是否需要更新（服务器版本更新）
            if (new Date(existing[0].updated_at) < new Date(note.updated_at)) {
              await pool.query(
                `UPDATE notes SET title = ?, content = ?, category = ?, is_favorite = ?, 
                 word_count = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
                [note.title, note.content, note.category, note.is_favorite, 
                 note.word_count, note.updated_at, note.id, userId]
              );
              results.notes.updated++;
            } else {
              results.notes.skipped++;
            }
          } else {
            // 创建新笔记
            await pool.query(
              `INSERT INTO notes (id, user_id, title, content, category, is_favorite, 
               word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [note.id, userId, note.title, note.content, note.category, 
               note.is_favorite, note.word_count, note.created_at, note.updated_at]
            );
            results.notes.created++;
          }
        }
      }
      
      // 处理标签数据
      if (tags && Array.isArray(tags)) {
        for (const tag of tags) {
          const [existing] = await pool.query(
            'SELECT id FROM tags WHERE id = ? AND user_id = ?',
            [tag.id, userId]
          );
          
          if (existing.length === 0) {
            await pool.query(
              'INSERT INTO tags (id, user_id, name, color, use_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [tag.id, userId, tag.name, tag.color, tag.use_count, tag.created_at]
            );
            results.tags.created++;
          } else {
            results.tags.skipped++;
          }
        }
      }
      
      // 处理草稿数据
      if (drafts && Array.isArray(drafts)) {
        for (const draft of drafts) {
          const [existing] = await pool.query(
            'SELECT id FROM drafts WHERE id = ? AND user_id = ?',
            [draft.id, userId]
          );
          
          if (existing.length === 0) {
            await pool.query(
              'INSERT INTO drafts (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
              [draft.id, userId, draft.title, draft.content, draft.created_at, draft.updated_at]
            );
            results.drafts.created++;
          } else {
            results.drafts.skipped++;
          }
        }
      }
      
      // 更新同步记录
      await pool.query(
        `INSERT INTO sync_records (user_id, sync_type, last_sync_time, status) 
         VALUES (?, 'upload', NOW(), 'success') 
         ON DUPLICATE KEY UPDATE last_sync_time = NOW(), status = 'success'`,
        [userId]
      );
      
      await pool.query('COMMIT');
      
      return success(res, {
        results,
        syncTime: new Date().toISOString(),
        message: '数据上传成功'
      }, '上传成功');
      
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
    
  } catch (err) {
    console.error('上传失败:', err);
    return error(res, '上传失败: ' + err.message, 500);
  }
});

// 从云端下载数据
router.get('/download', async (req, res) => {
  try {
    const userId = req.user.id;
    const { lastSyncTime } = req.query;
    
    const data = {
      notes: [],
      tags: [],
      drafts: [],
      categories: []
    };
    
    // 获取笔记数据
    let noteQuery = `
      SELECT id, title, content, category, is_favorite, is_deleted, 
             word_count, created_at, updated_at
      FROM notes 
      WHERE user_id = ? AND is_deleted = false
    `;
    const noteParams = [userId];
    
    if (lastSyncTime) {
      noteQuery += ' AND updated_at > ?';
      noteParams.push(lastSyncTime);
    }
    
    noteQuery += ' ORDER BY updated_at DESC';
    
    const [notes] = await pool.query(noteQuery, noteParams);
    data.notes = notes;
    
    // 获取标签数据
    const [tags] = await pool.query(
      'SELECT id, name, color, use_count, created_at FROM tags WHERE user_id = ? ORDER BY use_count DESC',
      [userId]
    );
    data.tags = tags;
    
    // 获取草稿数据
    const [drafts] = await pool.query(
      'SELECT id, title, content, created_at, updated_at FROM drafts WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
    data.drafts = drafts;
    
    // 获取分类数据
    const [categories] = await pool.query(
      'SELECT name, icon, sort_order, is_system FROM categories ORDER BY sort_order'
    );
    data.categories = categories;
    
    // 更新同步记录
    await pool.query(
      `INSERT INTO sync_records (user_id, sync_type, last_sync_time, status) 
       VALUES (?, 'download', NOW(), 'success') 
       ON DUPLICATE KEY UPDATE last_sync_time = NOW(), status = 'success'`,
      [userId]
    );
    
    return success(res, {
      data,
      syncTime: new Date().toISOString(),
      totalNotes: notes.length,
      totalTags: tags.length,
      totalDrafts: drafts.length
    }, '下载成功');
    
  } catch (err) {
    console.error('下载失败:', err);
    return error(res, '下载失败: ' + err.message, 500);
  }
});

// 检查更新
router.post('/check-updates', async (req, res) => {
  try {
    const userId = req.user.id;
    const { lastSyncTime } = req.body;
    
    if (!lastSyncTime) {
      return success(res, { hasUpdates: true, reason: '首次同步' }, '检查完成');
    }
    
    // 检查是否有新的或更新的数据
    const [noteUpdates] = await pool.query(
      'SELECT COUNT(*) as count FROM notes WHERE user_id = ? AND updated_at > ?',
      [userId, lastSyncTime]
    );
    
    const [tagUpdates] = await pool.query(
      'SELECT COUNT(*) as count FROM tags WHERE user_id = ? AND created_at > ?',
      [userId, lastSyncTime]
    );
    
    const [draftUpdates] = await pool.query(
      'SELECT COUNT(*) as count FROM drafts WHERE user_id = ? AND updated_at > ?',
      [userId, lastSyncTime]
    );
    
    const hasUpdates = noteUpdates[0].count > 0 || tagUpdates[0].count > 0 || draftUpdates[0].count > 0;
    
    return success(res, {
      hasUpdates,
      updates: {
        notes: noteUpdates[0].count,
        tags: tagUpdates[0].count,
        drafts: draftUpdates[0].count
      }
    }, '检查完成');
    
  } catch (err) {
    console.error('检查更新失败:', err);
    return error(res, '检查更新失败: ' + err.message, 500);
  }
});

// 解决冲突
router.post('/resolve-conflict', async (req, res) => {
  try {
    const userId = req.user.id;
    const { conflictType, localData, serverData, resolution } = req.body;
    
    // 根据冲突类型和解决方案处理
    let result = null;
    
    switch (conflictType) {
      case 'note':
        if (resolution === 'use_local') {
          // 使用本地版本
          await pool.query(
            `UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
            [localData.title, localData.content, new Date().toISOString(), localData.id, userId]
          );
          result = localData;
        } else if (resolution === 'use_server') {
          // 使用服务器版本
          result = serverData;
        } else if (resolution === 'merge') {
          // 合并版本（简单合并，实际可以更复杂）
          const mergedData = {
            ...serverData,
            content: serverData.content + '\n\n--- 合并内容 ---\n\n' + localData.content,
            updated_at: new Date().toISOString()
          };
          await pool.query(
            `UPDATE notes SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
            [mergedData.content, mergedData.updated_at, localData.id, userId]
          );
          result = mergedData;
        }
        break;
        
      default:
        return error(res, '不支持的冲突类型', 400);
    }
    
    return success(res, {
      resolvedData: result,
      resolution,
      resolvedAt: new Date().toISOString()
    }, '冲突解决成功');
    
  } catch (err) {
    console.error('解决冲突失败:', err);
    return error(res, '解决冲突失败: ' + err.message, 500);
  }
});

// 获取同步状态
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取最后同步记录
    const [syncRecord] = await pool.query(
      'SELECT * FROM sync_records WHERE user_id = ? ORDER BY last_sync_time DESC LIMIT 1',
      [userId]
    );
    
    // 获取数据统计
    const [noteCount] = await pool.query(
      'SELECT COUNT(*) as count FROM notes WHERE user_id = ? AND is_deleted = false',
      [userId]
    );
    
    const [tagCount] = await pool.query(
      'SELECT COUNT(*) as count FROM tags WHERE user_id = ?',
      [userId]
    );
    
    const [draftCount] = await pool.query(
      'SELECT COUNT(*) as count FROM drafts WHERE user_id = ?',
      [userId]
    );
    
    const status = {
      lastSyncTime: syncRecord.length > 0 ? syncRecord[0].last_sync_time : null,
      syncStatus: syncRecord.length > 0 ? syncRecord[0].status : 'never',
      dataCounts: {
        notes: noteCount[0].count,
        tags: tagCount[0].count,
        drafts: draftCount[0].count
      },
      isOnline: true // 可以添加网络状态检测
    };
    
    return success(res, status, '获取状态成功');
    
  } catch (err) {
    console.error('获取状态失败:', err);
    return error(res, '获取状态失败: ' + err.message, 500);
  }
});

module.exports = router;

