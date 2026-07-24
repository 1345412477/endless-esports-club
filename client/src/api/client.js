const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  localStorage.removeItem('displayName');
  window.location.href = '/login';
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      clearAuth();
      throw new Error('登录已过期，请重新登录');
    }

    if (!res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        throw new Error(data.message || '请求失败');
      } catch {
        throw new Error(`服务器错误：${res.status}`);
      }
    }

    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(data.message);
    }
    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查网络');
    }
    throw err;
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
