# Token验证失败和标签追加问题

## 问题1: Token验证失败 (401 Unauthorized)

### 错误日志
```
POST http://10.10.12.20:3000/api/v1/ai/test-generate-tags 401 (Unauthorized)
用户未登录或Token无效，尝试使用测试接口
后端API认证失败，将使用本地方案
```

### 原因分析
- Token已过期（默认30天有效期）
- Token格式不正确
- 前端未正确发送Authorization header

### 解决方案

#### 方案1: 重新登录（推荐）
让用户在微信小程序中重新登录，获取新的Token

#### 方案2: 临时绕过认证（测试用）
暂时移除AI路由的认证要求：

```javascript
// src/routes/ai.js
// 注释掉这一行
// router.use(authenticate);

// 或者改为可选认证
const { optionalAuth } = require('../middleware/auth');
router.use(optionalAuth);
```

#### 方案3: 延长Token有效期
修改 `.env` 文件：
```env
JWT_EXPIRES_IN=90d  # 改为90天
```

---

## 问题2: 标签追加过滤逻辑过严

### 错误日志
```
追加模式: {existingTags: Array(5), newTags: Array(0), finalTags: Array(5), newCount: 0}
没有新标签，尝试重新生成...
```

### 原因分析
前端的标签追加逻辑使用**去重算法**，过滤掉了与现有标签相同的标签，导致：
- AI返回的标签与现有标签重复 → 被过滤
- `newTags` 数组为空
- `newCount` 为 0
- 提示"没有新标签"

### 解决方案

#### 需要修改的文件
前端项目：`C:\Users\Administrator\WeChatProjects\miniprogram-4`

#### 需要修改的代码
查找标签追加相关的函数，可能是：

1. `utils/aiService.js` - `generateSmartTags()` 函数
2. `pages/note-editor.js` - 标签追加逻辑

#### 修改建议

将严格的去重改为：
```javascript
// 原代码（过于严格）
const newTags = allTags.filter(tag => !existingTags.includes(tag));

// 改为（允许部分重复）
const newTags = allTags.slice(0, 5); // 直接取前5个
// 或者
const uniqueNewTags = [...new Set([...existingTags, ...allTags])]
  .slice(existingTags.length); // 保留所有不重复的
```

---

## 立即行动建议

### 优先级1: 解决Token问题
1. **推荐**：让用户重新登录
2. **临时**：暂时移除AI接口的认证（仅用于测试）

### 优先级2: 修改前端过滤逻辑
需要查看前端代码，找到标签追加的具体实现位置。

### 检查清单
- [ ] 用户是否已登录
- [ ] Token是否过期
- [ ] 前端是否正确发送Authorization header
- [ ] 标签去重逻辑是否过于严格

---

## 后端代码修改（临时解决Token问题）

如果需要在测试时绕过认证，修改 `src/routes/ai.js`：

```javascript
// AI功能路由
const express = require('express');
const router = express.Router();
// 修改为可选认证
const { optionalAuth } = require('../middleware/auth');
const { success, error } = require('../utils/response');

// 改为可选认证
router.use(optionalAuth);  // 原来是 authenticate

// 在路由中检查用户
router.post('/test-generate-tags', async (req, res) => {
  // 检查是否有用户
  if (!req.user) {
    console.warn('⚠️ 用户未登录，但允许继续处理');
    // 继续处理，但不记录用户信息
  }
  
  // ... 其余代码
});
```

---

## 下一步

1. 确定是否需要修改后端代码绕过认证
2. 检查前端标签追加的过滤逻辑
3. 提供更详细的错误日志以便调试
