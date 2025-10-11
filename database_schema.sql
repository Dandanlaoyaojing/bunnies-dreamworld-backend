-- 小兔的梦幻世界笔记本 - 数据库表结构
-- 字符集：utf8mb4，支持emoji和中文

USE bunnies_dreamworld;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名',
  password VARCHAR(255) NOT NULL COMMENT '加密后的密码',
  nickname VARCHAR(100) DEFAULT NULL COMMENT '昵称',
  avatar VARCHAR(500) DEFAULT NULL COMMENT '头像URL',
  bio TEXT DEFAULT NULL COMMENT '个人简介',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  status ENUM('active', 'inactive', 'deleted') DEFAULT 'active' COMMENT '账户状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
  INDEX idx_username (username),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 2. 笔记表
CREATE TABLE IF NOT EXISTS notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  title VARCHAR(500) NOT NULL COMMENT '笔记标题',
  content LONGTEXT NOT NULL COMMENT '笔记内容',
  category VARCHAR(50) DEFAULT 'knowledge' COMMENT '分类（art,cute,dreams,foods,happiness,knowledge,sights,thinking）',
  is_favorite BOOLEAN DEFAULT FALSE COMMENT '是否收藏',
  is_deleted BOOLEAN DEFAULT FALSE COMMENT '是否已删除（软删除）',
  deleted_at TIMESTAMP NULL COMMENT '删除时间',
  word_count INT DEFAULT 0 COMMENT '字数统计',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_category (category),
  INDEX idx_favorite (is_favorite),
  INDEX idx_deleted (is_deleted),
  INDEX idx_created_at (created_at),
  FULLTEXT INDEX idx_fulltext (title, content) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记表';

-- 3. 标签表
CREATE TABLE IF NOT EXISTS tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  name VARCHAR(50) NOT NULL COMMENT '标签名称',
  color VARCHAR(20) DEFAULT '#5470C6' COMMENT '标签颜色',
  use_count INT DEFAULT 0 COMMENT '使用次数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_tag (user_id, name),
  INDEX idx_user_id (user_id),
  INDEX idx_use_count (use_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签表';

-- 4. 笔记-标签关联表
CREATE TABLE IF NOT EXISTS note_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  note_id INT NOT NULL COMMENT '笔记ID',
  tag_id INT NOT NULL COMMENT '标签ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE KEY unique_note_tag (note_id, tag_id),
  INDEX idx_note_id (note_id),
  INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记标签关联表';

-- 5. 分类表（预设分类）
CREATE TABLE IF NOT EXISTS categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL COMMENT '用户ID（NULL表示系统预设分类）',
  name VARCHAR(50) NOT NULL COMMENT '分类名称',
  icon VARCHAR(100) DEFAULT NULL COMMENT '分类图标',
  sort_order INT DEFAULT 0 COMMENT '排序序号',
  is_system BOOLEAN DEFAULT FALSE COMMENT '是否系统预设',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_user_id (user_id),
  INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分类表';

-- 插入系统预设分类
INSERT INTO categories (name, icon, sort_order, is_system) VALUES
('art', 'art.png', 1, TRUE),
('cute', 'cute.png', 2, TRUE),
('dreams', 'dreams.png', 3, TRUE),
('foods', 'foods.png', 4, TRUE),
('happiness', 'happiness.png', 5, TRUE),
('knowledge', 'knowledge.png', 6, TRUE),
('sights', 'sights.png', 7, TRUE),
('thinking', 'thinking.png', 8, TRUE);

-- 6. 草稿箱表
CREATE TABLE IF NOT EXISTS drafts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  title VARCHAR(500) DEFAULT '' COMMENT '草稿标题',
  content LONGTEXT DEFAULT NULL COMMENT '草稿内容',
  category VARCHAR(50) DEFAULT 'knowledge' COMMENT '分类',
  auto_saved BOOLEAN DEFAULT FALSE COMMENT '是否自动保存',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='草稿箱表';

-- 7. 文件附件表
CREATE TABLE IF NOT EXISTS files (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  note_id INT DEFAULT NULL COMMENT '关联的笔记ID',
  file_name VARCHAR(255) NOT NULL COMMENT '文件名',
  file_path VARCHAR(500) NOT NULL COMMENT '文件存储路径',
  file_type VARCHAR(50) NOT NULL COMMENT '文件类型（image/audio/document）',
  file_size INT DEFAULT 0 COMMENT '文件大小（字节）',
  mime_type VARCHAR(100) DEFAULT NULL COMMENT 'MIME类型',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_note_id (note_id),
  INDEX idx_file_type (file_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件附件表';

-- 8. 云同步记录表
CREATE TABLE IF NOT EXISTS sync_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  note_id INT NOT NULL COMMENT '笔记ID',
  sync_type ENUM('upload', 'download', 'update', 'delete') NOT NULL COMMENT '同步类型',
  sync_status ENUM('pending', 'success', 'failed') DEFAULT 'pending' COMMENT '同步状态',
  error_message TEXT DEFAULT NULL COMMENT '错误信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '同步时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_sync_status (sync_status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='云同步记录表';

-- 9. 数据备份记录表
CREATE TABLE IF NOT EXISTS backup_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  backup_type ENUM('manual', 'auto') DEFAULT 'manual' COMMENT '备份类型',
  file_path VARCHAR(500) NOT NULL COMMENT '备份文件路径',
  file_size INT DEFAULT 0 COMMENT '备份文件大小',
  note_count INT DEFAULT 0 COMMENT '备份笔记数量',
  status ENUM('success', 'failed') DEFAULT 'success' COMMENT '备份状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '备份时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据备份记录表';

-- 10. 用户反馈表
CREATE TABLE IF NOT EXISTS feedbacks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL COMMENT '用户ID',
  content TEXT NOT NULL COMMENT '反馈内容',
  contact VARCHAR(100) DEFAULT NULL COMMENT '联系方式',
  status ENUM('pending', 'processing', 'resolved') DEFAULT 'pending' COMMENT '处理状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表';

-- 11. 错误日志表
CREATE TABLE IF NOT EXISTS error_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL COMMENT '用户ID',
  error_type VARCHAR(100) NOT NULL COMMENT '错误类型',
  error_message TEXT NOT NULL COMMENT '错误信息',
  stack_trace TEXT DEFAULT NULL COMMENT '堆栈跟踪',
  page_url VARCHAR(500) DEFAULT NULL COMMENT '页面URL',
  user_agent TEXT DEFAULT NULL COMMENT '用户代理',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  INDEX idx_user_id (user_id),
  INDEX idx_error_type (error_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='错误日志表';

-- 12. 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  action VARCHAR(100) NOT NULL COMMENT '操作类型',
  resource_type VARCHAR(50) NOT NULL COMMENT '资源类型（note/user/file等）',
  resource_id INT DEFAULT NULL COMMENT '资源ID',
  details TEXT DEFAULT NULL COMMENT '操作详情',
  ip_address VARCHAR(50) DEFAULT NULL COMMENT 'IP地址',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- 13. JWT Token黑名单表（用于登出）
CREATE TABLE IF NOT EXISTS token_blacklist (
  id INT PRIMARY KEY AUTO_INCREMENT,
  token VARCHAR(500) NOT NULL COMMENT 'JWT Token',
  user_id INT NOT NULL COMMENT '用户ID',
  expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入黑名单时间',
  UNIQUE KEY unique_token (token(255)),
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token黑名单表';

-- 创建完成提示
SELECT '✅ 数据库表结构创建完成！' AS message;

