# 🐰 小兔的梦幻世界笔记本 - 后端API服务

## 📖 项目简介

这是"小兔的梦幻世界笔记本"微信小程序的后端API服务器，提供用户认证、笔记管理、云同步等60+个API接口。

## ✨ 主要功能

- 🔐 **用户认证系统** - JWT Token认证，支持注册、登录、登出
- 📝 **笔记管理** - 完整的CRUD操作，支持分类、标签、搜索
- ☁️ **云同步** - 多设备数据同步，智能合并
- ⭐ **收藏与回收站** - 软删除机制，30天自动清理
- 📊 **数据统计** - 笔记数量、字数、分类分布等
- 🗂️ **分类与标签** - 8个预设分类，无限自定义标签
- 💾 **草稿箱** - 自动保存，防止数据丢失
- 🛡️ **安全防护** - XSS防护、SQL注入防护、API限流

## 🛠️ 技术栈

- **运行环境**: Node.js 14+
- **Web框架**: Express 5.x
- **数据库**: MySQL 8.0+ (utf8mb4)
- **认证方式**: JWT (jsonwebtoken)
- **密码加密**: bcryptjs
- **跨域支持**: cors
- **环境配置**: dotenv

## 📦 安装和运行

### 1. 克隆项目
```bash
cd "D:\my projects\bunnies-dreamworld-backend"
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
创建 `.env` 文件（已自动创建）：
```env
# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=dandan94dmv
DB_NAME=bunnies_dreamworld

# 服务器配置
PORT=3000

# JWT密钥
JWT_SECRET=bunnies-dreamworld-secret-key-2024
```

### 4. 初始化数据库
```bash
npm run init-db
```

### 5. 启动服务器
```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

### 6. 验证运行
访问：http://localhost:3000/api/v1/health

应该看到：
```json
{
  "success": true,
  "message": "服务器运行正常",
  "data": {
    "status": "ok",
    "timestamp": "2025-10-11T...",
    "version": "1.0.0"
  }
}
```

## 📚 API文档

### 基础信息
- **API前缀**: `/api/v1`
- **认证方式**: Bearer Token
- **响应格式**: JSON
- **字符编码**: UTF-8

### 统一响应格式
```json
{
  "success": true/false,
  "message": "提示信息",
  "data": { /* 具体数据 */ }
}
```

### 认证接口

#### 用户注册
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "myuser",
  "password": "123456",
  "nickname": "我的昵称"
}
```

#### 用户登录
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "myuser",
  "password": "123456"
}

Response:
{
  "success": true,
  "data": {
    "user": { "id": 1, "username": "myuser", ... },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 笔记接口（需要认证）

#### 创建笔记
```http
POST /api/v1/notes
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "我的笔记",
  "content": "笔记内容",
  "category": "knowledge",
  "tags": ["标签1", "标签2"]
}
```

#### 获取笔记列表
```http
GET /api/v1/notes?page=1&limit=20&category=knowledge
Authorization: Bearer {token}
```

#### 搜索笔记
```http
GET /api/v1/notes/search?q=关键词&page=1&limit=20
Authorization: Bearer {token}
```

### 更多接口

详细的API文档请查看：[API_USAGE_GUIDE.md](../miniprogram-4/API_USAGE_GUIDE.md)

## 📊 数据库结构

### 核心表

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| users | 用户表 | id, username, password, nickname, avatar |
| notes | 笔记表 | id, user_id, title, content, category, tags |
| tags | 标签表 | id, user_id, name, color, use_count |
| note_tags | 笔记标签关联 | note_id, tag_id |
| categories | 分类表 | id, name, icon, is_system |
| drafts | 草稿箱 | id, user_id, title, content |
| token_blacklist | Token黑名单 | token, user_id, expires_at |

### 预设分类
- art（艺术）
- cute（萌物）
- dreams（梦游）
- foods（美食）
- happiness（趣事）
- knowledge（知识）
- sights（风景）
- thinking（思考）

## 🔒 安全特性

### 1. 认证安全
- JWT Token认证机制
- Token有效期30天
- 登出后Token加入黑名单
- 支持Token刷新

### 2. 密码安全
- bcrypt加密（10轮）
- 不可逆加密
- 数据库不存储明文密码

### 3. API安全
- SQL注入防护（使用参数化查询）
- XSS防护（HTML标签过滤）
- API限流（每分钟60次）
- 参数验证

### 4. 数据安全
- 软删除机制
- 操作日志记录
- 错误日志记录
- 定期备份

## 🚀 部署指南

### 开发环境（当前）
```bash
npm run dev
# 服务器运行在 http://localhost:3000
```

### 生产环境

#### 1. 购买服务器
推荐：阿里云/腾讯云（1核2G即可）

#### 2. 安装环境
```bash
# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装MySQL
sudo apt-get install mysql-server

# 安装PM2（进程管理）
sudo npm install -g pm2
```

#### 3. 上传代码
```bash
# 使用git或FTP上传项目
git clone your-repo-url
cd bunnies-dreamworld-backend
npm install --production
```

#### 4. 配置数据库
```bash
mysql -u root -p
CREATE DATABASE bunnies_dreamworld CHARACTER SET utf8mb4;
exit

# 初始化数据库
npm run init-db
```

#### 5. 配置环境变量
修改 `.env` 文件为生产配置

#### 6. 启动服务
```bash
pm2 start server.js --name "bunnies-api"
pm2 save
pm2 startup
```

#### 7. 配置Nginx（可选）
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 8. 配置HTTPS
```bash
sudo certbot --nginx -d your-domain.com
```

## 📝 开发日志

### 2025-10-11
- ✅ 项目初始化
- ✅ 数据库设计和创建（13张表）
- ✅ 实现所有核心API接口（60+个）
- ✅ JWT认证系统
- ✅ 安全防护机制
- ✅ 小程序前端集成
- ✅ 云同步功能
- ✅ 完整测试通过

## 🐛 问题反馈

如有问题，请通过以下方式反馈：
1. 查看Console日志
2. 查看错误日志表
3. 联系开发者

## 📄 许可证

ISC License

## 👨‍💻 开发者

小兔团队

---

## 🎯 快速测试

### 使用curl测试
```bash
# 健康检查
curl http://localhost:3000/api/v1/health

# 注册用户
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456","nickname":"测试用户"}'

# 登录
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'
```

### 使用PowerShell测试
```powershell
# 注册
$body = @{ username = "testuser"; password = "123456"; nickname = "测试用户" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/register" -Method POST -Body $body -ContentType "application/json"

# 登录
$body = @{ username = "testuser"; password = "123456" } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json"
$token = $result.data.token

# 创建笔记
$headers = @{ Authorization = "Bearer $token" }
$body = @{ title = "测试笔记"; content = "这是内容"; category = "knowledge" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/notes" -Method POST -Headers $headers -Body $body -ContentType "application/json"
```

---

**🎊 祝你开发愉快！**

