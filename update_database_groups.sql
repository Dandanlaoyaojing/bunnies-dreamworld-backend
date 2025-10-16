-- 组群协作功能数据库更新脚本
-- 执行此脚本以添加组群协作相关的表结构

USE bunnies_dreamworld;

-- 18. 组群表
CREATE TABLE IF NOT EXISTS `groups` (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '组群名称',
  description TEXT DEFAULT NULL COMMENT '组群描述',
  avatar VARCHAR(500) DEFAULT NULL COMMENT '组群头像URL',
  creator_id INT NOT NULL COMMENT '创建者用户ID',
  is_public BOOLEAN DEFAULT TRUE COMMENT '是否公开组群',
  max_members INT DEFAULT 50 COMMENT '最大成员数',
  member_count INT DEFAULT 1 COMMENT '当前成员数',
  fusion_count INT DEFAULT 0 COMMENT '融合次数',
  last_active_at TIMESTAMP NULL COMMENT '最后活跃时间',
  status ENUM('active', 'inactive', 'deleted') DEFAULT 'active' COMMENT '组群状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_creator_id (creator_id),
  INDEX idx_is_public (is_public),
  INDEX idx_status (status),
  INDEX idx_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组群表';

-- 19. 组群成员表
CREATE TABLE IF NOT EXISTS group_members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_id INT NOT NULL COMMENT '组群ID',
  user_id INT NOT NULL COMMENT '用户ID',
  role ENUM('admin', 'member') DEFAULT 'member' COMMENT '角色：管理员/成员',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  last_active_at TIMESTAMP NULL COMMENT '最后活跃时间',
  status ENUM('active', 'inactive', 'kicked') DEFAULT 'active' COMMENT '成员状态',
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_group_user (group_id, user_id),
  INDEX idx_group_id (group_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组群成员表';

-- 20. 组群融合记录表
CREATE TABLE IF NOT EXISTS group_fusions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_id INT NOT NULL COMMENT '组群ID',
  initiator_id INT NOT NULL COMMENT '发起者用户ID',
  fusion_type ENUM('smart', 'merge', 'add') DEFAULT 'smart' COMMENT '融合类型',
  source_nodes JSON DEFAULT NULL COMMENT '源节点数据',
  target_nodes JSON DEFAULT NULL COMMENT '目标节点数据',
  fusion_result JSON DEFAULT NULL COMMENT '融合结果',
  conflict_resolution JSON DEFAULT NULL COMMENT '冲突解决记录',
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' COMMENT '融合状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  completed_at TIMESTAMP NULL COMMENT '完成时间',
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (initiator_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_group_id (group_id),
  INDEX idx_initiator_id (initiator_id),
  INDEX idx_fusion_type (fusion_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组群融合记录表';

-- 21. 共享节点表
CREATE TABLE IF NOT EXISTS shared_nodes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_id INT NOT NULL COMMENT '组群ID',
  original_node_id INT DEFAULT NULL COMMENT '原始节点ID',
  name VARCHAR(100) NOT NULL COMMENT '节点名称',
  description TEXT DEFAULT NULL COMMENT '节点描述',
  category VARCHAR(50) DEFAULT 'knowledge' COMMENT '分类',
  level INT DEFAULT 1 COMMENT '节点层级',
  position_x FLOAT DEFAULT 0 COMMENT 'X坐标',
  position_y FLOAT DEFAULT 0 COMMENT 'Y坐标',
  importance INT DEFAULT 50 COMMENT '重要性评分(0-100)',
  connection_count INT DEFAULT 0 COMMENT '连接数量',
  contributor_count INT DEFAULT 1 COMMENT '贡献者数量',
  note_count INT DEFAULT 0 COMMENT '关联笔记数量',
  created_by INT NOT NULL COMMENT '创建者用户ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_group_id (group_id),
  INDEX idx_created_by (created_by),
  INDEX idx_category (category),
  INDEX idx_level (level),
  INDEX idx_importance (importance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='共享节点表';

-- 22. 共享节点关联表
CREATE TABLE IF NOT EXISTS shared_relations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_id INT NOT NULL COMMENT '组群ID',
  source_node_id INT NOT NULL COMMENT '源节点ID',
  target_node_id INT NOT NULL COMMENT '目标节点ID',
  relation_type VARCHAR(50) DEFAULT 'related' COMMENT '关联类型',
  strength FLOAT DEFAULT 0.5 COMMENT '关联强度(0-1)',
  contributor_count INT DEFAULT 1 COMMENT '贡献者数量',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES shared_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES shared_nodes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_shared_relation (source_node_id, target_node_id),
  INDEX idx_group_id (group_id),
  INDEX idx_source_node (source_node_id),
  INDEX idx_target_node (target_node_id),
  INDEX idx_strength (strength)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='共享节点关联表';

-- 23. 节点贡献记录表
CREATE TABLE IF NOT EXISTS node_contributions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  shared_node_id INT NOT NULL COMMENT '共享节点ID',
  user_id INT NOT NULL COMMENT '贡献者用户ID',
  contribution_type ENUM('create', 'update', 'merge', 'note_add') DEFAULT 'create' COMMENT '贡献类型',
  original_data JSON DEFAULT NULL COMMENT '原始数据',
  contribution_data JSON DEFAULT NULL COMMENT '贡献数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '贡献时间',
  FOREIGN KEY (shared_node_id) REFERENCES shared_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_shared_node_id (shared_node_id),
  INDEX idx_user_id (user_id),
  INDEX idx_contribution_type (contribution_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='节点贡献记录表';

-- 24. 组群邀请表
CREATE TABLE IF NOT EXISTS group_invitations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_id INT NOT NULL COMMENT '组群ID',
  inviter_id INT NOT NULL COMMENT '邀请者用户ID',
  invitee_id INT DEFAULT NULL COMMENT '被邀请者用户ID（如果已注册）',
  invitee_email VARCHAR(100) DEFAULT NULL COMMENT '被邀请者邮箱',
  invitee_phone VARCHAR(20) DEFAULT NULL COMMENT '被邀请者手机号',
  invitation_code VARCHAR(32) NOT NULL COMMENT '邀请码',
  role ENUM('admin', 'member') DEFAULT 'member' COMMENT '邀请角色',
  status ENUM('pending', 'accepted', 'declined', 'expired') DEFAULT 'pending' COMMENT '邀请状态',
  expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  responded_at TIMESTAMP NULL COMMENT '响应时间',
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_invitation_code (invitation_code),
  INDEX idx_group_id (group_id),
  INDEX idx_inviter_id (inviter_id),
  INDEX idx_invitee_id (invitee_id),
  INDEX idx_status (status),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组群邀请表';

-- 创建完成提示
SELECT '✅ 组群协作功能数据库表结构创建完成！' AS message;
