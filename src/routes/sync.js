// 云同步路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success } = require('../utils/response');

router.use(authenticate);

router.post('/upload', async (req, res) => {
  return success(res, null, '上传成功');
});

router.get('/download', async (req, res) => {
  return success(res, { notes: [] }, '下载成功');
});

router.post('/check-updates', async (req, res) => {
  return success(res, { hasUpdates: false }, '检查完成');
});

router.post('/resolve-conflict', async (req, res) => {
  return success(res, null, '冲突解决成功');
});

router.get('/status', async (req, res) => {
  return success(res, { status: 'synced' }, '获取状态成功');
});

module.exports = router;

