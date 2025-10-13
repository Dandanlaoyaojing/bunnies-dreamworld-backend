-- 添加微信和QQ登录支持字段
USE bunnies_dreamworld;

-- 为users表添加第三方登录字段
ALTER TABLE users 
ADD COLUMN openid VARCHAR(100) DEFAULT NULL COMMENT '微信OpenID',
ADD COLUMN unionid VARCHAR(100) DEFAULT NULL COMMENT '微信UnionID',
ADD COLUMN qq_openid VARCHAR(100) DEFAULT NULL COMMENT 'QQ OpenID',
ADD COLUMN login_type ENUM('username', 'wechat', 'qq') DEFAULT 'username' COMMENT '登录方式',
ADD COLUMN wechat_nickname VARCHAR(100) DEFAULT NULL COMMENT '微信昵称',
ADD COLUMN wechat_avatar VARCHAR(500) DEFAULT NULL COMMENT '微信头像',
ADD INDEX idx_openid (openid),
ADD INDEX idx_unionid (unionid),
ADD INDEX idx_qq_openid (qq_openid);

-- 修改username字段，允许为NULL（因为微信登录可能没有用户名）
ALTER TABLE users MODIFY COLUMN username VARCHAR(50) DEFAULT NULL;

-- 添加唯一索引到openid
ALTER TABLE users ADD UNIQUE INDEX unique_openid (openid);

SELECT '✅ 数据库更新完成：已添加微信和QQ登录支持' AS message;

