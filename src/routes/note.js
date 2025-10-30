// 笔记路由
const express = require('express');
const router = express.Router();
const noteController = require('../controllers/noteController');
const { authenticate } = require('../middleware/auth');

// 所有笔记路由都需要认证
router.use(authenticate);

// 获取笔记列表
router.get('/', noteController.getNotes);

// 搜索笔记（放在/:id前面避免被匹配）
router.get('/search', noteController.searchNotes);

// 按分类获取笔记
router.get('/by-category/:category', noteController.getNotesByCategory);

// 按标签获取笔记
router.get('/by-tag/:tag', noteController.getNotesByTag);

// 批量删除笔记
router.post('/batch-delete', noteController.batchDeleteNotes);

// 回收站相关路由（必须在/:id之前，避免被/:id路由拦截）
router.get('/trash', noteController.getTrashNotes);
router.post('/trash/:id/restore', noteController.restoreNote);
router.delete('/trash/:id', noteController.permanentDeleteNote);
router.delete('/trash', noteController.emptyTrash);
router.post('/trash/cleanup', noteController.cleanupExpiredNotes);

// 获取单条笔记详情（放在最后，避免拦截其他路由）
router.get('/:id', noteController.getNoteById);

// 创建笔记
router.post('/', noteController.createNote);

// 更新笔记
router.put('/:id', noteController.updateNote);

// 删除笔记（软删除）
router.delete('/:id', noteController.deleteNote);

// 恢复已删除的笔记
router.post('/:id/restore', noteController.restoreNote);

// 永久删除笔记
router.delete('/:id/permanent', noteController.permanentDeleteNote);

// 收藏笔记
router.post('/:id/favorite', noteController.favoriteNote);

// 取消收藏
router.delete('/:id/favorite', noteController.unfavoriteNote);

// 获取收藏列表（移到单独的路由文件中更好）
// 但为了方便，这里也添加上
router.get('/favorites/list', noteController.getFavorites);

module.exports = router;

