// 认证路由
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRequired } = require('../middleware/validator');

// 用户注册
router.post('/register', 
  validateRequired(['username', 'password']),
  authController.register
);

// 用户登录
router.post('/login',
  validateRequired(['username', 'password']),
  authController.login
);

// 用户登出（需要认证）
router.post('/logout',
  authenticate,
  authController.logout
);

// 刷新Token（需要认证）
router.post('/refresh-token',
  authenticate,
  authController.refreshToken
);

// 验证Token有效性（需要认证）
router.post('/verify-token',
  authenticate,
  authController.verifyTokenValidity
);

module.exports = router;

