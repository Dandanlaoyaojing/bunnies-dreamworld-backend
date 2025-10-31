// AI功能路由
const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { success, error } = require('../utils/response');

// 使用可选认证（测试阶段允许未登录访问）
router.use(optionalAuth);

// 从来源生成标签（DeepSeek智能生成，玫红色）
router.post('/generate-source-tags', async (req, res) => {
  try {
    const { source } = req.body;
    
    console.log('📚 收到来源标签生成请求:', { 
      source: source || '' 
    });
    
    if (!source || !source.trim()) {
      return error(res, '请提供笔记来源', 400);
    }

    // 调用AI服务生成来源标签
    try {
      const AIFusionService = require('../utils/aiFusionService');
      const aiService = new AIFusionService();
      
      // 构建提示词 - 专门针对来源信息，区分作者、书名等
      const prompt = `请分析以下书籍或文献来源信息，提取并生成标签。要求：

1. 如果包含作者信息，提取完整的作者姓名作为标签（不要分段，保持姓名完整）
2. 如果包含书名或文章名，提取完整的书名/文章名作为标签
3. 如果包含出版社或期刊信息，可以提取出版社/期刊名作为标签
4. 如果包含其他有意义的信息（如年份、版本等），可适当提取

来源信息：${source}

请以JSON格式返回结果，格式如下：
{
  "tags": [
    {
      "name": "标签名称",
      "type": "author|book|publisher|other"
    }
  ]
}

只返回JSON，不要有其他解释文字。标签数量控制在2-5个之间，确保不重复。`;

      console.log('🤖 调用DeepSeek生成来源标签...');
      
      // 使用DeepSeek生成标签
      const response = await aiService.callAIAPI(prompt, {
        temperature: 0.3, // 降低温度，确保输出更稳定
        maxTokens: 500,
        systemPrompt: '你是一个专业的图书信息提取专家，擅长从来源信息中提取作者、书名等关键信息，并能生成准确的标签。'
      });
      
      if (response && response.result) {
        console.log('✅ AI返回结果:', response.result);
        
        // 解析AI返回的JSON
        let parsedTags = [];
        
        try {
          // 尝试提取JSON部分
          const jsonMatch = response.result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[0]);
            if (jsonData.tags && Array.isArray(jsonData.tags)) {
              parsedTags = jsonData.tags.map(tag => ({
                name: tag.name || tag,
                type: tag.type || 'other',
                source: 'origin', // 从笔记出处字段生成的智能标签标识
                color: '#FF1493' // 玫红色（深粉红色）
              }));
            }
          }
        } catch (parseError) {
          console.warn('⚠️ JSON解析失败，尝试文本解析:', parseError);
          
          // 如果JSON解析失败，尝试文本解析
          let cleanedText = response.result
            .replace(/标签[:：]/g, '')
            .replace(/^[\s\n]*[-•·]\s*/gm, '')
            .replace(/\n/g, ',')
            .replace(/，/g, ',')
            .trim();
          
          parsedTags = cleanedText
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0 && t.length <= 50) // 过滤掉过长的标签
            .slice(0, 5)
            .map(tag => ({
              name: tag,
              type: 'other',
              source: 'origin', // 从笔记出处字段生成的智能标签标识
              color: '#FF1493' // 玫红色
            }));
        }
        
        // 去重（基于标签名称）
        const uniqueTags = [];
        const seenNames = new Set();
        
        parsedTags.forEach(tag => {
          const tagName = tag.name.trim();
          // 确保标签名称不为空，且未被添加过
          if (tagName && !seenNames.has(tagName.toLowerCase())) {
            seenNames.add(tagName.toLowerCase());
              uniqueTags.push({
                name: tagName,
                type: tag.type || 'other',
                source: 'origin', // 从笔记出处字段生成的智能标签标识
                color: '#FF1493' // 玫红色
              });
          }
        });
        
        if (uniqueTags.length > 0) {
          console.log('🎯 成功生成来源标签:', uniqueTags);
          return success(res, { 
            tags: uniqueTags,
            tagList: uniqueTags,
            result: uniqueTags,
            source: source
          }, '来源标签生成成功');
        }
      }
      
      console.log('⚠️ AI返回为空，返回空标签列表');
      return success(res, { 
        tags: [],
        tagList: [],
        result: [],
        source: source
      }, '未提取到标签');
      
    } catch (aiError) {
      console.error('❌ AI来源标签生成失败:', aiError.message);
      return error(res, '来源标签生成失败: ' + aiError.message, 500);
    }
  } catch (err) {
    console.error('❌ 来源标签生成失败:', err);
    return error(res, '来源标签生成失败', 500);
  }
});

// 追加标签生成（DeepSeek智能生成，避免重复）
router.post('/append-tags', async (req, res) => {
  try {
    const { content, category, existingTags = [] } = req.body;
    
    console.log('📝 收到追加标签生成请求:', { 
      category: category || 'knowledge', 
      contentLength: content?.length || 0,
      existingTagsCount: existingTags?.length || 0
    });
    
    if (!content) {
      return error(res, '请提供笔记内容', 400);
    }

    // 调用AI服务生成标签（追加模式）
    try {
      const AIFusionService = require('../utils/aiFusionService');
      const aiService = new AIFusionService();
      
      // 构建提示词 - 追加模式：排除已有标签，生成新标签
      const existingTagsStr = existingTags.length > 0 
        ? `\n\n已有标签（请不要重复生成）：${existingTags.join('、')}`
        : '';
      
      const prompt = `请为以下笔记内容生成3-5个不同的、有意义的标签。只返回标签，用逗号分隔，不要有任何解释文字：${existingTagsStr}
      
内容：${content.substring(0, 500)}

要求：
1. 标签要具体、有意义，针对文章内容和主题
2. 不要生成与已有标签相同或相似的标签
3. 生成全新的、不同的标签`;

      console.log('🤖 调用DeepSeek追加生成标签...');
      
      // 使用DeepSeek生成标签
      const response = await aiService.callAIAPI(prompt, {
        temperature: 0.8, // 稍微提高温度，生成更多样化的标签
        maxTokens: 500
      });
      
      if (response && response.result) {
        // 解析AI返回的标签（可能包含逗号分隔的标签）
        const tagsStr = response.result;
        console.log('✅ AI返回结果:', tagsStr);
        
        // 改进的标签提取逻辑
        let aiTags = [];
        
        // 方法1: 提取 **标签** 格式的标签
        const boldTags = tagsStr.match(/\*\*([^*]+)\*\*/g);
        if (boldTags) {
          aiTags = aiTags.concat(boldTags.map(tag => tag.replace(/\*\*/g, '').trim()));
        }
        
        // 方法2: 提取数字列表格式的标签 (1. 标签名)
        const numberedTags = tagsStr.match(/\d+\.\s*\*\*([^*]+)\*\*/g);
        if (numberedTags) {
          aiTags = aiTags.concat(numberedTags.map(tag => tag.replace(/\d+\.\s*\*\*/g, '').replace(/\*\*/g, '').trim()));
        }
        
        // 方法3: 如果上面方法都没找到，使用原来的方法
        if (aiTags.length === 0) {
          let cleanedText = tagsStr
            .replace(/标签[:：]/g, '')  // 移除"标签:"前缀
            .replace(/^[\s\n]*[-•·]\s*/gm, '') // 移除列表符号
            .replace(/\n/g, ',') // 换行改为逗号
            .replace(/，/g, ',') // 中文逗号改为英文逗号
            .trim();
          
          aiTags = cleanedText
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0 && !t.includes('已生成'))
            .slice(0, 10); // 最多返回10个标签
        }
        
        // 去重并过滤已有标签（不区分大小写）
        const existingTagsLower = existingTags.map(t => t.toLowerCase());
        aiTags = Array.from(new Set(aiTags))
          .filter(tag => {
            const tagLower = tag.toLowerCase();
            // 检查是否与已有标签相同或相似
            return !existingTagsLower.some(existing => 
              existing === tagLower || 
              existing.includes(tagLower) || 
              tagLower.includes(existing)
            );
          })
          .slice(0, 10);
        
        if (aiTags.length > 0) {
          console.log('🎯 成功追加生成AI标签:', aiTags);
          return success(res, { 
            tags: aiTags,
            generatedTags: aiTags,
            tagList: aiTags,
            result: aiTags,
            data: aiTags,
            labels: aiTags,
            keywords: aiTags,
            tagArray: aiTags,
            tagData: aiTags,
            tagResult: aiTags,
            aiTags: aiTags,
            smartTags: aiTags,
            tagLabels: aiTags,
            responseData: aiTags,
            apiResult: aiTags,
            tagResponse: aiTags,
            labelData: aiTags,
            tagInfo: aiTags,
            labelInfo: aiTags,
            tagDetails: aiTags,
            labelDetails: aiTags,
            existingTags: existingTags, // 返回已有标签，方便前端确认
            appendedCount: aiTags.length // 返回追加的标签数量
          }, `成功追加 ${aiTags.length} 个新标签`);
        } else {
          // 如果过滤后没有新标签，返回提示
          console.log('⚠️ 过滤后没有新标签可追加');
          return success(res, { 
            tags: [],
            tagList: [],
            result: [],
            existingTags: existingTags,
            appendedCount: 0
          }, '未生成新标签（可能已覆盖所有相关内容）');
        }
      }
      
      console.log('⚠️ AI返回为空，使用本地算法');
      // 如果AI调用失败，也混合提取原文关键词（排除已有标签）
      return generateTagsLocally(content, '', res, existingTags);
      
    } catch (aiError) {
      console.error('❌ AI标签追加生成失败，使用本地算法:', aiError.message);
      return generateTagsLocally(content, '', res, existingTags);
    }
  } catch (err) {
    console.error('❌ 追加标签生成失败:', err);
    return error(res, '追加标签生成失败', 500);
  }
});

// 智能标签生成（正式接口）
router.post('/generate-tags', async (req, res) => {
  try {
    const { content, category } = req.body;
    
    console.log('📝 收到标签生成请求:', { 
      category: category || 'knowledge', 
      contentLength: content?.length || 0 
    });
    
    if (!content) {
      return error(res, '请提供笔记内容', 400);
    }

    // 调用AI服务生成标签
    try {
      const AIFusionService = require('../utils/aiFusionService');
      const aiService = new AIFusionService();
      
      // 构建提示词 - 强制生成新标签
      const prompt = `请为以下笔记内容生成3-5个不同的、有意义的标签。只返回标签，用逗号分隔，不要有任何解释文字：
      
内容：${content.substring(0, 500)}

要求：标签要具体、有意义，针对文章内容和主题。`;
      
      console.log('🤖 调用DeepSeek生成标签...');
      
      // 使用DeepSeek生成标签
      const response = await aiService.callAIAPI(prompt);
      
      if (response && response.result) {
        // 解析AI返回的标签（可能包含逗号分隔的标签）
        const tagsStr = response.result;
        console.log('✅ AI返回结果:', tagsStr);
        
        // 改进的标签提取逻辑
        let aiTags = [];
        
        // 方法1: 提取 **标签** 格式的标签
        const boldTags = tagsStr.match(/\*\*([^*]+)\*\*/g);
        if (boldTags) {
          aiTags = aiTags.concat(boldTags.map(tag => tag.replace(/\*\*/g, '').trim()));
        }
        
        // 方法2: 提取数字列表格式的标签 (1. 标签名)
        const numberedTags = tagsStr.match(/\d+\.\s*\*\*([^*]+)\*\*/g);
        if (numberedTags) {
          aiTags = aiTags.concat(numberedTags.map(tag => tag.replace(/\d+\.\s*\*\*/g, '').replace(/\*\*/g, '').trim()));
        }
        
        // 方法3: 如果上面方法都没找到，使用原来的方法
        if (aiTags.length === 0) {
          let cleanedText = tagsStr
            .replace(/标签[:：]/g, '')  // 移除"标签:"前缀
            .replace(/^[\s\n]*[-•·]\s*/gm, '') // 移除列表符号
            .replace(/\n/g, ',') // 换行改为逗号
            .replace(/，/g, ',') // 中文逗号改为英文逗号
            .trim();
          
          aiTags = cleanedText
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0 && !t.includes('已生成'))
            .slice(0, 10); // 最多返回10个标签
        }
        
        // 去重并限制数量
        aiTags = Array.from(new Set(aiTags)).slice(0, 10);
        
        if (aiTags.length > 0) {
          // 直接使用AI生成的标签，不再混合原文标签
          console.log('🎯 成功生成AI标签:', aiTags);
          return success(res, { 
            tags: aiTags,
            generatedTags: aiTags,
            tagList: aiTags,
            result: aiTags,
            data: aiTags,
            labels: aiTags,
            keywords: aiTags,
            tagArray: aiTags,
            tagData: aiTags,
            tagResult: aiTags,
            aiTags: aiTags,
            smartTags: aiTags,
            tagLabels: aiTags,
            responseData: aiTags,
            apiResult: aiTags,
            tagResponse: aiTags,
            labelData: aiTags,
            tagInfo: aiTags,
            labelInfo: aiTags,
            tagDetails: aiTags,
            labelDetails: aiTags
          }, 'AI标签生成成功');
        }
      }
      
      console.log('⚠️ AI返回为空，使用本地算法');
      // 如果AI调用失败，也混合提取原文关键词
      return generateTagsLocally(content, '', res);
      
    } catch (aiError) {
      console.error('❌ AI标签生成失败，使用本地算法:', aiError.message);
      return generateTagsLocally(content, '', res);
    }
  } catch (err) {
    console.error('❌ 标签生成失败:', err);
    return error(res, '标签生成失败', 500);
  }
});

// 智能标签生成（测试接口）
router.post('/test-generate-tags', async (req, res) => {
  try {
    const { content, title } = req.body;
    
    console.log('📝 收到标签生成请求:', { 
      title: title || '无标题', 
      contentLength: content?.length || 0 
    });
    
    if (!content) {
      return error(res, '请提供笔记内容', 400);
    }

    // 调用AI服务生成标签
    try {
      const AIFusionService = require('../utils/aiFusionService');
      const aiService = new AIFusionService();
      
      // 构建提示词 - 强制生成新标签
      const prompt = `请为以下笔记内容生成3-5个不同的、有意义的标签。只返回标签，用逗号分隔，不要有任何解释文字：
      
标题：${title || '无标题'}
内容：${content.substring(0, 500)}

要求：标签要具体、有意义，针对文章内容和主题。`;
      
      console.log('🤖 调用DeepSeek生成标签...');
      
      // 使用DeepSeek生成标签
      const response = await aiService.callAIAPI(prompt);
      
      if (response && response.result) {
        // 解析AI返回的标签（可能包含逗号分隔的标签）
        const tagsStr = response.result;
        console.log('✅ AI返回结果:', tagsStr);
        
        // 改进的标签提取逻辑
        let aiTags = [];
        
        // 方法1: 提取 **标签** 格式的标签
        const boldTags = tagsStr.match(/\*\*([^*]+)\*\*/g);
        if (boldTags) {
          aiTags = aiTags.concat(boldTags.map(tag => tag.replace(/\*\*/g, '').trim()));
        }
        
        // 方法2: 提取数字列表格式的标签 (1. 标签名)
        const numberedTags = tagsStr.match(/\d+\.\s*\*\*([^*]+)\*\*/g);
        if (numberedTags) {
          aiTags = aiTags.concat(numberedTags.map(tag => tag.replace(/\d+\.\s*\*\*/g, '').replace(/\*\*/g, '').trim()));
        }
        
        // 方法3: 如果上面方法都没找到，使用原来的方法
        if (aiTags.length === 0) {
          let cleanedText = tagsStr
            .replace(/标签[:：]/g, '')  // 移除"标签:"前缀
            .replace(/^[\s\n]*[-•·]\s*/gm, '') // 移除列表符号
            .replace(/\n/g, ',') // 换行改为逗号
            .replace(/，/g, ',') // 中文逗号改为英文逗号
            .trim();
          
          aiTags = cleanedText
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0 && !t.includes('已生成'))
            .slice(0, 10); // 最多返回10个标签
        }
        
        // 去重并限制数量
        aiTags = Array.from(new Set(aiTags)).slice(0, 10);
        
        if (aiTags.length > 0) {
          // 直接使用AI生成的标签，不再混合原文标签
          console.log('🎯 成功生成AI标签:', aiTags);
          return success(res, { 
            tags: aiTags,
            generatedTags: aiTags,
            tagList: aiTags,
            result: aiTags,
            data: aiTags,
            labels: aiTags,
            keywords: aiTags,
            tagArray: aiTags,
            tagData: aiTags,
            tagResult: aiTags,
            aiTags: aiTags,
            smartTags: aiTags,
            tagLabels: aiTags,
            responseData: aiTags,
            apiResult: aiTags,
            tagResponse: aiTags,
            labelData: aiTags,
            tagInfo: aiTags,
            labelInfo: aiTags,
            tagDetails: aiTags,
            labelDetails: aiTags
          }, 'AI标签生成成功');
        }
      }
      
      console.log('⚠️ AI返回为空，使用本地算法');
      // 如果AI调用失败，也混合提取原文关键词
      return generateTagsLocally(content, title, res);
      
    } catch (aiError) {
      console.error('❌ AI标签生成失败，使用本地算法:', aiError.message);
      return generateTagsLocally(content, title, res);
    }
  } catch (err) {
    console.error('❌ 标签生成失败:', err);
    return error(res, '标签生成失败', 500);
  }
});

// 从原文提取关键词
function extractKeywordsFromContent(content, title) {
  // 合并标题和内容
  const fullText = (title + ' ' + content).toLowerCase();
  
  // 提取2-4字的关键词
  const keywords = [];
  
  // 方法1: 提取常见的2-4字词组
  const commonPhrases = [
    '学习', '工作', '生活', '旅行', '美食', '健康', '运动', '读书', '电影',
    '音乐', '艺术', '思考', '回忆', '计划', '梦想', '灵感', '心情',
    '技术', '编程', '设计', '创意', '分享', '成长', '感悟', '日记',
    '日常', '兴趣', '爱好', '收藏', '推荐', '体验', '心得', '总结',
    '经验', '技巧', '方法', '问题', '解决方案', '想法', '观点'
  ];
  
  // 检查文本中是否包含常见词组
  commonPhrases.forEach(phrase => {
    if (fullText.includes(phrase)) {
      keywords.push(phrase);
    }
  });
  
  // 方法2: 从标题提取关键词（如果标题存在）
  if (title && title.length > 0) {
    // 如果标题是短句，可以作为标签
    if (title.length >= 2 && title.length <= 8) {
      keywords.push(title);
    } else {
      // 长标题，提取关键词
      const titleWords = title.match(/[\u4e00-\u9fa5]{2,4}/g);
      if (titleWords) {
        keywords.push(...titleWords.slice(0, 2));
      }
    }
  }
  
  // 方法3: 提取重复出现的中文词汇（2-4字）
  const wordCount = {};
  const chineseWords = fullText.match(/[\u4e00-\u9fa5]{2,4}/g);
  
  if (chineseWords) {
    chineseWords.forEach(word => {
      if (word.length >= 2 && word.length <= 4) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
    
    // 选择出现次数>=2的词汇作为关键词
    Object.entries(wordCount)
      .filter(([word, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([word]) => {
        if (!keywords.includes(word)) {
          keywords.push(word);
        }
      });
  }
  
  // 去重并限制数量
  const uniqueKeywords = Array.from(new Set(keywords));
  
  return uniqueKeywords.slice(0, 5); // 最多返回5个
}

// 本地标签生成算法（支持追加模式）
function generateTagsLocally(content, title, res, existingTags = []) {
  // 从原文提取关键词（一半标签）
  const contentTags = extractKeywordsFromContent(content, title);
  console.log('📄 从原文提取的标签:', contentTags);
  
  // 扩展的关键词库（另一半标签）
  const keywords = [
    '学习', '工作', '生活', '旅行', '美食', '健康', '运动', '读书', '电影',
    '音乐', '艺术', '思考', '回忆', '计划', '梦想', '灵感', '心情',
    '技术', '编程', '设计', '创意', '分享', '成长', '感悟', '日记',
    '日常', '兴趣', '爱好', '收藏', '推荐', '体验', '心得', '总结'
  ];
  
  // 根据内容匹配通用关键词
  const matchedTags = [];
  const searchText = (title + ' ' + content).toLowerCase();
  
  keywords.forEach(keyword => {
    if (searchText.includes(keyword) && !contentTags.includes(keyword)) {
      matchedTags.push(keyword);
    }
  });
  
  // 如果没匹配到足够的标签，随机补充
  if (matchedTags.length < 3) {
    const shuffled = keywords
      .filter(k => !contentTags.includes(k))
      .sort(() => Math.random() - 0.5);
    const randomTags = shuffled.slice(0, Math.max(0, 3 - matchedTags.length));
    matchedTags.push(...randomTags);
  }
  
  // 合并：一半来自原文，一半来自通用关键词
  const totalTags = 6; // 总共6个标签
  const contentCount = Math.floor(totalTags / 2); // 3个来自原文
  const genericCount = totalTags - contentCount; // 3个来自通用关键词
  
  const combinedTags = [
    ...contentTags.slice(0, contentCount),
    ...matchedTags.slice(0, genericCount)
  ];
  
  // 去重并随机打乱，排除已有标签
  const existingTagsLower = existingTags.map(t => t.toLowerCase());
  const uniqueTags = Array.from(new Set(combinedTags))
    .filter(tag => {
      const tagLower = tag.toLowerCase();
      // 追加模式：排除已有标签
      if (existingTags.length > 0) {
        return !existingTagsLower.some(existing => 
          existing === tagLower || 
          existing.includes(tagLower) || 
          tagLower.includes(existing)
        );
      }
      return true;
    })
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);
  
  console.log('🎲 使用本地算法生成混合标签:', uniqueTags);
  if (existingTags.length > 0) {
    console.log('📋 已排除已有标签:', existingTags);
  }
  
  return success(res, { 
    tags: uniqueTags,
    generatedTags: uniqueTags,
    tagList: uniqueTags,
    result: uniqueTags,
    data: uniqueTags,
    labels: uniqueTags,
    keywords: uniqueTags,
    tagArray: uniqueTags,
    generatedLabels: uniqueTags,
    existingTags: existingTags,
    appendedCount: uniqueTags.length
  }, existingTags.length > 0 ? `使用本地算法追加 ${uniqueTags.length} 个标签` : '使用本地算法生成标签');
}

module.exports = router;
