// AI功能路由
const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { success, error } = require('../utils/response');

// 使用可选认证（测试阶段允许未登录访问）
router.use(optionalAuth);

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
        
        // 清理AI返回的文本，提取标签
        let cleanedText = tagsStr
          .replace(/标签[:：]/g, '')  // 移除"标签:"前缀
          .replace(/^[\s\n]*[-•·]\s*/gm, '') // 移除列表符号
          .replace(/\n/g, ',') // 换行改为逗号
          .replace(/，/g, ',') // 中文逗号改为英文逗号
          .trim();
        
        const aiTags = cleanedText
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0 && !t.includes('已生成'))
          .slice(0, 10); // 最多返回10个标签
        
        if (aiTags.length > 0) {
          // 从原文提取关键词作为标签
          const contentTags = extractKeywordsFromContent(content, '');
          console.log('📄 从原文提取的标签:', contentTags);
          
          // 合并标签：一半来自原文，一半来自AI
          const totalTags = Math.min(6, aiTags.length + contentTags.length); // 最多6个标签
          const contentCount = Math.floor(totalTags / 2); // 原文标签数量
          const aiCount = totalTags - contentCount; // AI标签数量
          
          const combinedTags = [
            ...contentTags.slice(0, contentCount),
            ...aiTags.slice(0, aiCount)
          ];
          
          // 去重
          const uniqueTags = Array.from(new Set(combinedTags));
          
          console.log('🎯 成功生成混合标签:', uniqueTags);
          return success(res, { tags: uniqueTags }, 'AI标签生成成功');
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
        
        // 清理AI返回的文本，提取标签
        let cleanedText = tagsStr
          .replace(/标签[:：]/g, '')  // 移除"标签:"前缀
          .replace(/^[\s\n]*[-•·]\s*/gm, '') // 移除列表符号
          .replace(/\n/g, ',') // 换行改为逗号
          .replace(/，/g, ',') // 中文逗号改为英文逗号
          .trim();
        
        const aiTags = cleanedText
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0 && !t.includes('已生成'))
          .slice(0, 10); // 最多返回10个标签
        
        if (aiTags.length > 0) {
          // 从原文提取关键词作为标签
          const contentTags = extractKeywordsFromContent(content, title);
          console.log('📄 从原文提取的标签:', contentTags);
          
          // 合并标签：一半来自原文，一半来自AI
          const totalTags = Math.min(6, aiTags.length + contentTags.length); // 最多6个标签
          const contentCount = Math.floor(totalTags / 2); // 原文标签数量
          const aiCount = totalTags - contentCount; // AI标签数量
          
          const combinedTags = [
            ...contentTags.slice(0, contentCount),
            ...aiTags.slice(0, aiCount)
          ];
          
          // 去重
          const uniqueTags = Array.from(new Set(combinedTags));
          
          console.log('🎯 成功生成混合标签:', uniqueTags);
          return success(res, { tags: uniqueTags }, 'AI标签生成成功');
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

// 本地标签生成算法
function generateTagsLocally(content, title, res) {
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
  
  // 去重并随机打乱
  const uniqueTags = Array.from(new Set(combinedTags))
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);
  
  console.log('🎲 使用本地算法生成混合标签:', uniqueTags);
  
  return success(res, { tags: uniqueTags }, '使用本地算法生成标签');
}

module.exports = router;
