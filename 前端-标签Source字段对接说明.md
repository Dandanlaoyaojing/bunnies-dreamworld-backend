# 前端-标签Source字段对接说明

## 📋 更新内容

后端已支持标签的 `source` 字段，用于区分标签来源并在前端显示不同颜色。

---

## 🎨 标签类型和颜色

| 标签类型 | source 值 | 颜色代码 | 颜色说明 |
|---------|-----------|----------|----------|
| **手动标签** | `'manual'` | `#9C27B0` | 紫色 |
| **AI生成标签** | `'ai'` | `#007AFF` | 蓝色 |
| **出处智能标签** | `'origin'` | `#FF1493` | 玫红色 |

---

## ✅ 需要前端更新的内容

### 1. 接收标签数据（已更新格式）

**之前**：标签是字符串数组
```javascript
tags: ["标签1", "标签2"]
```

**现在**：标签是对象数组（包含 source 字段）
```javascript
tags: [
  {name: "标签1", source: "manual"},
  {name: "标签2", source: "ai"},
  {name: "标签3", source: "origin"}
]
```

### 2. 兼容旧数据

前端需要兼容旧数据（可能是字符串格式），建议添加转换函数：

```javascript
// 规范化标签格式（兼容旧数据）
function normalizeTag(tag) {
  if (typeof tag === 'string') {
    return {
      name: tag,
      source: 'ai' // 旧数据默认为 AI 标签
    };
  } else if (typeof tag === 'object' && tag !== null) {
    return {
      name: tag.name || tag,
      source: tag.source || 'ai'
    };
  }
  return null;
}

// 规范化标签数组
function normalizeTags(tags) {
  if (!tags || !Array.isArray(tags)) return [];
  return tags.map(tag => normalizeTag(tag)).filter(tag => tag !== null);
}
```

### 3. 发送标签数据（两种方式都支持）

**方式1：字符串数组**（默认为 AI 标签）
```javascript
POST /api/v1/notes
{
  "title": "笔记标题",
  "content": "笔记内容",
  "tags": ["标签1", "标签2"]  // 后端会自动转换为 AI 标签
}
```

**方式2：对象数组**（指定 source）
```javascript
POST /api/v1/notes
{
  "title": "笔记标题",
  "content": "笔记内容",
  "tags": [
    {name: "标签1", source: "manual"},    // 手动标签
    {name: "标签2", source: "ai"},        // AI标签
    {name: "标签3", source: "origin"}     // 出处智能标签
  ]
}
```

### 4. 显示标签颜色（CSS）

```css
/* 手动标签 - 紫色 */
.tag-manual {
  background-color: #9C27B0;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

/* AI标签 - 蓝色 */
.tag-ai {
  background-color: #007AFF;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

/* 出处智能标签 - 玫红色 */
.tag-origin {
  background-color: #FF1493;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
```

### 5. WXML 示例

```xml
<view class="tags-container">
  <view 
    wx:for="{{note.tags}}" 
    wx:key="name"
    class="tag {{item.source === 'manual' ? 'tag-manual' : (item.source === 'origin' ? 'tag-origin' : 'tag-ai')}}"
  >
    {{item.name}}
  </view>
</view>
```

### 6. JavaScript 颜色函数（可选）

```javascript
// 根据 source 获取标签颜色
function getTagColor(source) {
  switch(source) {
    case 'manual':
      return '#9C27B0'; // 紫色
    case 'origin':
      return '#FF1493'; // 玫红色
    case 'ai':
    default:
      return '#007AFF'; // 蓝色
  }
}

// 根据 source 获取标签类名
function getTagClassName(source) {
  switch(source) {
    case 'manual':
      return 'tag-manual';
    case 'origin':
      return 'tag-origin';
    case 'ai':
    default:
      return 'tag-ai';
  }
}
```

---

## 📝 具体使用场景

### 场景1：手动添加标签

```javascript
// 用户手动输入标签
const manualTag = {
  name: "学习",
  source: "manual"  // 标记为手动标签
};

// 添加到标签列表
note.tags.push(manualTag);
```

### 场景2：AI生成标签

```javascript
// 调用AI生成标签接口
wx.request({
  url: 'https://your-api.com/api/v1/ai/generate-tags',
  method: 'POST',
  data: {
    content: note.content,
    category: note.category
  },
  success: (res) => {
    // 后端返回的标签已经包含 source: 'ai'
    note.tags = res.data.tags; // [{name: "标签1", source: "ai"}, ...]
  }
});
```

### 场景3：出处智能标签

```javascript
// 调用出处标签生成接口
wx.request({
  url: 'https://your-api.com/api/v1/ai/generate-source-tags',
  method: 'POST',
  data: {
    source: note.source  // 笔记的出处字段
  },
  success: (res) => {
    // 后端返回的标签已经包含 source: 'origin'，color: '#FF1493'
    const originTags = res.data.tags; // [{name: "作者名", source: "origin", color: "#FF1493"}, ...]
    // 添加到标签列表
    note.tags = note.tags.concat(originTags);
  }
});
```

---

## 🔄 加载笔记时的处理

```javascript
// 加载笔记列表或详情
wx.request({
  url: 'https://your-api.com/api/v1/notes',
  method: 'GET',
  success: (res) => {
    const notes = res.data.notes;
    
    // 处理每个笔记的标签（确保格式统一）
    notes.forEach(note => {
      note.tags = normalizeTags(note.tags); // 兼容旧数据
    });
    
    this.setData({ notes });
  }
});
```

---

## ⚠️ 重要提醒

### 1. 功能完全一致

- ✅ **搜索功能**：所有标签都可以被搜索，不区分颜色
- ✅ **列表功能**：所有标签都在列表中显示
- ✅ **统计功能**：所有标签统一统计
- ✅ **数据归属**：所有标签功能完全一致

**唯一区别**：只在视觉呈现上有颜色区分（手动=紫色，AI=蓝色，出处=玫红色）

### 2. 向后兼容

- ✅ 后端同时支持字符串数组和对象数组
- ✅ 前端需要兼容旧数据（可能是字符串格式）
- ✅ 建议使用 `normalizeTags()` 函数统一处理

### 3. Source 字段位置

- ✅ 标签的 `source` 字段：用于区分标签来源（显示颜色）
- ✅ 笔记的 `source` 字段：用于存储笔记的出处信息（书籍、文章等）
- ✅ 两者不同，不会混淆

---

## 📋 更新检查清单

- [ ] 添加标签规范化函数（`normalizeTag`, `normalizeTags`）
- [ ] 更新 WXML：根据 `source` 动态添加 CSS 类
- [ ] 更新 WXSS：添加三种标签颜色的样式
- [ ] 更新手动添加标签逻辑：设置 `source: 'manual'`
- [ ] 更新 AI 生成标签逻辑：确保使用返回的标签（已包含 `source`）
- [ ] 更新出处标签逻辑：使用 `source: 'origin'` 的标签
- [ ] 更新加载笔记逻辑：兼容旧数据格式
- [ ] 测试：验证三种颜色的标签都能正确显示

---

## 📄 相关文档

- `后端-标签Source字段支持说明.md` - 后端技术文档
- `标签功能统一性说明.md` - 功能统一性说明
- `来源智能标签更新说明.md` - 出处智能标签说明

---

## 💡 示例代码

### 完整的标签处理工具函数

```javascript
// utils/tagHelper.js

/**
 * 规范化单个标签
 */
function normalizeTag(tag) {
  if (typeof tag === 'string') {
    return {
      name: tag,
      source: 'ai' // 旧数据默认为 AI
    };
  } else if (typeof tag && tag !== null) {
    return {
      name: tag.name || tag,
      source: tag.source || 'ai'
    };
  }
  return null;
}

/**
 * 规范化标签数组
 */
function normalizeTags(tags) {
  if (!tags || !Array.isArray(tags)) return [];
  return tags.map(tag => normalizeTag(tag)).filter(tag => tag !== null);
}

/**
 * 获取标签颜色
 */
function getTagColor(source) {
  switch(source) {
    case 'manual':
      return '#9C27B0'; // 紫色
    case 'origin':
      return '#FF1493'; // 玫红色
    case 'ai':
    default:
      return '#007AFF'; // 蓝色
  }
}

/**
 * 获取标签类名
 */
function getTagClassName(source) {
  switch(source) {
    case 'manual':
      return 'tag-manual';
    case 'origin':
      return 'tag-origin';
    case 'ai':
    default:
      return 'tag-ai';
  }
}

module.exports = {
  normalizeTag,
  normalizeTags,
  getTagColor,
  getTagClassName
};
```

---

## ✅ 总结

1. **接收数据**：标签现在是对象数组，包含 `name` 和 `source`
2. **显示颜色**：根据 `source` 显示不同颜色（手动=紫色，AI=蓝色，出处=玫红色）
3. **发送数据**：可以发送字符串数组或对象数组，后端都支持
4. **兼容旧数据**：需要处理可能存在的字符串格式标签
5. **功能一致**：所有标签功能完全相同，只是颜色不同

---

如有问题，请查看后端技术文档或联系后端开发人员。

