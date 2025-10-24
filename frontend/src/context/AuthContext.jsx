// src/context/AuthContext.jsx
import React, { createContext, useEffect, useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";

/**
 * Shape:
 *  user === undefined  -> booting (App should show a loader)
 *  user === null       -> logged out
 *  user === object     -> logged in { id, email, user_type, ... }
 */
export const AuthContext = createContext({
  user: undefined,
  setUser: () => {},
  logout: () => {},
});

function decodeToken(token) {
  if (!token) return null;
  try {
    const d = jwtDecode(token);
    // Basic expiry guard (optional — jwtDecode doesn't validate exp)
    if (d?.exp && Date.now() >= d.exp * 1000) return null;
    return {
      id: d.sub || d.user_id || null,
      email: d.email || null,
      user_type: (d.user_type || "").toLowerCase(), // "admin" | "groupadmin" | "investor"
      full_name: d.full_name || null,
      permission: d.permission || null,
      token,
    };
  } catch {
    return null;
  }
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // booting

  // Restore session on first load
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const u = decodeToken(token);
    if (!u) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
    } else {
      setUser(u);
    }
  }, []);

  // Keep multiple tabs in sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "accessToken") {
        const u = decodeToken(e.newValue);
        setUser(u || null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
  };

  const value = useMemo(() => ({ user, setUser, logout }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Export both named and default to avoid import mistakes
export { AuthProvider };
export default AuthProvider;
