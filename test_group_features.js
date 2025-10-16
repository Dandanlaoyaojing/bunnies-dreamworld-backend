// 组群协作功能测试脚本
const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000/api/v1';
let authToken = '';
let testUserId = '';
let testGroupId = '';

// 测试用户信息
const testUser = {
  username: 'test_group_user_' + Date.now(),
  password: 'test123456'
};

// 测试组群信息
const testGroup = {
  name: '测试组群',
  description: '这是一个用于测试的组群',
  is_public: true,
  max_members: 10
};

// 测试节点数据
const testNodes = [
  {
    name: '人工智能',
    description: 'AI相关知识点',
    category: 'knowledge',
    level: 1,
    importance: 80
  },
  {
    name: '机器学习',
    description: 'ML相关知识点',
    category: 'knowledge',
    level: 2,
    importance: 70
  }
];

// 辅助函数：发送请求
async function makeRequest(method, url, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ 请求失败: ${method} ${url}`);
    console.error('错误信息:', error.response?.data || error.message);
    throw error;
  }
}

// 测试1: 用户注册和登录
async function testAuth() {
  console.log('\n🔐 测试1: 用户认证');
  
  try {
    // 注册用户
    console.log('📝 注册测试用户...');
    await makeRequest('POST', '/auth/register', testUser);
    console.log('✅ 用户注册成功');
    
    // 登录用户
    console.log('🔑 用户登录...');
    const loginResult = await makeRequest('POST', '/auth/login', testUser);
    authToken = loginResult.data.token;
    testUserId = loginResult.data.user.id;
    console.log('✅ 用户登录成功');
    console.log(`   用户ID: ${testUserId}`);
    console.log(`   Token: ${authToken.substring(0, 20)}...`);
    
    return true;
  } catch (error) {
    console.error('❌ 用户认证测试失败');
    return false;
  }
}

// 测试2: 创建组群
async function testCreateGroup() {
  console.log('\n👥 测试2: 创建组群');
  
  try {
    const result = await makeRequest('POST', '/groups', testGroup, {
      'Authorization': `Bearer ${authToken}`
    });
    
    testGroupId = result.data.id;
    console.log('✅ 组群创建成功');
    console.log(`   组群ID: ${testGroupId}`);
    console.log(`   组群名称: ${result.data.name}`);
    console.log(`   创建者角色: ${result.data.role}`);
    
    return true;
  } catch (error) {
    console.error('❌ 创建组群测试失败');
    return false;
  }
}

// 测试3: 获取我的组群列表
async function testGetMyGroups() {
  console.log('\n📋 测试3: 获取我的组群列表');
  
  try {
    const result = await makeRequest('GET', '/groups/my', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 获取我的组群列表成功');
    console.log(`   组群数量: ${result.data.total}`);
    result.data.groups.forEach(group => {
      console.log(`   - ${group.name} (${group.role})`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ 获取我的组群列表测试失败');
    return false;
  }
}

// 测试4: 获取组群详情
async function testGetGroupDetail() {
  console.log('\n🔍 测试4: 获取组群详情');
  
  try {
    const result = await makeRequest('GET', `/groups/${testGroupId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 获取组群详情成功');
    console.log(`   组群名称: ${result.data.name}`);
    console.log(`   成员数量: ${result.data.member_count}`);
    console.log(`   融合次数: ${result.data.fusion_count}`);
    console.log(`   用户角色: ${result.data.user_role}`);
    
    return true;
  } catch (error) {
    console.error('❌ 获取组群详情测试失败');
    return false;
  }
}

// 测试5: 创建共享节点
async function testCreateSharedNode() {
  console.log('\n🔗 测试5: 创建共享节点');
  
  try {
    const nodeData = testNodes[0];
    const result = await makeRequest('POST', `/groups/${testGroupId}/nodes`, nodeData, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 创建共享节点成功');
    console.log(`   节点ID: ${result.data.id}`);
    console.log(`   节点名称: ${result.data.name}`);
    
    return result.data.id;
  } catch (error) {
    console.error('❌ 创建共享节点测试失败');
    return null;
  }
}

// 测试6: 获取组群共享节点
async function testGetSharedNodes() {
  console.log('\n📊 测试6: 获取组群共享节点');
  
  try {
    const result = await makeRequest('GET', `/groups/${testGroupId}/nodes`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 获取组群共享节点成功');
    console.log(`   节点数量: ${result.data.total}`);
    result.data.nodes.forEach(node => {
      console.log(`   - ${node.name} (重要性: ${node.importance})`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ 获取组群共享节点测试失败');
    return false;
  }
}

// 测试7: 知识星图融合
async function testKnowledgeFusion() {
  console.log('\n🧠 测试7: 知识星图融合');
  
  try {
    const fusionData = {
      fusion_type: 'smart',
      source_nodes: testNodes,
      min_relation: 0.3
    };
    
    const result = await makeRequest('POST', `/groups/${testGroupId}/fuse`, fusionData, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 知识星图融合成功');
    console.log(`   融合ID: ${result.data.fusion_id}`);
    if (result.data.result && result.data.result.nodes) {
      console.log(`   生成节点数: ${result.data.result.nodes.length}`);
    }
    if (result.data.result && result.data.result.relations) {
      console.log(`   生成关联数: ${result.data.result.relations.length}`);
    }
    console.log(`   冲突数量: ${result.data.conflicts ? result.data.conflicts.length : 0}`);
    
    return true;
  } catch (error) {
    console.error('❌ 知识星图融合测试失败');
    return false;
  }
}

// 测试8: 获取融合历史
async function testGetFusionHistory() {
  console.log('\n📈 测试8: 获取融合历史');
  
  try {
    const result = await makeRequest('GET', `/groups/${testGroupId}/fusions`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 获取融合历史成功');
    console.log(`   融合记录数: ${result.data.total}`);
    result.data.fusions.forEach(fusion => {
      console.log(`   - ${fusion.fusion_type} (${fusion.status}) - ${fusion.initiator_name}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ 获取融合历史测试失败');
    return false;
  }
}

// 测试9: 获取推荐组群
async function testGetRecommendedGroups() {
  console.log('\n🌟 测试9: 获取推荐组群');
  
  try {
    const result = await makeRequest('GET', '/groups/recommended', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    console.log('✅ 获取推荐组群成功');
    console.log(`   推荐组群数: ${result.data.total}`);
    result.data.groups.forEach(group => {
      console.log(`   - ${group.name} (${group.member_count}人)`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ 获取推荐组群测试失败');
    return false;
  }
}

// 测试10: 清理测试数据
async function testCleanup() {
  console.log('\n🧹 测试10: 清理测试数据');
  
  try {
    // 删除测试组群
    await makeRequest('DELETE', `/groups/${testGroupId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    console.log('✅ 测试组群删除成功');
    
    return true;
  } catch (error) {
    console.error('❌ 清理测试数据失败');
    return false;
  }
}

// 主测试函数
async function runAllTests() {
  console.log('🚀 开始组群协作功能测试');
  console.log('='.repeat(50));
  
  const tests = [
    { name: '用户认证', fn: testAuth },
    { name: '创建组群', fn: testCreateGroup },
    { name: '获取我的组群', fn: testGetMyGroups },
    { name: '获取组群详情', fn: testGetGroupDetail },
    { name: '创建共享节点', fn: testCreateSharedNode },
    { name: '获取共享节点', fn: testGetSharedNodes },
    { name: '知识星图融合', fn: testKnowledgeFusion },
    { name: '获取融合历史', fn: testGetFusionHistory },
    { name: '获取推荐组群', fn: testGetRecommendedGroups },
    { name: '清理测试数据', fn: testCleanup }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result !== false) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name} 测试异常:`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果统计');
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📈 成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 所有测试通过！组群协作功能开发完成！');
  } else {
    console.log('\n⚠️  部分测试失败，请检查相关功能');
  }
}

// 运行测试
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testAuth,
  testCreateGroup,
  testGetMyGroups,
  testGetGroupDetail,
  testCreateSharedNode,
  testGetSharedNodes,
  testKnowledgeFusion,
  testGetFusionHistory,
  testGetRecommendedGroups,
  testCleanup
};
