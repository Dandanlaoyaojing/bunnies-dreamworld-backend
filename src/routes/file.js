// 文件路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const { pool } = require('../config/database');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

// 所有文件路由都需要认证
router.use(authenticate);

// 创建上传目录（如果不存在）
const uploadDir = path.join(__dirname, '../../uploads');
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

// 上传文件（Base64格式）
router.post('/files', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileName, fileData, fileType, fileSize, noteId } = req.body;
    
    if (!fileName || !fileData) {
      return error(res, '文件名和文件数据不能为空', 400);
    }
    
    // 验证文件大小（限制10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileSize && fileSize > maxSize) {
      return error(res, '文件大小不能超过10MB', 400);
    }
    
    // 确保上传目录存在
    await ensureUploadDir();
    
    // 生成唯一文件名
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    
    // 解码Base64数据并保存文件
    const base64Data = fileData.replace(/^data:.*,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(filePath, buffer);
    
    // 保存文件记录到数据库
    const [result] = await pool.query(
      `INSERT INTO files (user_id, original_name, file_name, file_path, file_type, file_size, note_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, fileName, uniqueFileName, filePath, fileType, buffer.length, noteId]
    );
    
    return success(res, {
      fileId: result.insertId,
      fileName: uniqueFileName,
      originalName: fileName,
      fileSize: buffer.length,
      fileType,
      uploadTime: new Date().toISOString()
    }, '文件上传成功');
    
  } catch (err) {
    console.error('文件上传失败:', err);
    return error(res, '文件上传失败: ' + err.message, 500);
  }
});

// 下载文件
router.get('/files/:fileId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    
    // 获取文件信息
    const [files] = await pool.query(
      'SELECT * FROM files WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );
    
    if (files.length === 0) {
      return error(res, '文件不存在', 404);
    }
    
    const file = files[0];
    
    try {
      // 读取文件
      const fileBuffer = await fs.readFile(file.file_path);
      
      // 设置响应头
      res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      
      // 发送文件
      res.send(fileBuffer);
      
    } catch (fileErr) {
      console.error('读取文件失败:', fileErr);
      return error(res, '文件读取失败', 500);
    }
    
  } catch (err) {
    console.error('文件下载失败:', err);
    return error(res, '文件下载失败: ' + err.message, 500);
  }
});

// 获取文件列表
router.get('/files/list', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, noteId, fileType } = req.query;
    
    let query = `
      SELECT id, original_name, file_name, file_type, file_size, note_id, created_at
      FROM files 
      WHERE user_id = ?
    `;
    const params = [userId];
    
    if (noteId) {
      query += ' AND note_id = ?';
      params.push(noteId);
    }
    
    if (fileType) {
      query += ' AND file_type LIKE ?';
      params.push(`%${fileType}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    
    const [files] = await pool.query(query, params);
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM files WHERE user_id = ?';
    const countParams = [userId];
    
    if (noteId) {
      countQuery += ' AND note_id = ?';
      countParams.push(noteId);
    }
    
    if (fileType) {
      countQuery += ' AND file_type LIKE ?';
      countParams.push(`%${fileType}%`);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    
    return success(res, {
      files: files.map(file => ({
        ...file,
        fileSizeFormatted: formatFileSize(file.file_size)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit))
      }
    }, '获取文件列表成功');
    
  } catch (err) {
    console.error('获取文件列表失败:', err);
    return error(res, '获取文件列表失败: ' + err.message, 500);
  }
});

// 删除文件
router.delete('/files/:fileId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    
    // 获取文件信息
    const [files] = await pool.query(
      'SELECT * FROM files WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );
    
    if (files.length === 0) {
      return error(res, '文件不存在', 404);
    }
    
    const file = files[0];
    
    // 删除物理文件
    try {
      await fs.unlink(file.file_path);
    } catch (fileErr) {
      console.warn('删除物理文件失败:', fileErr.message);
    }
    
    // 删除数据库记录
    await pool.query('DELETE FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    
  return success(res, null, '文件删除成功');
    
  } catch (err) {
    console.error('文件删除失败:', err);
    return error(res, '文件删除失败: ' + err.message, 500);
  }
});

// 批量上传
router.post('/files/batch-upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { files, noteId } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return error(res, '文件列表不能为空', 400);
    }
    
    if (files.length > 10) {
      return error(res, '一次最多上传10个文件', 400);
    }
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const { fileName, fileData, fileType, fileSize } = file;
        
        // 验证文件大小
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (fileSize && fileSize > maxSize) {
          errors.push({ index: i, fileName, error: '文件大小超过10MB限制' });
          continue;
        }
        
        // 确保上传目录存在
        await ensureUploadDir();
        
        // 生成唯一文件名
        const fileExtension = path.extname(fileName);
        const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
        const filePath = path.join(uploadDir, uniqueFileName);
        
        // 解码Base64数据并保存文件
        const base64Data = fileData.replace(/^data:.*,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(filePath, buffer);
        
        // 保存文件记录到数据库
        const [result] = await pool.query(
          `INSERT INTO files (user_id, original_name, file_name, file_path, file_type, file_size, note_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, fileName, uniqueFileName, filePath, fileType, buffer.length, noteId]
        );
        
        results.push({
          index: i,
          fileId: result.insertId,
          fileName: uniqueFileName,
          originalName: fileName,
          fileSize: buffer.length
        });
        
      } catch (fileErr) {
        errors.push({ index: i, fileName: files[i].fileName, error: fileErr.message });
      }
    }
    
    return success(res, {
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors
    }, `批量上传完成，成功${results.length}个，失败${errors.length}个`);
    
  } catch (err) {
    console.error('批量上传失败:', err);
    return error(res, '批量上传失败: ' + err.message, 500);
  }
});

// 图片上传（专门处理图片）
router.post('/images/upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageData, imageName, noteId, compress = true } = req.body;
    
    if (!imageData) {
      return error(res, '图片数据不能为空', 400);
    }
    
    // 确保上传目录存在
    await ensureUploadDir();
    
    // 生成唯一文件名
    const fileExtension = path.extname(imageName || 'image.png');
    const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    
    // 解码Base64数据
    const base64Data = imageData.replace(/^data:.*,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 如果启用压缩且文件较大，进行压缩处理
    let finalBuffer = buffer;
    let compressionInfo = null;
    
    if (compress && buffer.length > 500 * 1024) { // 大于500KB时压缩
      // 这里可以集成图片压缩库，如sharp
      // 目前只是简单处理
      compressionInfo = {
        originalSize: buffer.length,
        compressedSize: buffer.length,
        compressionRatio: 0
      };
    }
    
    // 保存文件
    await fs.writeFile(filePath, finalBuffer);
    
    // 保存文件记录到数据库
    const [result] = await pool.query(
      `INSERT INTO files (user_id, original_name, file_name, file_path, file_type, file_size, note_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, imageName || 'image.png', uniqueFileName, filePath, 'image/*', finalBuffer.length, noteId]
    );
    
    return success(res, {
      fileId: result.insertId,
      fileName: uniqueFileName,
      originalName: imageName || 'image.png',
      fileSize: finalBuffer.length,
      fileType: 'image/*',
      compressionInfo,
      uploadTime: new Date().toISOString()
    }, '图片上传成功');
    
  } catch (err) {
    console.error('图片上传失败:', err);
    return error(res, '图片上传失败: ' + err.message, 500);
  }
});

// 语音上传
router.post('/audio/upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { audioData, audioName, noteId, duration } = req.body;
    
    if (!audioData) {
      return error(res, '语音数据不能为空', 400);
    }
    
    // 确保上传目录存在
    await ensureUploadDir();
    
    // 生成唯一文件名
    const fileExtension = path.extname(audioName || 'audio.mp3');
    const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    
    // 解码Base64数据并保存文件
    const base64Data = audioData.replace(/^data:.*,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(filePath, buffer);
    
    // 保存文件记录到数据库
    const [result] = await pool.query(
      `INSERT INTO files (user_id, original_name, file_name, file_path, file_type, file_size, note_id, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, audioName || 'audio.mp3', uniqueFileName, filePath, 'audio/*', buffer.length, noteId, JSON.stringify({ duration })]
    );
    
    return success(res, {
      fileId: result.insertId,
      fileName: uniqueFileName,
      originalName: audioName || 'audio.mp3',
      fileSize: buffer.length,
      fileType: 'audio/*',
      duration,
      uploadTime: new Date().toISOString()
    }, '语音上传成功');
    
  } catch (err) {
    console.error('语音上传失败:', err);
    return error(res, '语音上传失败: ' + err.message, 500);
  }
});

// 获取文件信息
router.get('/files/:fileId/info', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    
    const [files] = await pool.query(
      'SELECT id, original_name, file_name, file_type, file_size, note_id, created_at, metadata FROM files WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );
    
    if (files.length === 0) {
      return error(res, '文件不存在', 404);
    }
    
    const file = files[0];
    
    return success(res, {
      ...file,
      fileSizeFormatted: formatFileSize(file.file_size),
      metadata: file.metadata ? JSON.parse(file.metadata) : null
    }, '获取文件信息成功');
    
  } catch (err) {
    console.error('获取文件信息失败:', err);
    return error(res, '获取文件信息失败: ' + err.message, 500);
  }
});

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;

