// 文件路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const { pool } = require('../config/database');

// 部分文件路由需要认证
// router.use(authenticate); // 暂时移除全局认证，允许未登录用户进行OCR

// 工具：保存base64到本地文件
const fs = require('fs');
const path = require('path');
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function decodeBase64ToBuffer(contentBase64) {
  const cleaned = contentBase64.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

// 上传文件（JSON+base64，避免引入multer）- 需要认证
// body: { filename, contentBase64, mimeType, noteId }
router.post('/files', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { filename, contentBase64, mimeType, noteId } = req.body || {};
    if (!filename || !contentBase64) {
      return error(res, '请提供 filename 和 contentBase64', 400);
    }
    const uploadsDir = path.join(process.cwd(), 'uploads', 'files');
    ensureDirSync(uploadsDir);
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`;
    const filePath = path.join(uploadsDir, safeName);
    const buf = decodeBase64ToBuffer(contentBase64);
    fs.writeFileSync(filePath, buf);

    const fileSize = buf.length;
    const [result] = await pool.query(
      `INSERT INTO files (user_id, note_id, file_name, file_path, file_type, file_size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, noteId || null, filename, filePath, 'document', fileSize, mimeType || null]
    );

    return success(res, {
      id: result.insertId,
      file_name: filename,
      file_path: filePath,
      file_size: fileSize,
      mime_type: mimeType || null
    }, '文件上传成功', 201);
  } catch (e) {
    console.error('文件上传失败:', e);
    return error(res, '文件上传失败', 500);
  }
});

// 获取文件列表 - 需要认证（注意：必须放在 /files/:fileId 之前，防止被匹配为fileId）
router.get('/files/list', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, noteId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ['user_id = ?'];
    const params = [userId];
    if (noteId) { where.push('note_id = ?'); params.push(noteId); }
    const whereSql = where.join(' AND ');
    const [files] = await pool.query(
      `SELECT id, file_name, file_path, file_type, file_size, mime_type, note_id, created_at
       FROM files WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [cnt] = await pool.query(`SELECT COUNT(*) as total FROM files WHERE ${whereSql}`, params);
    return success(res, { files, pagination: { page: parseInt(page), limit: parseInt(limit), total: cnt[0].total } }, '获取文件列表成功');
  } catch (e) {
    console.error('获取文件列表失败:', e);
    return error(res, '获取文件列表失败', 500);
  }
});

// 下载文件 - 需要认证（仅限本人）
router.get('/files/:fileId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.fileId;
    const [rows] = await pool.query('SELECT * FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (rows.length === 0) return error(res, '文件不存在或无权访问', 404);
    const file = rows[0];
    if (!fs.existsSync(file.file_path)) return error(res, '文件已丢失', 410);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name)}"`);
    if (file.mime_type) res.setHeader('Content-Type', file.mime_type);
    fs.createReadStream(file.file_path).pipe(res);
  } catch (e) {
    console.error('文件下载失败:', e);
    return error(res, '文件下载失败', 500);
  }
});

// 删除文件 - 需要认证（仅限本人）
router.delete('/files/:fileId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.fileId;
    const [rows] = await pool.query('SELECT * FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (rows.length === 0) return error(res, '文件不存在或无权访问', 404);
    const file = rows[0];
    await pool.query('DELETE FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    try { if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path); } catch (_) {}
    return success(res, { deletedId: parseInt(fileId) }, '文件删除成功');
  } catch (e) {
    console.error('文件删除失败:', e);
    return error(res, '文件删除失败', 500);
  }
});

// 批量上传（JSON+base64数组）- 需要认证
// body: { files: [{ filename, contentBase64, mimeType, noteId? }, ...] }
router.post('/files/batch-upload', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) return error(res, '请提供 files 数组', 400);
    const uploadsDir = path.join(process.cwd(), 'uploads', 'files');
    ensureDirSync(uploadsDir);
    const results = [];
    for (const f of files) {
      if (!f || !f.filename || !f.contentBase64) continue;
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${f.filename}`;
      const filePath = path.join(uploadsDir, safeName);
      const buf = decodeBase64ToBuffer(f.contentBase64);
      fs.writeFileSync(filePath, buf);
      const [r] = await pool.query(
        `INSERT INTO files (user_id, note_id, file_name, file_path, file_type, file_size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, f.noteId || null, f.filename, filePath, 'document', buf.length, f.mimeType || null]
      );
      results.push({ id: r.insertId, file_name: f.filename, file_size: buf.length, mime_type: f.mimeType || null });
    }
    return success(res, { uploaded: results }, '批量上传成功');
  } catch (e) {
    console.error('批量上传失败:', e);
    return error(res, '批量上传失败', 500);
  }
});

// 图片上传和OCR识别
router.post('/images/upload', async (req, res) => {
  try {
    const { image, doOCR = true } = req.body;
    
    if (!image) {
      return error(res, '请提供图片数据', 400);
    }

    // 移除base64前缀（如果存在）
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    
    let ocrResult = null;
    
    // 如果需要OCR识别
    if (doOCR) {
      try {
        const OCRService = require('../utils/ocrService');
        const ocrService = new OCRService();
        
        if (ocrService.checkConfig()) {
          ocrResult = await ocrService.recognizeGeneral(base64Image);
          console.log('✅ OCR识别成功');
        }
      } catch (ocrError) {
        console.error('OCR识别失败:', ocrError.message);
        // OCR失败不影响图片上传
      }
    }
    
    return success(res, { 
      message: '图片上传成功',
      ocrResult: ocrResult,
      hasOCR: !!ocrResult
    }, '图片上传成功');
  } catch (error) {
    console.error('图片上传失败:', error);
    return error(res, '图片上传失败', 500);
  }
});

// 语音上传（JSON+base64）
// body: { filename, contentBase64, mimeType }
router.post('/audio/upload', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { filename, contentBase64, mimeType } = req.body || {};
    if (!filename || !contentBase64) return error(res, '请提供 filename 和 contentBase64', 400);
    const uploadsDir = path.join(process.cwd(), 'uploads', 'audio');
    ensureDirSync(uploadsDir);
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`;
    const filePath = path.join(uploadsDir, safeName);
    const buf = decodeBase64ToBuffer(contentBase64);
    fs.writeFileSync(filePath, buf);
    const [result] = await pool.query(
      `INSERT INTO files (user_id, note_id, file_name, file_path, file_type, file_size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, filename, filePath, 'audio', buf.length, mimeType || 'audio/mpeg']
    );
    return success(res, { id: result.insertId, file_name: filename, file_size: buf.length }, '音频上传成功', 201);
  } catch (e) {
    console.error('音频上传失败:', e);
    return error(res, '音频上传失败', 500);
  }
});

module.exports = router;

