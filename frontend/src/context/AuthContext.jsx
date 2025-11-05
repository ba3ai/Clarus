// src/context/AuthContext.jsx
import React, { createContext, useEffect, useMemo, useState } from "react";
import api from "../services/api";

/**
 * user === undefined  -> booting (wait; don't redirect)
 * user === null       -> logged out
 * user === object     -> logged in
 */
export const AuthContext = createContext({
  user: undefined,
  setUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // booting

  // Rehydrate from the server-side session on first load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/auth/me"); // cookie sent automatically
        if (!cancelled) {
          if (data?.ok && data?.user) {
            const u = data.user;
            setUser({
              id: u.id,
              email: u.email,
              user_type: (u.user_type || "").toLowerCase(),
              name:
                u.name ||
                [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                null,
              permission: u.permission || null,
            });
          } else {
            setUser(null);
          }
        }
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    try {
      await api.post("/auth/logout"); // clears server session
    } catch {}
    setUser(null);
  };

  const value = useMemo(() => ({ user, setUser, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
