-- 创建回收站表
CREATE TABLE IF NOT EXISTS note_trash (
  id INT PRIMARY KEY AUTO_INCREMENT,
  original_note_id INT NOT NULL COMMENT '原笔记ID',
  user_id INT NOT NULL COMMENT '用户ID',
  title VARCHAR(500) NOT NULL COMMENT '笔记标题',
  content LONGTEXT NOT NULL COMMENT '笔记内容',
  category VARCHAR(50) DEFAULT 'knowledge' COMMENT '分类',
  is_favorite BOOLEAN DEFAULT FALSE COMMENT '是否收藏',
  word_count INT DEFAULT 0 COMMENT '字数统计',
  source VARCHAR(255) DEFAULT NULL COMMENT '笔记来源',
  url VARCHAR(500) DEFAULT NULL COMMENT '来源链接',
  category_tag VARCHAR(50) DEFAULT NULL COMMENT '分类标签',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '原创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '原更新时间',
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '删除时间',
  expire_at TIMESTAMP NOT NULL COMMENT '过期时间（删除后30天）',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_deleted_at (deleted_at),
  INDEX idx_expire_at (expire_at),
  INDEX idx_original_note_id (original_note_id),
  INDEX idx_user_expire (user_id, expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回收站表';
