// 文件路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/response');

// 部分文件路由需要认证
// router.use(authenticate); // 暂时移除全局认证，允许未登录用户进行OCR

// 上传文件（简化版本，实际生产环境需要使用multer等中间件）- 需要认证
router.post('/files', authenticate, async (req, res) => {
  return success(res, { message: '文件上传功能待实现' }, '功能开发中');
});

// 下载文件 - 需要认证
router.get('/files/:fileId', authenticate, async (req, res) => {
  return success(res, { message: '文件下载功能待实现' }, '功能开发中');
});

// 获取文件列表 - 需要认证
router.get('/files/list', authenticate, async (req, res) => {
  return success(res, { files: [] }, '获取文件列表成功');
});

// 删除文件 - 需要认证
router.delete('/files/:fileId', authenticate, async (req, res) => {
  return success(res, null, '文件删除成功');
});

// 批量上传 - 需要认证
router.post('/files/batch-upload', authenticate, async (req, res) => {
  return success(res, { message: '批量上传功能待实现' }, '功能开发中');
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

// 语音上传
router.post('/audio/upload', async (req, res) => {
  return success(res, { message: '语音上传功能待实现' }, '功能开发中');
});

module.exports = router;

