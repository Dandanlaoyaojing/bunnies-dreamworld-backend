// 知识星图路由
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

router.use(authenticate);

// 获取知识星图节点
router.get('/nodes', async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, level, keyword, minImportance = 0, maxImportance = 100 } = req.query;
    
    let query = `
      SELECT 
        kn.id,
        kn.name,
        kn.description,
        kn.category,
        kn.level,
        kn.position_x,
        kn.position_y,
        kn.importance,
        kn.connection_count,
        kn.created_at,
        kn.updated_at,
        COUNT(kr.id) as actual_connections
      FROM knowledge_nodes kn
      LEFT JOIN knowledge_relations kr ON (kr.source_node_id = kn.id OR kr.target_node_id = kn.id) AND kr.user_id = ?
      WHERE kn.user_id = ?
    `;
    
    const params = [userId, userId];
    
    // 添加筛选条件
    if (category && category !== 'all') {
      query += ' AND kn.category = ?';
      params.push(category);
    }
    
    if (level) {
      query += ' AND kn.level = ?';
      params.push(parseInt(level));
    }
    
    if (keyword && keyword.trim()) {
      query += ' AND (kn.name LIKE ? OR kn.description LIKE ?)';
      const searchKeyword = `%${keyword.trim()}%`;
      params.push(searchKeyword, searchKeyword);
    }
    
    if (minImportance) {
      query += ' AND kn.importance >= ?';
      params.push(parseInt(minImportance));
    }
    
    if (maxImportance) {
      query += ' AND kn.importance <= ?';
      params.push(parseInt(maxImportance));
    }
    
    query += ' GROUP BY kn.id ORDER BY kn.importance DESC, kn.created_at DESC';
    
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
    }, '获取知识星图节点成功');
  } catch (err) {
    console.error('获取知识星图节点失败:', err);
    return error(res, '获取知识星图节点失败', 500);
  }
});

// 获取知识星图关联关系
router.get('/relations', async (req, res) => {
  try {
    const userId = req.user.id;
    const { minStrength = 0.1, relationType } = req.query;
    
    let query = `
      SELECT 
        kr.id,
        kr.source_node_id,
        kr.target_node_id,
        kr.relation_type,
        kr.strength,
        kr.created_at,
        sn.name as source_name,
        tn.name as target_name
      FROM knowledge_relations kr
      JOIN knowledge_nodes sn ON kr.source_node_id = sn.id
      JOIN knowledge_nodes tn ON kr.target_node_id = tn.id
      WHERE kr.user_id = ? AND sn.user_id = ? AND tn.user_id = ?
    `;
    
    const params = [userId, userId, userId];
    
    if (minStrength) {
      query += ' AND kr.strength >= ?';
      params.push(parseFloat(minStrength));
    }
    
    if (relationType) {
      query += ' AND kr.relation_type = ?';
      params.push(relationType);
    }
    
    query += ' ORDER BY kr.strength DESC';
    
    const [relations] = await pool.query(query, params);
    
    return success(res, {
      relations,
      total: relations.length
    }, '获取知识星图关联关系成功');
  } catch (err) {
    console.error('获取知识星图关联关系失败:', err);
    return error(res, '获取知识星图关联关系失败', 500);
  }
});

// 创建知识星图节点
router.post('/nodes', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, category, level, position_x, position_y, importance } = req.body;
    
    // 验证必填字段
    if (!name || name.trim() === '') {
      return error(res, '节点名称不能为空', 400);
    }
    
    // 检查节点名称是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM knowledge_nodes WHERE user_id = ? AND name = ?',
      [userId, name.trim()]
    );
    
    if (existing.length > 0) {
      return error(res, '节点名称已存在', 400);
    }
    
    const [result] = await pool.query(
      `INSERT INTO knowledge_nodes 
       (user_id, name, description, category, level, position_x, position_y, importance) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        name.trim(),
        description || '',
        category || 'knowledge',
        level || 1,
        position_x || 0,
        position_y || 0,
        importance || 50
      ]
    );
    
    return success(res, { 
      id: result.insertId,
      name: name.trim()
    }, '创建知识星图节点成功', 201);
  } catch (err) {
    console.error('创建知识星图节点失败:', err);
    return error(res, '创建知识星图节点失败', 500);
  }
});

// 更新知识星图节点
router.put('/nodes/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const nodeId = req.params.id;
    const { name, description, category, level, position_x, position_y, importance } = req.body;
    
    // 检查节点是否存在
    const [existing] = await pool.query(
      'SELECT id FROM knowledge_nodes WHERE id = ? AND user_id = ?',
      [nodeId, userId]
    );
    
    if (existing.length === 0) {
      return error(res, '节点不存在', 404);
    }
    
    // 如果更新名称，检查是否重复
    if (name && name.trim()) {
      const [duplicate] = await pool.query(
        'SELECT id FROM knowledge_nodes WHERE user_id = ? AND name = ? AND id != ?',
        [userId, name.trim(), nodeId]
      );
      
      if (duplicate.length > 0) {
        return error(res, '节点名称已存在', 400);
      }
    }
    
    await pool.query(
      `UPDATE knowledge_nodes SET 
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       category = COALESCE(?, category),
       level = COALESCE(?, level),
       position_x = COALESCE(?, position_x),
       position_y = COALESCE(?, position_y),
       importance = COALESCE(?, importance),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [name, description, category, level, position_x, position_y, importance, nodeId, userId]
    );
    
    return success(res, { id: nodeId }, '更新知识星图节点成功');
  } catch (err) {
    console.error('更新知识星图节点失败:', err);
    return error(res, '更新知识星图节点失败', 500);
  }
});

// 删除知识星图节点
router.delete('/nodes/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const nodeId = req.params.id;
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 删除关联关系
      await pool.query(
        'DELETE FROM knowledge_relations WHERE user_id = ? AND (source_node_id = ? OR target_node_id = ?)',
        [userId, nodeId, nodeId]
      );
      
      // 删除节点
      const [result] = await pool.query(
        'DELETE FROM knowledge_nodes WHERE id = ? AND user_id = ?',
        [nodeId, userId]
      );
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return error(res, '节点不存在', 404);
      }
      
      await pool.query('COMMIT');
      
      return success(res, null, '删除知识星图节点成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('删除知识星图节点失败:', err);
    return error(res, '删除知识星图节点失败', 500);
  }
});

// 创建知识星图关联关系
router.post('/relations', async (req, res) => {
  try {
    const userId = req.user.id;
    const { source_node_id, target_node_id, relation_type, strength } = req.body;
    
    // 验证必填字段
    if (!source_node_id || !target_node_id) {
      return error(res, '源节点和目标节点ID不能为空', 400);
    }
    
    if (source_node_id === target_node_id) {
      return error(res, '源节点和目标节点不能相同', 400);
    }
    
    // 验证节点是否存在且属于当前用户
    const [nodes] = await pool.query(
      'SELECT id FROM knowledge_nodes WHERE user_id = ? AND id IN (?, ?)',
      [userId, source_node_id, target_node_id]
    );
    
    if (nodes.length !== 2) {
      return error(res, '节点不存在或无权限', 404);
    }
    
    // 检查关联关系是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM knowledge_relations WHERE user_id = ? AND source_node_id = ? AND target_node_id = ?',
      [userId, source_node_id, target_node_id]
    );
    
    if (existing.length > 0) {
      return error(res, '关联关系已存在', 400);
    }
    
    const [result] = await pool.query(
      'INSERT INTO knowledge_relations (user_id, source_node_id, target_node_id, relation_type, strength) VALUES (?, ?, ?, ?, ?)',
      [userId, source_node_id, target_node_id, relation_type || 'related', strength || 0.5]
    );
    
    // 更新节点的连接数量
    await pool.query(
      'UPDATE knowledge_nodes SET connection_count = connection_count + 1 WHERE id IN (?, ?) AND user_id = ?',
      [source_node_id, target_node_id, userId]
    );
    
    return success(res, { 
      id: result.insertId,
      source_node_id,
      target_node_id
    }, '创建知识星图关联关系成功', 201);
  } catch (err) {
    console.error('创建知识星图关联关系失败:', err);
    return error(res, '创建知识星图关联关系失败', 500);
  }
});

// 删除知识星图关联关系
router.delete('/relations/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const relationId = req.params.id;
    
    // 获取关联关系信息
    const [relations] = await pool.query(
      'SELECT source_node_id, target_node_id FROM knowledge_relations WHERE id = ? AND user_id = ?',
      [relationId, userId]
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
        'DELETE FROM knowledge_relations WHERE id = ? AND user_id = ?',
        [relationId, userId]
      );
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return error(res, '关联关系不存在', 404);
      }
      
      // 更新节点的连接数量
      await pool.query(
        'UPDATE knowledge_nodes SET connection_count = GREATEST(connection_count - 1, 0) WHERE id IN (?, ?) AND user_id = ?',
        [relation.source_node_id, relation.target_node_id, userId]
      );
      
      await pool.query('COMMIT');
      
      return success(res, null, '删除知识星图关联关系成功');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('删除知识星图关联关系失败:', err);
    return error(res, '删除知识星图关联关系失败', 500);
  }
});

// 知识图谱分析生成（使用本地算法，非AI）
router.post('/analyze', async (req, res) => {
  try {
    const userId = req.user.id;
    const { notes, minRelation = 0.3, maxLevel = 3 } = req.body;
    
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return error(res, '请提供笔记数据', 400);
    }
    
    // 分析笔记中的标签关联（本地算法）
    const tagAnalysis = analyzeTagRelations(notes, minRelation);
    
    // 生成知识图谱节点
    const nodes = generateKnowledgeNodes(tagAnalysis, maxLevel);
    
    // 生成知识图谱关联关系
    const relations = generateKnowledgeRelations(tagAnalysis, minRelation);
    
    return success(res, {
      nodes,
      relations,
      analysis: {
        total_notes: notes.length,
        unique_tags: tagAnalysis.tags.length,
        total_relations: relations.length,
        min_relation: minRelation,
        max_level: maxLevel
      }
    }, '知识图谱分析生成成功');
  } catch (err) {
    console.error('知识图谱分析生成失败:', err);
    return error(res, '知识图谱分析生成失败', 500);
  }
});

// 按分类获取知识图谱
router.get('/by-category/:category', async (req, res) => {
  try {
    const userId = req.user.id;
    const category = req.params.category;
    
    // 获取节点
    const [nodes] = await pool.query(
      `SELECT 
        kn.id,
        kn.name,
        kn.description,
        kn.category,
        kn.level,
        kn.position_x,
        kn.position_y,
        kn.importance,
        kn.connection_count,
        kn.created_at,
        COUNT(kr.id) as actual_connections
      FROM knowledge_nodes kn
      LEFT JOIN knowledge_relations kr ON (kr.source_node_id = kn.id OR kr.target_node_id = kn.id) AND kr.user_id = ?
      WHERE kn.user_id = ? AND kn.category = ?
      GROUP BY kn.id
      ORDER BY kn.importance DESC`,
      [userId, userId, category]
    );
    
    // 获取关联关系
    const [relations] = await pool.query(
      `SELECT 
        kr.id,
        kr.source_node_id,
        kr.target_node_id,
        kr.relation_type,
        kr.strength,
        kr.created_at,
        sn.name as source_name,
        tn.name as target_name
      FROM knowledge_relations kr
      JOIN knowledge_nodes sn ON kr.source_node_id = sn.id AND sn.category = ?
      JOIN knowledge_nodes tn ON kr.target_node_id = tn.id AND tn.category = ?
      WHERE kr.user_id = ? AND sn.user_id = ? AND tn.user_id = ?
      ORDER BY kr.strength DESC`,
      [category, category, userId, userId, userId]
    );
    
    return success(res, {
      category,
      nodes,
      relations,
      node_count: nodes.length,
      relation_count: relations.length
    }, `获取${category}分类知识图谱成功`);
  } catch (err) {
    console.error('按分类获取知识图谱失败:', err);
    return error(res, '按分类获取知识图谱失败', 500);
  }
});

// 批量保存知识图谱
router.post('/save-batch', async (req, res) => {
  try {
    const userId = req.user.id;
    const { nodes, relations } = req.body;
    
    if (!nodes || !Array.isArray(nodes)) {
      return error(res, '节点数据格式错误', 400);
    }
    
    const results = {
      nodes: { success: 0, failed: 0, errors: [] },
      relations: { success: 0, failed: 0, errors: [] }
    };
    
    // 开始事务
    await pool.query('START TRANSACTION');
    
    try {
      // 保存节点
      for (const node of nodes) {
        try {
          const [result] = await pool.query(
            `INSERT INTO knowledge_nodes 
             (user_id, name, description, category, level, position_x, position_y, importance) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             description = VALUES(description),
             category = VALUES(category),
             level = VALUES(level),
             position_x = VALUES(position_x),
             position_y = VALUES(position_y),
             importance = VALUES(importance),
             updated_at = CURRENT_TIMESTAMP`,
            [
              userId,
              node.name,
              node.description || '',
              node.category || 'knowledge',
              node.level || 1,
              node.position_x || 0,
              node.position_y || 0,
              node.importance || 50
            ]
          );
          
          results.nodes.success++;
        } catch (err) {
          results.nodes.failed++;
          results.nodes.errors.push(`保存节点 ${node.name} 失败: ${err.message}`);
        }
      }
      
      // 保存关联关系
      if (relations && Array.isArray(relations)) {
        for (const relation of relations) {
          try {
            await pool.query(
              `INSERT INTO knowledge_relations 
               (user_id, source_node_id, target_node_id, relation_type, strength) 
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
               relation_type = VALUES(relation_type),
               strength = VALUES(strength)`,
              [
                userId,
                relation.source_node_id,
                relation.target_node_id,
                relation.relation_type || 'related',
                relation.strength || 0.5
              ]
            );
            
            results.relations.success++;
          } catch (err) {
            results.relations.failed++;
            results.relations.errors.push(`保存关联关系失败: ${err.message}`);
          }
        }
      }
      
      await pool.query('COMMIT');
      
      return success(res, results, '批量保存知识图谱完成');
    } catch (transactionErr) {
      await pool.query('ROLLBACK');
      throw transactionErr;
    }
  } catch (err) {
    console.error('批量保存知识图谱失败:', err);
    return error(res, '批量保存知识图谱失败', 500);
  }
});

// 辅助函数：分析标签关联
function analyzeTagRelations(notes, minRelation) {
  const tagMap = new Map();
  const tagNotes = new Map();
  
  // 收集所有标签
  notes.forEach(note => {
    if (note.tags && Array.isArray(note.tags)) {
      note.tags.forEach(tag => {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, 0);
          tagNotes.set(tag, []);
        }
        tagMap.set(tag, tagMap.get(tag) + 1);
        tagNotes.get(tag).push(note);
      });
    }
  });
  
  // 计算标签关联度
  const relations = [];
  const tags = Array.from(tagMap.keys());
  
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const tag1 = tags[i];
      const tag2 = tags[j];
      
      const notes1 = tagNotes.get(tag1);
      const notes2 = tagNotes.get(tag2);
      
      // 计算共同笔记数量
      const commonNotes = notes1.filter(note1 => 
        notes2.some(note2 => note1.id === note2.id)
      );
      
      if (commonNotes.length > 0) {
        const relation = commonNotes.length / Math.min(notes1.length, notes2.length);
        
        if (relation >= minRelation) {
          relations.push({
            tag1,
            tag2,
            relation,
            commonNotes: commonNotes.length,
            notes1: notes1.length,
            notes2: notes2.length
          });
        }
      }
    }
  }
  
  return {
    tags,
    tagMap,
    tagNotes,
    relations
  };
}

// 辅助函数：生成知识节点
function generateKnowledgeNodes(tagAnalysis, maxLevel) {
  const { tags, tagMap } = tagAnalysis;
  
  // 按使用频率排序
  const sortedTags = tags.sort((a, b) => tagMap.get(b) - tagMap.get(a));
  
  // 确定节点层级
  const levelSize = Math.ceil(sortedTags.length / maxLevel);
  
  return sortedTags.map((tag, index) => {
    const level = Math.min(Math.floor(index / levelSize) + 1, maxLevel);
    const importance = Math.min(100, Math.round((tagMap.get(tag) / Math.max(...Array.from(tagMap.values()))) * 100));
    
    return {
      name: tag,
      description: `标签：${tag}`,
      category: 'knowledge',
      level,
      importance,
      position_x: Math.random() * 800,
      position_y: Math.random() * 600,
      connection_count: 0
    };
  });
}

// 辅助函数：生成知识关联关系
function generateKnowledgeRelations(tagAnalysis, minRelation) {
  const { relations } = tagAnalysis;
  
  return relations.map(relation => ({
    source_node_id: null, // 将在保存时设置
    target_node_id: null, // 将在保存时设置
    relation_type: 'related',
    strength: relation.relation,
    source_name: relation.tag1,
    target_name: relation.tag2
  }));
}

module.exports = router;
