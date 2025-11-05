// src/services/api.js
import axios from "axios";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  window.location.origin;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,

  // Let Axios auto-read cookie → header for us
  xsrfCookieName: "XSRF-TOKEN",   // cookie name your server sets
  xsrfHeaderName: "X-XSRF-TOKEN", // primary header your server accepts
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

// Helper to read cookie manually (for extra header aliases on multipart)
function readXsrfCookie() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

// Add XSRF header on non-GETs (keeps existing logic)
api.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const xsrf = readXsrfCookie();
    if (xsrf) {
      config.headers["X-XSRF-TOKEN"] = xsrf;  // primary
      // add common aliases in case the backend checks a different name
      config.headers["X-CSRFToken"] = xsrf;
      config.headers["X-CSRF-Token"] = xsrf;
    }
  }
  return config;
});

// Multipart helper for file uploads
export async function uploadFile(url, file, fields = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);

  const xsrf = readXsrfCookie();
  const headers = {};
  if (xsrf) {
    headers["X-XSRF-TOKEN"] = xsrf;
    headers["X-CSRFToken"] = xsrf;
    headers["X-CSRF-Token"] = xsrf;
  }
  // Do NOT set Content-Type—Axios will set the correct multipart boundary
  return api.post(url, form, { headers });
}

export default api;
