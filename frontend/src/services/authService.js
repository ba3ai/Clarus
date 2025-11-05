import api from "../services/api";

export async function loginUser(email, password) {
  try {
    const { data } = await api.post("/auth/login", { email, password });
    return { success: true, ...data };
  } catch (e) {
    const msg = e?.response?.data?.error || e?.response?.data?.message || "Login failed";
    return { success: false, message: msg };
  }
}

export async function logoutUser() {
  try {
    await api.post("/auth/logout");
    return { success: true };
  } catch {
    return { success: false, message: "Logout failed" };
  }
}

export async function getMe() {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch {
    return { ok: false, error: "Unauthorized" };
  }
}

/**
 * Optional helper: quick boolean check using /auth/me.
 * Prefer calling getMe() where you need the user/investor object.
 */
export async function isAuthenticated() {
  const me = await getMe();
  return !!me?.ok;
}
