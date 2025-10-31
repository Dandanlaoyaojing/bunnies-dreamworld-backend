# 后端-标签 Source 字段支持说明

## 📋 修改概述

后端已完整支持标签的 `source` 字段，用于区分手动添加的标签和AI生成的标签。

---

## ✅ 已完成的修改

### 1. 数据库结构更新

**迁移脚本**: `add_tag_source_field.sql`

```sql
ALTER TABLE note_tags 
ADD COLUMN source ENUM('manual', 'ai') DEFAULT 'ai' COMMENT '标签来源：manual-手动添加，ai-AI生成';
```

**字段说明**:
- `source` 字段存储在 `note_tags` 关联表中
- 类型：`ENUM('manual', 'ai')`
- 默认值：`'ai'`（兼容旧数据）
- 意义：同一标签在不同笔记中可能有不同的 source

### 2. 标签格式规范化

**新增函数**: `normalizeTag(tag)`

支持两种输入格式：
- **字符串格式**: `"标签名"` → `{name: "标签名", source: 'ai'}`
- **对象格式**: `{name: "标签名", source: "manual"}` → `{name: "标签名", source: "manual"}`

**兼容性**: 
- ✅ 向后兼容字符串数组格式
- ✅ 支持新的对象数组格式
- ✅ 自动转换旧数据

### 3. 标签存储（attachTags）

**修改位置**: `src/controllers/noteController.js` 第 812-939 行

**功能**:
- ✅ 接收字符串数组或对象数组格式的标签
- ✅ 规范化标签格式，提取 `name` 和 `source`
- ✅ 在 `note_tags` 表中存储 `source` 字段
- ✅ 使用 `INSERT ... ON DUPLICATE KEY UPDATE` 处理重复

**代码示例**:
```javascript
// 支持字符串格式
await attachTags(noteId, userId, ["标签1", "标签2"]);

// 支持对象格式
await attachTags(noteId, userId, [
  {name: "标签1", source: "manual"},
  {name: "标签2", source: "ai"}
]);
```

### 4. 标签返回（fetchNoteWithTags）

**修改位置**: `src/controllers/noteController.js` 第 7-38 行

**功能**:
- ✅ 返回标签时包含 `source` 字段
- ✅ 统一返回对象数组格式：`[{name: "标签名", source: "manual|ai"}]`
- ✅ 兼容旧数据（如果没有 source，默认为 'ai'）

**返回格式**:
```json
{
  "id": 123,
  "title": "笔记标题",
  "content": "笔记内容",
  "tags": [
    {"name": "标签1", "source": "manual"},
    {"name": "标签2", "source": "ai"}
  ]
}
```

### 5. 所有接口统一支持

已修改的接口：
- ✅ `GET /api/v1/notes` - 获取笔记列表
- ✅ `GET /api/v1/notes/:id` - 获取笔记详情
- ✅ `GET /api/v1/notes/search` - 搜索笔记
- ✅ `GET /api/v1/notes/by-category/:category` - 按分类获取笔记
- ✅ `GET /api/v1/notes/by-tag/:tag` - 按标签获取笔记
- ✅ `POST /api/v1/notes` - 创建笔记
- ✅ `PUT /api/v1/notes/:id` - 更新笔记

---

## 📝 API 使用说明

### 创建笔记（支持 source）

**请求格式**:

```json
// 方式1：字符串数组（默认为 AI 生成）
{
  "title": "笔记标题",
  "content": "笔记内容",
  "tags": ["标签1", "标签2"]
}

// 方式2：对象数组（指定 source）
{
  "title": "笔记标题",
  "content": "笔记内容",
  "tags": [
    {"name": "标签1", "source": "manual"},
    {"name": "标签2", "source": "ai"}
  ]
}

// 方式3：混合格式（兼容）
{
  "title": "笔记标题",
  "content": "笔记内容",
  "tags": [
    "标签1",  // 默认为 AI
    {"name": "标签2", "source": "manual"}
  ]
}
```

### 更新笔记（支持 source）

与创建笔记相同，支持字符串数组和对象数组格式。

### 响应格式

所有返回笔记的接口，标签格式统一为：

```json
{
  "tags": [
    {
      "name": "标签名",
      "source": "manual"  // 或 "ai"
    }
  ]
}
```

---

## 🔧 数据库迁移步骤

### 1. 执行迁移脚本

```bash
mysql -u root -p bunnies_dreamworld < add_tag_source_field.sql
```

或直接在 MySQL 客户端执行：

```sql
USE bunnies_dreamworld;
SOURCE add_tag_source_field.sql;
```

### 2. 验证迁移结果

```sql
-- 检查字段是否存在
DESCRIBE note_tags;

-- 应该看到 source 字段：
-- source | enum('manual','ai') | DEFAULT 'ai'
```

---

## ⚠️ 注意事项

### 1. 数据兼容性

- ✅ **向后兼容**: 旧数据会自动设置为 `source = 'ai'`
- ✅ **格式兼容**: 接受字符串数组和对象数组两种格式
- ✅ **默认值**: 如果不指定 source，默认为 'ai'

### 2. Source 字段的位置

- ❌ **不在 tags 表**: 标签名称存储在 `tags` 表（全局唯一）
- ✅ **在 note_tags 表**: `source` 存储在 `note_tags` 关联表（每个笔记-标签关联独立）

**原因**: 同一个标签在不同笔记中可能有不同的 source：
- 笔记A：标签"学习"是手动添加的（source: 'manual'）
- 笔记B：标签"学习"是AI生成的（source: 'ai'）

### 3. 验证规则

- `name`: 必须存在且不为空
- `source`: 必须是 'manual' 或 'ai'，否则默认为 'ai'

---

## 🧪 测试建议

### 1. 测试创建笔记（字符串格式）

```bash
curl -X POST http://localhost:3000/api/v1/notes \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试笔记",
    "content": "测试内容",
    "tags": ["标签1", "标签2"]
  }'
```

**预期**: 标签 source 默认为 'ai'

### 2. 测试创建笔记（对象格式）

```bash
curl -X POST http://localhost:3000/api/v1/notes \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试笔记",
    "content": "测试内容",
    "tags": [
      {"name": "标签1", "source": "manual"},
      {"name": "标签2", "source": "ai"}
    ]
  }'
```

**预期**: 标签 source 按指定值存储

### 3. 测试获取笔记

```bash
curl -X GET http://localhost:3000/api/v1/notes/123 \
  -H "Authorization: Bearer TOKEN"
```

**预期**: 返回的标签包含 source 字段

---

## 📊 数据格式对比

### 修改前

```json
{
  "tags": ["标签1", "标签2"]
}
```

### 修改后

```json
{
  "tags": [
    {"name": "标签1", "source": "ai"},
    {"name": "标签2", "source": "manual"}
  ]
}
```

---

## ✅ 完成状态

- ✅ 数据库结构已更新（需要执行迁移脚本）
- ✅ 代码已修改支持 source 字段
- ✅ 向后兼容字符串数组格式
- ✅ 所有接口统一返回对象数组格式
- ✅ 兼容旧数据（自动设置默认值）

---

## 🚀 下一步

1. **执行数据库迁移**: 运行 `add_tag_source_field.sql`
2. **重启后端服务**: 确保代码更改生效
3. **前端测试**: 验证创建和获取笔记时标签格式正确

---

## 📄 相关文件

- `add_tag_source_field.sql` - 数据库迁移脚本
- `src/controllers/noteController.js` - 笔记控制器（已修改）
- `前端-追加标签接口更新说明.md` - 前端更新指南

