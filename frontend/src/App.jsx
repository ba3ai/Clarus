// src/App.jsx
import React from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import AdminDashboard from "./components/AdminDashboard";
import GroupAdminDashboard from "./components/GroupAdminDashboard";
import InvestorDashboard from "./components/InvestorDashboard";
import OpportunityFundDashboard from "./components/OpportunityFundDashboard";
import Generalpartner from "./components/GeneralPartner";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import ChatWidget from "./components/ChatWidget";
import { AuthContext } from "./context/AuthContext";

/** Guard: waits for auth; redirects to /login if unauthenticated. */
function RequireAuth() {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();

  if (user === undefined) return <div>Loading...</div>; // booting
  if (user === null) return <Navigate to="/login" replace state={{ from: location }} />;

  return <Outlet />; // authenticated children
}

/** Guard: like RequireAuth but enforces a role. */
function RequireRole({ role }) {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();

  if (user === undefined) return <div>Loading...</div>;
  if (user === null) return <Navigate to="/login" replace state={{ from: location }} />;

  const type = (user.user_type || "").toLowerCase();
  if (type !== role) {
    // Authenticated but wrong role → send to their own home
    if (type === "admin") return <Navigate to="/admin-dashboard" replace />;
    if (type === "groupadmin") return <Navigate to="/group-admin-dashboard" replace />;
    return <Navigate to="/investor-dashboard" replace />;
  }
  return <Outlet />;
}

export default function App() {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();
  const userType = (user?.user_type || "").toLowerCase();

  // Public pages (no auth needed)
  const isPublic = ["/login", "/invite/accept", "/admin/generalpartner"].includes(
    location.pathname
  );

  const showChat = !!user && !isPublic;

  /** If the user is already logged in, /login should forward them to their home. */
  function LoginRoute() {
    if (user === undefined) return <div>Loading...</div>;
    if (user === null) return <Login />;
    if (userType === "admin") return <Navigate to="/admin-dashboard" replace />;
    if (userType === "groupadmin") return <Navigate to="/group-admin-dashboard" replace />;
    return <Navigate to="/investor-dashboard" replace />;
  }

  /** Single place that maps “/dashboard” to the user’s home. */
  function MyHome() {
    if (user === undefined) return <div>Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (userType === "admin") return <Navigate to="/admin-dashboard" replace />;
    if (userType === "groupadmin") return <Navigate to="/group-admin-dashboard" replace />;
    return <Navigate to="/investor-dashboard" replace />;
  }

  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/invite/accept" element={<AcceptInvite />} />
        <Route path="/admin/generalpartner" element={<Generalpartner />} />

        {/* Authenticated area */}
        <Route element={<RequireAuth />}>
          {/* “/dashboard” just resolves to the correct home once */}
          <Route path="/dashboard" element={<MyHome />} />
        </Route>

        {/* Role-scoped areas */}
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/admin/opportunity" element={<OpportunityFundDashboard />} />
        </Route>

        <Route element={<RequireRole role="groupadmin" />}>
          <Route path="/group-admin-dashboard" element={<GroupAdminDashboard />} />
        </Route>

        <Route element={<RequireRole role="investor" />}>
          <Route path="/investor-dashboard" element={<InvestorDashboard />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<MyHome />} />
      </Routes>

      {showChat && (
        <ChatWidget
          user={window.__PORTAL_USER__}
          investor={window.__INVESTOR__}
          tenant="default"
          ttsDefaultEnabled={false}
          autoSendOnFinal
          defaultOpen={true}
          apiBase="/api"
        />
      )}
    </>
  );
}
