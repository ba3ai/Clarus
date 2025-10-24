// frontend/src/services/api.js
import axios from "axios";

const API_BASE_URL = "http://localhost:5001"; // keep as-is for dev

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT on every request (support multiple common keys)
api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 by refreshing with the correct backend route
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      const refreshToken =
        localStorage.getItem("refreshToken") ||
        localStorage.getItem("refresh") ||
        sessionStorage.getItem("refreshToken") ||
        sessionStorage.getItem("refresh");
      if (!refreshToken) return Promise.reject(error);

      original._retry = true;
      try {
        // NOTE: Backend route is /auth/refresh (not /refresh)
        const { data } = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${refreshToken}` } }
        );

        const newAccess = data?.access_token || data?.accessToken;
        if (!newAccess) throw new Error("No access token in refresh response");

        localStorage.setItem("accessToken", newAccess);
        api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (e) {
        // wipe tokens and surface the error
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("token");
        localStorage.removeItem("refresh");
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
