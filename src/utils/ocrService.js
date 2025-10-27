// 百度云OCR服务
const axios = require('axios');
const crypto = require('crypto');

class OCRService {
  constructor() {
    this.apiKey = process.env.BAIDU_OCR_API_KEY || 'e8Hf2GgRQX9N3RRqj1uv6Ylb';
    this.secretKey = process.env.BAIDU_OCR_SECRET_KEY || 'PQkWjyyr8OLaRSiK1ryTzh9LfjBIPn7n';
    this.accessToken = null;
    this.tokenExpireTime = null;
  }

  // 获取access_token
  async getAccessToken() {
    // 如果有有效token，直接返回
    if (this.accessToken && this.tokenExpireTime && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    try {
      const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`;
      const response = await axios.post(url);
      
      this.accessToken = response.data.access_token;
      // token有效期通常是30天，这里设置29天有效期
      this.tokenExpireTime = Date.now() + 29 * 24 * 60 * 60 * 1000;
      
      console.log('✅ 百度云OCR Token获取成功');
      return this.accessToken;
    } catch (error) {
      console.error('❌ 获取百度云OCR Token失败:', error.message);
      throw new Error('获取OCR Token失败');
    }
  }

  // OCR识别通用文字
  async recognizeGeneral(imageBase64, options = {}) {
    try {
      const accessToken = await this.getAccessToken();
      
      const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${accessToken}`;
      
      const params = {
        image: imageBase64,
        ...options
      };

      const response = await axios.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.error_code) {
        throw new Error(`百度OCR错误: ${response.data.error_msg || '未知错误'}`);
      }

      return this.formatOCRResult(response.data);
    } catch (error) {
      console.error('OCR识别失败:', error.message);
      throw error;
    }
  }

  // OCR识别表格
  async recognizeTable(imageBase64) {
    try {
      const accessToken = await this.getAccessToken();
      
      const url = `https://aip.baidubce.com/rest/2.0/solution/v1/form_ocr/request?access_token=${accessToken}`;
      
      const response = await axios.post(url, {
        image: imageBase64
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      console.error('表格OCR识别失败:', error.message);
      throw error;
    }
  }

  // 格式化OCR结果
  formatOCRResult(data) {
    if (!data.words_result || data.words_result.length === 0) {
      return {
        text: '',
        words: []
      };
    }

    const text = data.words_result.map(item => item.words).join('\n');
    const words = data.words_result.map(item => ({
      text: item.words,
      location: item.location || null
    }));

    return {
      text,
      words,
      total: data.words_result_num || 0
    };
  }

  // 检查配置
  checkConfig() {
    if (!this.apiKey || !this.secretKey) {
      console.warn('⚠️ 百度云OCR未配置，请设置API Key和Secret Key');
      return false;
    }
    return true;
  }
}

module.exports = OCRService;
