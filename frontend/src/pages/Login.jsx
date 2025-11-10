// src/pages/Login.jsx
import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { loginUser, getMe } from "../services/authService";

/**
 * Cookie-session login:
 * 1) POST /auth/login  (server sets session + XSRF cookie)
 * 2) GET  /auth/me     (read current user + mapped investor)
 * No tokens in localStorage; all requests use withCredentials + CSRF via api.js
 */
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
      // 1) Login (sets session cookie)
      const res = await loginUser(emailOrUsername, password);
      if (!res?.success) {
        throw new Error(res?.message || "Invalid email/username or password");
      }

      // 2) Fetch current user/investor from the session
      const me = await getMe();
      if (!me?.ok || !me?.user) {
        throw new Error("Unable to load your profile after login.");
      }

      // Put into your AuthContext (shape compatible with the rest of the app)
      const u = me.user;
      setUser({
        id: u.id,
        email: u.email,
        user_type: (u.user_type || "").toLowerCase(),
        full_name: u.name || [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
        permission: u.permission || null,
      });

      // Route by role (same behavior you had before)
      const role = (u.user_type || "").toLowerCase();
      if (role === "admin") navigate("/admin-dashboard");
      else if (role === "groupadmin") navigate("/group-admin-dashboard");
      else if (role === "investor") navigate("/investor-dashboard");
      else throw new Error("Unauthorized user role.");
    } catch (err) {
      setStatus(err.message || "Login failed");
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
