import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.username) {
        config.headers['X-Username'] = user.username;
      }
      if (user.full_name) {
        config.headers['X-Full-Name'] = user.full_name;
      }
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
    }
  }
  return config;
});

export default api;
