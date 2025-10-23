// AI增强功能路由
// ⚠️  重要说明：此文件中的AI功能已被完全移除
// 所有AI功能（标签生成、分类建议、内容摘要）都使用前端DeepSeek API实现
// 后端不再提供任何AI服务，确保前端AI功能独立运行

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/response');

router.use(authenticate);

// AI服务状态检查
router.get('/status', async (req, res) => {
  return success(res, {
    status: 'disabled',
    message: '后端AI服务已禁用，请使用前端DeepSeek API',
    frontendAI: true,
    backendAI: false,
    supportedFeatures: {
      tagGeneration: 'frontend_only',
      categorySuggestion: 'frontend_only', 
      contentSummary: 'frontend_only',
      writingSuggestions: 'frontend_only'
    }
  }, 'AI服务状态');
});

// 所有AI功能接口都已移除，强制使用前端DeepSeek API
router.post('/suggest-category', async (req, res) => {
  return error(res, 'AI分类建议功能已移除，请使用前端DeepSeek API', 503);
});

router.post('/generate-tags', async (req, res) => {
  return error(res, 'AI标签生成功能已移除，请使用前端DeepSeek API', 503);
});

router.post('/generate-summary', async (req, res) => {
  return error(res, 'AI摘要生成功能已移除，请使用前端DeepSeek API', 503);
});

router.post('/writing-suggestions', async (req, res) => {
  return error(res, 'AI写作建议功能已移除，请使用前端DeepSeek API', 503);
});

router.post('/recommend-nodes', async (req, res) => {
  return error(res, 'AI节点推荐功能已移除，请使用前端DeepSeek API', 503);
});

router.post('/smart-search', async (req, res) => {
  return error(res, 'AI智能搜索功能已移除，请使用前端DeepSeek API', 503);
});

router.post('/analyze-content', async (req, res) => {
  return error(res, 'AI内容分析功能已移除，请使用前端DeepSeek API', 503);
});

module.exports = router;