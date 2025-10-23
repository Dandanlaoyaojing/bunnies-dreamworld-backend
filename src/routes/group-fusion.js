// 组群知识星图融合路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取组群的共享知识星图
router.get('/:groupId/nodes', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { category, level, keyword, minImportance = 0, maxImportance = 100 } = req.query;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    let query = `
      SELECT 
        sn.id,
        sn.name,
        sn.description,
        sn.category,
        sn.level,
        sn.position_x,
        sn.position_y,
        sn.importance,
        sn.connection_count,
        sn.contributor_count,
        sn.note_count,
        sn.created_by,
        sn.created_at,
        sn.updated_at,
        u.username as creator_name,
        COUNT(sr.id) as actual_connections
      FROM shared_nodes sn
      LEFT JOIN shared_relations sr ON (sr.source_node_id = sn.id OR sr.target_node_id = sn.id)
      JOIN users u ON sn.created_by = u.id
      WHERE sn.group_id = ?
    `;
    
    const params = [groupId];
    
    // 添加筛选条件
    if (category && category !== 'all') {
      query += ' AND sn.category = ?';
      params.push(category);
    }
    
    if (level) {
      query += ' AND sn.level = ?';
      params.push(parseInt(level));
    }
    
    if (keyword && keyword.trim()) {
      query += ' AND (sn.name LIKE ? OR sn.description LIKE ?)';
      const searchKeyword = `%${keyword.trim()}%`;
      params.push(searchKeyword, searchKeyword);
    }
    
    if (minImportance) {
      query += ' AND sn.importance >= ?';
      params.push(parseInt(minImportance));
    }
    
    if (maxImportance) {
      query += ' AND sn.importance <= ?';
      params.push(parseInt(maxImportance));
    }
    
    query += ' GROUP BY sn.id ORDER BY sn.importance DESC, sn.created_at DESC';
    
    const [nodes] = await pool.query(query, params);
    
    // 处理节点数据
    const processedNodes = nodes.map(node => ({
      ...node,
      actual_connections: parseInt(node.actual_connections),
      created_at_formatted: new Date(node.created_at).toLocaleString('zh-CN')
    }));
    
    return success(res, {
      nodes: processedNodes,
      total: processedNodes.length
    }, '获取组群共享知识星图成功');
  } catch (err) {
    console.error('获取组群共享知识星图失败:', err);
    return error(res, '获取组群共享知识星图失败', 500);
  }
});

// 获取组群的共享关联关系
router.get('/:groupId/relations', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { minStrength = 0.1, relationType } = req.query;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    let query = `
      SELECT 
        sr.id,
        sr.source_node_id,
        sr.target_node_id,
        sr.relation_type,
        sr.strength,
        sr.contributor_count,
        sr.created_at,
        sn.name as source_name,
        tn.name as target_name
      FROM shared_relations sr
      JOIN shared_nodes sn ON sr.source_node_id = sn.id
      JOIN shared_nodes tn ON sr.target_node_id = tn.id
      WHERE sr.group_id = ?
    `;
    
    const params = [groupId];
    
    if (minStrength) {
      query += ' AND sr.strength >= ?';
      params.push(parseFloat(minStrength));
    }
    
    if (relationType) {
      query += ' AND sr.relation_type = ?';
      params.push(relationType);
    }
    
    query += ' ORDER BY sr.strength DESC';
    
    const [relations] = await pool.query(query, params);
    
    return success(res, {
      relations,
      total: relations.length
    }, '获取组群共享关联关系成功');
  } catch (err) {
    console.error('获取组群共享关联关系失败:', err);
    return error(res, '获取组群共享关联关系失败', 500);
  }
});

// 创建共享节点
router.post('/:groupId/nodes', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { name, description, category, level, position_x, position_y, importance, original_node_id } = req.body;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 验证必填字段
    if (!name || name.trim() === '') {
      return error(res, '节点名称不能为空', 400);
    }
    
    // 检查节点名称是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM shared_nodes WHERE group_id = ? AND name = ?',
      [groupId, name.trim()]
    );
    
    if (existing.length > 0) {
      return error(res, '节点名称已存在', 400);
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 创建共享节点
      const [result] = await pool.query(
        `INSERT INTO shared_nodes 
         (group_id, original_node_id, name, description, category, level, position_x, position_y, importance, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          groupId,
          original_node_id || null,
          name.trim(),
          description || '',
          category || 'knowledge',
          level || 1,
          position_x || 0,
          position_y || 0,
          importance || 50,
          userId
        ]
      );
      
      const nodeId = result.insertId;
      
      // 记录贡献
      await pool.query(
        `INSERT INTO node_contributions 
         (shared_node_id, user_id, contribution_type, contribution_data) 
         VALUES (?, ?, 'create', ?)`,
        [nodeId, userId, JSON.stringify({ name, description, category, level, importance })]
      );
      
      await pool.query('COMMIT');
      
      return success(res, { 
        id: nodeId,
        name: name.trim()
      }, '创建共享节点成功', 201);
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('创建共享节点失败:', err);
    return error(res, '创建共享节点失败', 500);
  }
});

// 更新共享节点
router.put('/:groupId/nodes/:nodeId', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const nodeId = req.params.nodeId;
    const { name, description, category, level, position_x, position_y, importance } = req.body;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 检查节点是否存在
    const [existing] = await pool.query(
      'SELECT id, name FROM shared_nodes WHERE id = ? AND group_id = ?',
      [nodeId, groupId]
    );
    
    if (existing.length === 0) {
      return error(res, '节点不存在', 404);
    }
    
    // 如果更新名称，检查是否重复
    if (name && name.trim()) {
      const [duplicate] = await pool.query(
        'SELECT id FROM shared_nodes WHERE group_id = ? AND name = ? AND id != ?',
        [groupId, name.trim(), nodeId]
      );
      
      if (duplicate.length > 0) {
        return error(res, '节点名称已存在', 400);
      }
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 更新节点
      await pool.query(
        `UPDATE shared_nodes SET 
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         category = COALESCE(?, category),
         level = COALESCE(?, level),
         position_x = COALESCE(?, position_x),
         position_y = COALESCE(?, position_y),
         importance = COALESCE(?, importance),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND group_id = ?`,
        [name, description, category, level, position_x, position_y, importance, nodeId, groupId]
      );
      
      // 记录贡献
      await pool.query(
        `INSERT INTO node_contributions 
         (shared_node_id, user_id, contribution_type, original_data, contribution_data) 
         VALUES (?, ?, 'update', ?, ?)`,
        [
          nodeId, 
          userId, 
          JSON.stringify(existing[0]), 
          JSON.stringify({ name, description, category, level, position_x, position_y, importance })
        ]
      );
      
      await pool.query('COMMIT');
      
      return success(res, { id: nodeId }, '更新共享节点成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('更新共享节点失败:', err);
    return error(res, '更新共享节点失败', 500);
  }
});

// 删除共享节点
router.delete('/:groupId/nodes/:nodeId', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const nodeId = req.params.nodeId;
    
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
      return error(res, '只有管理员可以删除节点', 403);
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 删除关联关系
      await pool.query(
        'DELETE FROM shared_relations WHERE group_id = ? AND (source_node_id = ? OR target_node_id = ?)',
        [groupId, nodeId, nodeId]
      );
      
      // 删除贡献记录
      await pool.query(
        'DELETE FROM node_contributions WHERE shared_node_id = ?',
        [nodeId]
      );
      
      // 删除节点
      const [result] = await pool.query(
        'DELETE FROM shared_nodes WHERE id = ? AND group_id = ?',
        [nodeId, groupId]
      );
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return error(res, '节点不存在', 404);
      }
      
      await pool.query('COMMIT');
      
      return success(res, null, '删除共享节点成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('删除共享节点失败:', err);
    return error(res, '删除共享节点失败', 500);
  }
});

// 创建共享关联关系
router.post('/:groupId/relations', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { source_node_id, target_node_id, relation_type, strength } = req.body;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 验证必填字段
    if (!source_node_id || !target_node_id) {
      return error(res, '源节点和目标节点ID不能为空', 400);
    }
    
    if (source_node_id === target_node_id) {
      return error(res, '源节点和目标节点不能相同', 400);
    }
    
    // 验证节点是否存在且属于当前组群
    const [nodes] = await pool.query(
      'SELECT id FROM shared_nodes WHERE group_id = ? AND id IN (?, ?)',
      [groupId, source_node_id, target_node_id]
    );
    
    if (nodes.length !== 2) {
      return error(res, '节点不存在或无权限', 404);
    }
    
    // 检查关联关系是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM shared_relations WHERE group_id = ? AND source_node_id = ? AND target_node_id = ?',
      [groupId, source_node_id, target_node_id]
    );
    
    if (existing.length > 0) {
      return error(res, '关联关系已存在', 400);
    }
    
    const [result] = await pool.query(
      'INSERT INTO shared_relations (group_id, source_node_id, target_node_id, relation_type, strength) VALUES (?, ?, ?, ?, ?)',
      [groupId, source_node_id, target_node_id, relation_type || 'related', strength || 0.5]
    );
    
    // 更新节点的连接数量
    await pool.query(
      'UPDATE shared_nodes SET connection_count = connection_count + 1 WHERE id IN (?, ?) AND group_id = ?',
      [source_node_id, target_node_id, groupId]
    );
    
    return success(res, { 
      id: result.insertId,
      source_node_id,
      target_node_id
    }, '创建共享关联关系成功', 201);
  } catch (err) {
    console.error('创建共享关联关系失败:', err);
    return error(res, '创建共享关联关系失败', 500);
  }
});

// 删除共享关联关系
router.delete('/:groupId/relations/:relationId', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const relationId = req.params.relationId;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 获取关联关系信息
    const [relations] = await pool.query(
      'SELECT source_node_id, target_node_id FROM shared_relations WHERE id = ? AND group_id = ?',
      [relationId, groupId]
    );
    
    if (relations.length === 0) {
      return error(res, '关联关系不存在', 404);
    }
    
    const relation = relations[0];
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 删除关联关系
      const [result] = await pool.query(
        'DELETE FROM shared_relations WHERE id = ? AND group_id = ?',
        [relationId, groupId]
      );
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return error(res, '关联关系不存在', 404);
      }
      
      // 更新节点的连接数量
      await pool.query(
        'UPDATE shared_nodes SET connection_count = GREATEST(connection_count - 1, 0) WHERE id IN (?, ?) AND group_id = ?',
        [relation.source_node_id, relation.target_node_id, groupId]
      );
      
      await pool.query('COMMIT');
      
      return success(res, null, '删除共享关联关系成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('删除共享关联关系失败:', err);
    return error(res, '删除共享关联关系失败', 500);
  }
});

// 发起知识星图融合
router.post('/:groupId/fuse', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { fusion_type = 'smart', source_nodes, target_nodes, min_relation = 0.3 } = req.body;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 验证融合数据
    if (!source_nodes || !Array.isArray(source_nodes) || source_nodes.length === 0) {
      return error(res, '请提供源节点数据', 400);
    }
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 创建融合记录
      const [fusionResult] = await pool.query(
        `INSERT INTO group_fusions 
         (group_id, initiator_id, fusion_type, source_nodes, target_nodes, status) 
         VALUES (?, ?, ?, ?, ?, 'processing')`,
        [
          groupId,
          userId,
          fusion_type,
          JSON.stringify(source_nodes),
          target_nodes ? JSON.stringify(target_nodes) : null
        ]
      );
      
      const fusionId = fusionResult.insertId;
      
      // 执行融合算法
      const fusionResult_data = await performFusion(source_nodes, target_nodes, fusion_type, min_relation);
      
      // 更新融合记录
      await pool.query(
        `UPDATE group_fusions SET 
         fusion_result = ?, 
         conflict_resolution = ?, 
         status = 'completed', 
         completed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [
          JSON.stringify(fusionResult_data.result),
          JSON.stringify(fusionResult_data.conflicts),
          fusionId
        ]
      );
      
    // 更新组群融合次数
    await pool.query(
      'UPDATE `groups` SET fusion_count = fusion_count + 1, last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
      [groupId]
    );
      
      await pool.query('COMMIT');
      
      return success(res, {
        fusion_id: fusionId,
        result: fusionResult_data.result,
        conflicts: fusionResult_data.conflicts
      }, '知识星图融合成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      
      // 更新融合状态为失败
      await pool.query(
        'UPDATE group_fusions SET status = "failed", completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [fusionResult.insertId]
      );
      
      throw transactionErr;
    }
  } catch (err) {
    console.error('知识星图融合失败:', err);
    return error(res, '知识星图融合失败', 500);
  }
});

// 获取融合历史
router.get('/:groupId/fusions', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    const [fusions] = await pool.query(
      `SELECT 
        gf.id,
        gf.fusion_type,
        gf.status,
        gf.created_at,
        gf.completed_at,
        u.username as initiator_name
      FROM group_fusions gf
      JOIN users u ON gf.initiator_id = u.id
      WHERE gf.group_id = ?
      ORDER BY gf.created_at DESC
      LIMIT ? OFFSET ?`,
      [groupId, parseInt(limit), offset]
    );
    
    const formattedFusions = fusions.map(fusion => ({
      ...fusion,
      created_at_formatted: new Date(fusion.created_at).toLocaleString('zh-CN'),
      completed_at_formatted: fusion.completed_at ? new Date(fusion.completed_at).toLocaleString('zh-CN') : null
    }));
    
    return success(res, {
      fusions: formattedFusions,
      total: formattedFusions.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }, '获取融合历史成功');
  } catch (err) {
    console.error('获取融合历史失败:', err);
    return error(res, '获取融合历史失败', 500);
  }
});

// 获取节点贡献记录
router.get('/:groupId/nodes/:nodeId/contributions', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const nodeId = req.params.nodeId;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 检查节点是否存在
    const [nodes] = await pool.query(
      'SELECT id FROM shared_nodes WHERE id = ? AND group_id = ?',
      [nodeId, groupId]
    );
    
    if (nodes.length === 0) {
      return error(res, '节点不存在', 404);
    }
    
    const [contributions] = await pool.query(
      `SELECT 
        nc.id,
        nc.contribution_type,
        nc.original_data,
        nc.contribution_data,
        nc.created_at,
        u.username as contributor_name,
        u.avatar as contributor_avatar
      FROM node_contributions nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.shared_node_id = ?
      ORDER BY nc.created_at DESC`,
      [nodeId]
    );
    
    const formattedContributions = contributions.map(contribution => ({
      ...contribution,
      created_at_formatted: new Date(contribution.created_at).toLocaleString('zh-CN')
    }));
    
    return success(res, {
      contributions: formattedContributions,
      total: formattedContributions.length
    }, '获取节点贡献记录成功');
  } catch (err) {
    console.error('获取节点贡献记录失败:', err);
    return error(res, '获取节点贡献记录失败', 500);
  }
});

// 获取融合节点相关的所有笔记
router.get('/:groupId/nodes/:nodeId/notes', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const nodeId = req.params.nodeId;
    const { page = 1, limit = 20, keyword } = req.query;
    const offset = (page - 1) * limit;
    
    // 检查用户是否为组群成员
    const [members] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = "active"',
      [groupId, userId]
    );
    
    if (members.length === 0) {
      return error(res, '您不是该组群成员', 403);
    }
    
    // 获取节点信息
    const [nodeInfo] = await pool.query(
      'SELECT name, description FROM shared_nodes WHERE id = ? AND group_id = ?',
      [nodeId, groupId]
    );
    
    if (nodeInfo.length === 0) {
      return error(res, '节点不存在', 404);
    }
    
    const node = nodeInfo[0];
    
    // 获取组群所有成员的用户ID
    const [groupMembers] = await pool.query(
      'SELECT user_id FROM group_members WHERE group_id = ? AND status = "active"',
      [groupId]
    );
    
    const memberIds = groupMembers.map(member => member.user_id);
    
    if (memberIds.length === 0) {
      return success(res, {
        notes: [],
        total: 0,
        node: node
      }, '获取节点相关笔记成功');
    }
    
    // 构建查询条件
    let query = `
      SELECT 
        n.id,
        n.title,
        n.content,
        n.category,
        n.tags,
        n.created_at,
        n.updated_at,
        n.user_id,
        u.username as author_name,
        u.avatar as author_avatar
      FROM notes n
      JOIN users u ON n.user_id = u.id
      WHERE n.user_id IN (${memberIds.map(() => '?').join(',')})
        AND n.status = 'active'
        AND (
          n.title LIKE ? OR 
          n.content LIKE ? OR 
          n.tags LIKE ?
        )
    `;
    
    const params = [
      ...memberIds,
      `%${node.name}%`,
      `%${node.name}%`,
      `%${node.name}%`
    ];
    
    // 如果节点有描述，也搜索描述关键词
    if (node.description && node.description.trim()) {
      const descriptionKeywords = node.description.split(/\s+/).filter(word => word.length > 1);
      descriptionKeywords.forEach(keyword => {
        query += ` OR n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?`;
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      });
    }
    
    // 添加关键词搜索
    if (keyword && keyword.trim()) {
      query += ` AND (n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)`;
      const searchKeyword = `%${keyword.trim()}%`;
      params.push(searchKeyword, searchKeyword, searchKeyword);
    }
    
    query += ` ORDER BY n.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [notes] = await pool.query(query, params);
    
    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM notes n
      WHERE n.user_id IN (${memberIds.map(() => '?').join(',')})
        AND n.status = 'active'
        AND (
          n.title LIKE ? OR 
          n.content LIKE ? OR 
          n.tags LIKE ?
        )
    `;
    
    const countParams = [
      ...memberIds,
      `%${node.name}%`,
      `%${node.name}%`,
      `%${node.name}%`
    ];
    
    if (node.description && node.description.trim()) {
      const descriptionKeywords = node.description.split(/\s+/).filter(word => word.length > 1);
      descriptionKeywords.forEach(keyword => {
        countQuery += ` OR n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?`;
        countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      });
    }
    
    if (keyword && keyword.trim()) {
      countQuery += ` AND (n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)`;
      const searchKeyword = `%${keyword.trim()}%`;
      countParams.push(searchKeyword, searchKeyword, searchKeyword);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    
    // 格式化笔记数据
    const formattedNotes = notes.map(note => {
      let tags = [];
      try {
        tags = note.tags ? JSON.parse(note.tags) : [];
      } catch (e) {
        tags = [];
      }
      
      return {
        ...note,
        tags: tags,
        created_at_formatted: new Date(note.created_at).toLocaleString('zh-CN'),
        updated_at_formatted: new Date(note.updated_at).toLocaleString('zh-CN'),
        content_preview: note.content ? note.content.substring(0, 200) + (note.content.length > 200 ? '...' : '') : ''
      };
    });
    
    return success(res, {
      notes: formattedNotes,
      total: total,
      node: {
        id: nodeId,
        name: node.name,
        description: node.description
      },
      page: parseInt(page),
      limit: parseInt(limit)
    }, '获取节点相关笔记成功');
  } catch (err) {
    console.error('获取节点相关笔记失败:', err);
    return error(res, '获取节点相关笔记失败', 500);
  }
});

// 融合算法实现
async function performFusion(sourceNodes, targetNodes, fusionType, minRelation) {
  const result = {
    nodes: [],
    relations: [],
    conflicts: []
  };
  
  try {
    switch (fusionType) {
      case 'smart':
        return await smartFusion(sourceNodes, targetNodes, minRelation);
      case 'ai_smart':
        // AI智能融合功能已移除，回退到智能融合
        return await smartFusion(sourceNodes, targetNodes, minRelation);
      case 'merge':
        return await mergeFusion(sourceNodes, targetNodes);
      case 'add':
        return await addFusion(sourceNodes, targetNodes);
      default:
        return await smartFusion(sourceNodes, targetNodes, minRelation);
    }
  } catch (err) {
    console.error('融合算法执行失败:', err);
    throw err;
  }
}

// 智能融合算法
async function smartFusion(sourceNodes, targetNodes, minRelation) {
  const result = {
    nodes: [],
    relations: [],
    conflicts: []
  };
  
  // 创建节点映射
  const nodeMap = new Map();
  const mergedNodes = [];
  
  // 处理源节点
  sourceNodes.forEach(node => {
    nodeMap.set(node.name, {
      ...node,
      sources: ['source'],
      contributors: 1
    });
  });
  
  // 处理目标节点
  if (targetNodes && targetNodes.length > 0) {
    targetNodes.forEach(node => {
      if (nodeMap.has(node.name)) {
        // 节点名称冲突，需要合并
        const existing = nodeMap.get(node.name);
        result.conflicts.push({
          type: 'node_name_conflict',
          node_name: node.name,
          resolution: 'merge',
          source_data: existing,
          target_data: node
        });
        
        // 合并节点数据
        nodeMap.set(node.name, {
          ...existing,
          description: existing.description || node.description,
          importance: Math.max(existing.importance || 0, node.importance || 0),
          sources: [...existing.sources, 'target'],
          contributors: existing.contributors + 1
        });
      } else {
        nodeMap.set(node.name, {
          ...node,
          sources: ['target'],
          contributors: 1
        });
      }
    });
  }
  
  // 生成最终节点列表
  nodeMap.forEach((node, name) => {
    mergedNodes.push({
      name: name,
      description: node.description || '',
      category: node.category || 'knowledge',
      level: node.level || 1,
      importance: node.importance || 50,
      position_x: node.position_x || Math.random() * 800,
      position_y: node.position_y || Math.random() * 600,
      contributor_count: node.contributors,
      sources: node.sources
    });
  });
  
  result.nodes = mergedNodes;
  
  // 生成关联关系
  const relations = [];
  for (let i = 0; i < mergedNodes.length; i++) {
    for (let j = i + 1; j < mergedNodes.length; j++) {
      const node1 = mergedNodes[i];
      const node2 = mergedNodes[j];
      
      // 计算关联强度（基于分类、重要性等）
      let strength = 0.1; // 基础关联强度
      
      if (node1.category === node2.category) {
        strength += 0.3;
      }
      
      if (node1.level === node2.level) {
        strength += 0.2;
      }
      
      // 基于重要性的关联
      const importanceDiff = Math.abs(node1.importance - node2.importance);
      strength += (100 - importanceDiff) / 100 * 0.4;
      
      if (strength >= minRelation) {
        relations.push({
          source_name: node1.name,
          target_name: node2.name,
          relation_type: 'related',
          strength: Math.min(strength, 1.0)
        });
      }
    }
  }
  
  result.relations = relations;
  
  return result;
}

// 合并融合算法
async function mergeFusion(sourceNodes, targetNodes) {
  const result = {
    nodes: [...sourceNodes],
    relations: [],
    conflicts: []
  };
  
  if (targetNodes && targetNodes.length > 0) {
    targetNodes.forEach(node => {
      const existing = result.nodes.find(n => n.name === node.name);
      if (existing) {
        result.conflicts.push({
          type: 'node_name_conflict',
          node_name: node.name,
          resolution: 'merge'
        });
        
        // 合并节点
        existing.description = existing.description || node.description;
        existing.importance = Math.max(existing.importance || 0, node.importance || 0);
      } else {
        result.nodes.push(node);
      }
    });
  }
  
  return result;
}

// 添加融合算法
async function addFusion(sourceNodes, targetNodes) {
  const result = {
    nodes: [...sourceNodes],
    relations: [],
    conflicts: []
  };
  
  if (targetNodes && targetNodes.length > 0) {
    targetNodes.forEach(node => {
      const existing = result.nodes.find(n => n.name === node.name);
      if (existing) {
        result.conflicts.push({
          type: 'node_name_conflict',
          node_name: node.name,
          resolution: 'skip'
        });
      } else {
        result.nodes.push(node);
      }
    });
  }
  
  return result;
}

module.exports = router;
