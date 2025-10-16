// AI增强的知识星图融合服务
const axios = require('axios');

class AIFusionService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  // AI智能融合算法
  async aiSmartFusion(sourceNodes, targetNodes, options = {}) {
    try {
      const prompt = this.buildFusionPrompt(sourceNodes, targetNodes, options);
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '你是一个知识图谱融合专家，擅长分析节点间的语义关联和智能合并。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const aiResult = response.data.choices[0].message.content;
      return this.parseAIResult(aiResult);
    } catch (error) {
      console.error('AI融合失败，回退到本地算法:', error.message);
      // 回退到本地算法
      return this.fallbackToLocalFusion(sourceNodes, targetNodes);
    }
  }

  // 构建AI提示词
  buildFusionPrompt(sourceNodes, targetNodes, options) {
    return `
请分析以下知识节点，进行智能融合：

源节点：
${JSON.stringify(sourceNodes, null, 2)}

目标节点：
${JSON.stringify(targetNodes, null, 2)}

融合要求：
- 识别语义相似的节点并合并
- 计算节点间的关联强度（0-1）
- 解决命名冲突
- 保持知识图谱的逻辑性

请返回JSON格式的结果：
{
  "nodes": [
    {
      "name": "节点名称",
      "description": "节点描述",
      "category": "分类",
      "level": 层级,
      "importance": 重要性(0-100),
      "sources": ["source", "target"],
      "contributors": 贡献者数量
    }
  ],
  "relations": [
    {
      "source_name": "源节点名称",
      "target_name": "目标节点名称",
      "relation_type": "关联类型",
      "strength": 关联强度(0-1)
    }
  ],
  "conflicts": [
    {
      "type": "冲突类型",
      "node_name": "节点名称",
      "resolution": "解决方案"
    }
  ]
}
`;
  }

  // 解析AI返回结果
  parseAIResult(aiResult) {
    try {
      // 提取JSON部分
      const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析AI返回的JSON');
    } catch (error) {
      console.error('解析AI结果失败:', error);
      throw error;
    }
  }

  // 回退到本地算法
  fallbackToLocalFusion(sourceNodes, targetNodes) {
    // 调用现有的本地融合算法
    return {
      nodes: [...sourceNodes, ...targetNodes],
      relations: [],
      conflicts: []
    };
  }

  // AI语义相似度计算
  async calculateSemanticSimilarity(node1, node2) {
    try {
      const prompt = `
请计算以下两个知识节点的语义相似度（0-1之间）：

节点1: ${node1.name} - ${node1.description}
节点2: ${node2.name} - ${node2.description}

只返回一个0-1之间的数字，表示相似度。
`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const similarity = parseFloat(response.data.choices[0].message.content.trim());
      return isNaN(similarity) ? 0 : Math.max(0, Math.min(1, similarity));
    } catch (error) {
      console.error('AI相似度计算失败:', error);
      return 0.1; // 默认相似度
    }
  }

  // AI节点分类建议
  async suggestNodeCategory(nodeName, nodeDescription) {
    try {
      const prompt = `
请为以下知识节点推荐最合适的分类：

节点名称: ${nodeName}
节点描述: ${nodeDescription}

可选分类: art, cute, dreams, foods, happiness, knowledge, sights, thinking

只返回分类名称。
`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 20
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const category = response.data.choices[0].message.content.trim().toLowerCase();
      const validCategories = ['art', 'cute', 'dreams', 'foods', 'happiness', 'knowledge', 'sights', 'thinking'];
      
      return validCategories.includes(category) ? category : 'knowledge';
    } catch (error) {
      console.error('AI分类建议失败:', error);
      return 'knowledge'; // 默认分类
    }
  }
}

module.exports = AIFusionService;
