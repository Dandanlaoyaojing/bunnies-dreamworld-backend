// 用户路由
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// 所有用户路由都需要认证
router.use(authenticate);

// 获取用户资料
router.get('/profile', userController.getProfile);

// 更新用户资料
router.put('/profile', userController.updateProfile);

// 修改密码
router.post('/change-password', userController.changePassword);

// 注销账户
router.delete('/account', userController.deleteAccount);

// 获取用户统计信息
router.get('/stats', userController.getStats);

module.exports = router;

