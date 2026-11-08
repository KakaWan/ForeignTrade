/** API client for communicating with the backend. */

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 180000,  // 3 minutes — AI generation can be slow
  headers: {
    'Content-Type': 'application/json',
  },
  // 数组参数序列化成 a=1&a=2（默认是 a[]=1&a[]=2，FastAPI 认不出这个参数名，
  // 会导致多选筛选被静默忽略）
  paramsSerializer: { indexes: null },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED') {
      error._userMessage = '请求超时，AI 生成时间过长，请稍后重试';
    } else if (!error.response) {
      error._userMessage = '网络错误：无法连接服务器，请检查后端是否运行';
    } else if (error.response?.data instanceof Blob) {
      // Blob error response (e.g. from responseType:'blob' requests)
      // Try to read the Blob as text to extract the error detail
      try {
        const text = await error.response.data.text();
        const json = JSON.parse(text);
        error._userMessage = json?.detail || json?.message || '请求失败';
      } catch {
        error._userMessage = '文件下载失败';
      }
    } else {
      const detail = error.response?.data?.detail;
      error._userMessage = detail || error.message || '请求失败';
    }
    console.error('API Error:', error._userMessage, error);
    return Promise.reject(error);
  }
);

export default api;
