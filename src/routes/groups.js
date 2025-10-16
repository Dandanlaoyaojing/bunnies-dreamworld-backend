// 组群管理路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');
const crypto = require('crypto');

router.use(authenticate);

// 创建组群
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, avatar, is_public = true, max_members = 50 } = req.body;
    
    // 验证必填字段
    if (!name || name.trim() === '') {
      return error(res, '组群名称不能为空', 400);
    }
    
    // 检查组群名称是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM `groups` WHERE name = ? AND status = "active"',
      [name.trim()]
    );
    
    if (existing.length > 0) {
      return error(res, '组群名称已存在', 400);
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 创建组群
      const [groupResult] = await pool.query(
        `INSERT INTO \`groups\` (name, description, avatar, creator_id, is_public, max_members) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name.trim(), description || '', avatar || '', userId, is_public, max_members]
      );
      
      const groupId = groupResult.insertId;
      
      // 将创建者添加为管理员
      await pool.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, "admin")',
        [groupId, userId]
      );
      
      await pool.query('COMMIT');
      
      return success(res, {
        id: groupId,
        name: name.trim(),
        description: description || '',
        avatar: avatar || '',
        is_public,
        max_members,
        member_count: 1,
        role: 'admin'
      }, '创建组群成功', 201);
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('创建组群失败:', err);
    return error(res, '创建组群失败', 500);
  }
});

// 获取我的组群列表
router.get('/my', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status = 'active' } = req.query;
    const offset = (page - 1) * limit;
    
    const [groups] = await pool.query(
      `SELECT 
        g.id,
        g.name,
        g.description,
        g.avatar,
        g.is_public,
        g.max_members,
        g.member_count,
        g.fusion_count,
        g.last_active_at,
        g.created_at,
        gm.role,
        gm.joined_at,
        gm.last_active_at as member_last_active
      FROM \`groups\` g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ? AND g.status = ? AND gm.status = 'active'
      ORDER BY g.last_active_at DESC, g.created_at DESC
      LIMIT ? OFFSET ?`,
      [userId, status, parseInt(limit), offset]
    );
    
    // 格式化数据
    const formattedGroups = groups.map(group => ({
      ...group,
      last_active: formatTimeAgo(group.last_active_at),
      member_last_active: formatTimeAgo(group.member_last_active)
    }));
    
    return success(res, {
      groups: formattedGroups,
      total: formattedGroups.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }, '获取我的组群列表成功');
  } catch (err) {
    console.error('获取我的组群列表失败:', err);
    return error(res, '获取我的组群列表失败', 500);
  }
});

// 获取推荐组群列表
router.get('/recommended', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    // 获取公开组群，排除用户已加入的
    const [groups] = await pool.query(
      `SELECT 
        g.id,
        g.name,
        g.description,
        g.avatar,
        g.is_public,
        g.max_members,
        g.member_count,
        g.fusion_count,
        g.last_active_at,
        g.created_at,
        u.username as creator_name
      FROM \`groups\` g
      JOIN users u ON g.creator_id = u.id
      WHERE g.is_public = true 
        AND g.status = 'active'
        AND g.id NOT IN (
          SELECT group_id FROM group_members 
          WHERE user_id = ? AND status = 'active'
        )
      ORDER BY g.member_count DESC, g.fusion_count DESC, g.created_at DESC
      LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), offset]
    );
    
    // 格式化数据
    const formattedGroups = groups.map(group => ({
      ...group,
      last_active: formatTimeAgo(group.last_active_at)
    }));
    
    return success(res, {
      groups: formattedGroups,
      total: formattedGroups.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }, '获取推荐组群列表成功');
  } catch (err) {
    console.error('获取推荐组群列表失败:', err);
    return error(res, '获取推荐组群列表失败', 500);
  }
});

// 获取组群详情
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.id;
    
    // 获取组群基本信息
    const [groups] = await pool.query(
      `SELECT 
        g.*,
        u.username as creator_name,
        u.avatar as creator_avatar
      FROM \`groups\` g
      JOIN users u ON g.creator_id = u.id
      WHERE g.id = ? AND g.status = 'active'`,
      [groupId]
    );
    
    if (groups.length === 0) {
      return error(res, '组群不存在', 404);
    }
    
    const group = groups[0];
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    const userRole = members.length > 0 ? members[0].role : null;
    const isMember = !!userRole;
    
    // 获取成员列表（仅成员可见）
    let memberList = [];
    if (isMember) {
      const [memberDetails] = await pool.query(
        `SELECT 
          gm.user_id,
          gm.role,
          gm.joined_at,
          gm.last_active_at,
          u.username,
          u.avatar
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ? AND gm.status = 'active'
        ORDER BY gm.role DESC, gm.joined_at ASC`,
        [groupId]
      );
      
      memberList = memberDetails.map(member => ({
        ...member,
        joined_at_formatted: new Date(member.joined_at).toLocaleString('zh-CN'),
        last_active: formatTimeAgo(member.last_active_at)
      }));
    }
    
    return success(res, {
      ...group,
      is_member: isMember,
      user_role: userRole,
      members: memberList,
      last_active: formatTimeAgo(group.last_active_at)
    }, '获取组群详情成功');
  } catch (err) {
    console.error('获取组群详情失败:', err);
    return error(res, '获取组群详情失败', 500);
  }
});

// 加入组群
router.post('/:id/join', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.id;
    
    // 检查组群是否存在
    const [groups] = await pool.query(
      'SELECT id, max_members, member_count, is_public FROM `groups` WHERE id = ? AND status = "active"',
      [groupId]
    );
    
    if (groups.length === 0) {
      return error(res, '组群不存在', 404);
    }
    
    const group = groups[0];
    
    // 检查是否已加入
    const [existing] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (existing.length > 0) {
      return error(res, '您已经加入该组群', 400);
    }
    
    // 检查组群是否已满
    if (group.member_count >= group.max_members) {
      return error(res, '组群已满，无法加入', 400);
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 添加成员
      await pool.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, "member")',
        [groupId, userId]
      );
      
      // 更新成员数量
      await pool.query(
        'UPDATE `groups` SET member_count = member_count + 1, last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
        [groupId]
      );
      
      await pool.query('COMMIT');
      
      return success(res, {
        group_id: groupId,
        role: 'member'
      }, '加入组群成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('加入组群失败:', err);
    return error(res, '加入组群失败', 500);
  }
});

// 退出组群
router.post('/:id/leave', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.id;
    
    // 检查是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 400);
    }
    
    const userRole = members[0].role;
    
    // 检查是否为创建者
    const [groups] = await pool.query(
      'SELECT creator_id FROM `groups` WHERE id = ?',
      [groupId]
    );
    
    if (groups.length > 0 && groups[0].creator_id === userId) {
      return error(res, '创建者不能退出组群，请先转让创建者权限或删除组群', 400);
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 移除成员
      await pool.query(
        'UPDATE group_members SET status = "inactive" WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      
      // 更新成员数量
      await pool.query(
        'UPDATE `groups` SET member_count = GREATEST(member_count - 1, 0), last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
        [groupId]
      );
      
      await pool.query('COMMIT');
      
      return success(res, null, '退出组群成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('退出组群失败:', err);
    return error(res, '退出组群失败', 500);
  }
});

// 更新组群信息
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.id;
    const { name, description, avatar, is_public, max_members } = req.body;
    
    // 检查用户权限
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    const userRole = members[0].role;
    if (userRole !== 'admin') {
      return error(res, '只有管理员可以修改组群信息', 403);
    }
    
    // 如果更新名称，检查是否重复
    if (name && name.trim()) {
      const [duplicate] = await pool.query(
        'SELECT id FROM `groups` WHERE name = ? AND id != ? AND status = "active"',
        [name.trim(), groupId]
      );
      
      if (duplicate.length > 0) {
        return error(res, '组群名称已存在', 400);
      }
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name.trim());
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (avatar !== undefined) {
      updateFields.push('avatar = ?');
      updateValues.push(avatar);
    }
    if (is_public !== undefined) {
      updateFields.push('is_public = ?');
      updateValues.push(is_public);
    }
    if (max_members !== undefined) {
      updateFields.push('max_members = ?');
      updateValues.push(max_members);
    }
    
    if (updateFields.length === 0) {
      return error(res, '没有需要更新的字段', 400);
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(groupId);
    
    await pool.query(
      `UPDATE \`groups\` SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    return success(res, { id: groupId }, '更新组群信息成功');
  } catch (err) {
    console.error('更新组群信息失败:', err);
    return error(res, '更新组群信息失败', 500);
  }
});

// 删除组群
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.id;
    
    // 检查是否为创建者
    const [groups] = await pool.query(
      'SELECT creator_id FROM `groups` WHERE id = ? AND status = "active"',
      [groupId]
    );
    
    if (groups.length === 0) {
      return error(res, '组群不存在', 404);
    }
    
    if (groups[0].creator_id !== userId) {
      return error(res, '只有创建者可以删除组群', 403);
    }
    
    // 软删除组群
    await pool.query(
      'UPDATE `groups` SET status = "deleted", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [groupId]
    );
    
    return success(res, null, '删除组群成功');
  } catch (err) {
    console.error('删除组群失败:', err);
    return error(res, '删除组群失败', 500);
  }
});

// 邀请用户加入组群
router.post('/:id/invite', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.id;
    const { invitee_email, invitee_phone, role = 'member' } = req.body;
    
    // 检查用户权限
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    const userRole = members[0].role;
    if (userRole !== 'admin') {
      return error(res, '只有管理员可以邀请用户', 403);
    }
    
    // 验证邀请信息
    if (!invitee_email && !invitee_phone) {
      return error(res, '请提供被邀请者的邮箱或手机号', 400);
    }
    
    // 生成邀请码
    const invitationCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期
    
    // 创建邀请记录
    await pool.query(
      `INSERT INTO group_invitations 
       (group_id, inviter_id, invitee_email, invitee_phone, invitation_code, role, expires_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [groupId, userId, invitee_email || null, invitee_phone || null, invitationCode, role, expiresAt]
    );
    
    return success(res, {
      invitation_code: invitationCode,
      expires_at: expiresAt
    }, '邀请发送成功');
  } catch (err) {
    console.error('邀请用户失败:', err);
    return error(res, '邀请用户失败', 500);
  }
});

// 处理邀请
router.post('/invite/:code', async (req, res) => {
  try {
    const userId = req.user.id;
    const invitationCode = req.params.code;
    const { action } = req.body; // 'accept' 或 'decline'
    
    // 查找邀请记录
    const [invitations] = await pool.query(
      `SELECT 
        gi.*,
        g.name as group_name,
        g.max_members,
        g.member_count
      FROM group_invitations gi
      JOIN groups g ON gi.group_id = g.id
      WHERE gi.invitation_code = ? 
        AND gi.status = 'pending' 
        AND gi.expires_at > NOW()
        AND (gi.invitee_id = ? OR gi.invitee_id IS NULL)`,
      [invitationCode, userId]
    );
    
    if (invitations.length === 0) {
      return error(res, '邀请不存在或已过期', 404);
    }
    
    const invitation = invitations[0];
    
    if (action === 'decline') {
      // 拒绝邀请
      await pool.query(
        'UPDATE group_invitations SET status = "declined", responded_at = CURRENT_TIMESTAMP WHERE id = ?',
        [invitation.id]
      );
      
      return success(res, null, '已拒绝邀请');
    }
    
    if (action === 'accept') {
      // 检查组群是否已满
      if (invitation.member_count >= invitation.max_members) {
        return error(res, '组群已满，无法加入', 400);
      }
      
      // 检查是否已加入
      const [existing] = await pool.query(
        'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
        [invitation.group_id, userId]
      );
      
      if (existing.length > 0) {
        return error(res, '您已经加入该组群', 400);
      }
      
      // 开始事务
      await pool.query('START TRANSACTION');
      
      try {
        // 添加成员
        await pool.query(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [invitation.group_id, userId, invitation.role]
        );
        
        // 更新成员数量
        await pool.query(
          'UPDATE groups SET member_count = member_count + 1, last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
          [invitation.group_id]
        );
        
        // 更新邀请状态
        await pool.query(
          'UPDATE group_invitations SET status = "accepted", responded_at = CURRENT_TIMESTAMP WHERE id = ?',
          [invitation.id]
        );
        
        await pool.query('COMMIT');
        
        return success(res, {
          group_id: invitation.group_id,
          group_name: invitation.group_name,
          role: invitation.role
        }, '成功加入组群');
      } catch (transactionErr) {
        await pool.query('ROLLBACK');
        throw transactionErr;
      }
    }
    
    return error(res, '无效的操作', 400);
  } catch (err) {
    console.error('处理邀请失败:', err);
    return error(res, '处理邀请失败', 500);
  }
});

// 获取我的邀请列表
router.get('/invitations/my', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [invitations] = await pool.query(
      `SELECT 
        gi.id,
        gi.group_id,
        gi.invitation_code,
        gi.role,
        gi.status,
        gi.expires_at,
        gi.created_at,
        g.name as group_name,
        g.description as group_description,
        g.avatar as group_avatar,
        u.username as inviter_name
      FROM group_invitations gi
      JOIN \`groups\` g ON gi.group_id = g.id
      JOIN users u ON gi.inviter_id = u.id
      WHERE gi.invitee_id = ? AND gi.status = 'pending' AND gi.expires_at > NOW()
      ORDER BY gi.created_at DESC`,
      [userId]
    );
    
    const formattedInvitations = invitations.map(invitation => ({
      ...invitation,
      expires_at_formatted: new Date(invitation.expires_at).toLocaleString('zh-CN'),
      created_at_formatted: new Date(invitation.created_at).toLocaleString('zh-CN')
    }));
    
    return success(res, {
      invitations: formattedInvitations,
      total: formattedInvitations.length
    }, '获取邀请列表成功');
  } catch (err) {
    console.error('获取邀请列表失败:', err);
    return error(res, '获取邀请列表失败', 500);
  }
});

// 辅助函数：格式化时间
function formatTimeAgo(date) {
  if (!date) return '从未活跃';
  
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return new Date(date).toLocaleDateString('zh-CN');
}

module.exports = router;
