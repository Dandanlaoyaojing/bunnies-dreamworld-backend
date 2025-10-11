// 系统管理路由
const express = require('express');
const router = express.Router();
const { success } = require('../utils/response');

// 获取系统配置
router.get('/system/config', async (req, res) => {
  return success(res, {
    uploadLimit: 10485760, // 10MB
    features: {
      ai: true,
      ocr: true,
      speech: true
    }
  }, '获取配置成功');
});

// 用户反馈
router.post('/feedback', async (req, res) => {
  return success(res, null, '反馈提交成功');
});

// 错误日志上报
router.post('/error-log', async (req, res) => {
  return success(res, null, '日志上报成功');
});

module.exports = router;

