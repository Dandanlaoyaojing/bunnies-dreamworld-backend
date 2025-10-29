-- 添加笔记来源字段的数据库更新脚本
-- 执行时间：2025-10-29

USE bunnies_dreamworld;

-- 添加 source 字段（笔记来源）
ALTER TABLE notes 
ADD COLUMN source VARCHAR(500) DEFAULT NULL COMMENT '笔记来源' AFTER category;

-- 添加 url 字段（相关链接）
ALTER TABLE notes 
ADD COLUMN url VARCHAR(1000) DEFAULT NULL COMMENT '相关链接' AFTER source;

-- 添加 category_tag 字段（分类标签）
ALTER TABLE notes 
ADD COLUMN category_tag VARCHAR(100) DEFAULT NULL COMMENT '分类标签' AFTER url;

-- 为新字段添加索引
ALTER TABLE notes 
ADD INDEX idx_source (source);

ALTER TABLE notes 
ADD INDEX idx_category_tag (category_tag);

-- 显示更新结果
SELECT '数据库更新完成！' as message;
SELECT '新增字段：source, url, category_tag' as new_fields;
