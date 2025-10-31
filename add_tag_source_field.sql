-- 为 note_tags 表添加 source 字段，支持标签来源标识
-- 用于区分手动添加的标签和AI生成的标签

USE bunnies_dreamworld;

-- 添加 source 字段到 note_tags 表
ALTER TABLE note_tags 
ADD COLUMN source ENUM('manual', 'ai', 'origin') DEFAULT 'ai' COMMENT '标签来源：manual-手动添加，ai-AI生成，origin-从笔记出处字段生成的智能标签';

-- 为已存在的数据设置默认值（默认为 'ai'，因为历史标签多为AI生成）
UPDATE note_tags SET source = 'ai' WHERE source IS NULL;

-- 添加索引以便查询
ALTER TABLE note_tags ADD INDEX idx_source (source);

-- 验证字段添加成功
SELECT '✅ note_tags 表已添加 source 字段' AS message;

