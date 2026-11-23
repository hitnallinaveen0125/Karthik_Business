import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const isAdminRequest = config.url?.startsWith('/admin');
  const token = isAdminRequest
    ? localStorage.getItem('anantaora_token')
    : localStorage.getItem('anantaora_customer_token') || localStorage.getItem('anantaora_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
