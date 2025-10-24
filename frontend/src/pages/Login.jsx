// src/pages/Login.jsx
import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { AuthContext } from "../context/AuthContext";

// Use env for backend base URL (create .env with VITE_API_BASE=http://127.0.0.1:5001)
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

export default function Login() {
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailOrUsername, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || `${res.status} ${res.statusText}`);

      // Accept either snake_case or camelCase
      const access =
        data.access_token || data.accessToken || data.token || data.jwt;
      const refresh = data.refresh_token || data.refreshToken;

      if (!access) throw new Error("Missing access token in response.");

      // Persist tokens
      localStorage.setItem("accessToken", access);
      if (refresh) localStorage.setItem("refreshToken", refresh);

      // Decode and push into AuthContext
      let decoded;
      try {
        decoded = jwtDecode(access);
      } catch {
        throw new Error("Invalid access token.");
      }

      const nextUser = {
        id: decoded.sub || decoded.user_id || null,
        email: decoded.email || emailOrUsername,
        user_type: (decoded.user_type || "").toLowerCase(), // admin | groupadmin | investor
        full_name: decoded.full_name || null,
        permission: decoded.permission || null,
        token: access,
      };
      setUser(nextUser);

      // Route by role
      if (nextUser.user_type === "admin") navigate("/admin-dashboard");
      else if (nextUser.user_type === "groupadmin") navigate("/group-admin-dashboard");
      else if (nextUser.user_type === "investor") navigate("/investor-dashboard");
      else throw new Error("Unauthorized user role.");
    } catch (err) {
      setStatus(err.message || "Invalid email/username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-emerald-500/90 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl space-y-4"
      >
        <h1 className="text-2xl font-semibold text-center">Login</h1>

        {status && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">
            {status}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-700">
            Email or Username
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:ring-4 focus:ring-emerald-100"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:ring-4 focus:ring-emerald-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 text-white py-3 font-semibold hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in…" : "LOGIN"}
        </button>
      </form>
    </div>
  );
}
