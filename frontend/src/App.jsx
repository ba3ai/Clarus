// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import InvestorDashboard from './components/InvestorDashboard';
import OpportunityFundDashboard from './components/OpportunityFundDashboard';
import Generalpartner from './components/GeneralPartner';
import GroupAdminDashboard from './components/GroupAdminDashboard';
import { AuthContext } from './context/AuthContext';

// ⬇️ Public invite-accept page (note the explicit .jsx extension)
import AcceptInvite from './pages/AcceptInvite.jsx';

// ⬇️ Global financial chatbot widget (fixed, bottom-right)
import ChatWidget from './components/ChatWidget';

const App = () => {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();
  const userType = user?.user_type?.toLowerCase();

  // Public routes (no auth needed)
  // location.pathname does not include ?query, so /invite/accept?token=... matches "/invite/accept"
  const PUBLIC_ROUTES = new Set([
    '/admin/generalpartner',
    '/invite/accept',
    '/login',
  ]);
  const isPublicRoute = PUBLIC_ROUTES.has(location.pathname);

  // Avoid blocking public routes behind the initial auth boot
  if (!isPublicRoute && user === undefined) {
    return <div>Loading...</div>;
  }

  // Show chatbot only for authenticated users and non-public routes (dashboards)
  const showChat = !!user && !isPublicRoute;

  return (
    <>
      <Routes>
        {/* Public invite-accept page */}
        <Route path="/invite/accept" element={<AcceptInvite />} />

        {/* Login */}
        <Route
          path="/login"
          element={
            user === null ? (
              <Login />
            ) : userType === 'admin' ? (
              <Navigate to="/admin-dashboard" />
            ) : userType === 'groupadmin' ? (
              <Navigate to="/group-admin-dashboard" />
            ) : (
              <Navigate to="/investor-dashboard" />
            )
          }
        />

        {/* Authenticated dashboards */}
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />

        <Route
          path="/admin-dashboard"
          element={user && userType === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />}
        />

        <Route
          path="/group-admin-dashboard"
          element={user && userType === 'groupadmin' ? <GroupAdminDashboard /> : <Navigate to="/login" />}
        />

        <Route
          path="/admin/opportunity"
          element={
            user && userType === 'admin' ? (
              <OpportunityFundDashboard />
            ) : (
              <div className="min-h-screen flex flex-col items-center justify-center text-center text-red-600 p-6 space-y-4">
                <h2 className="text-2xl font-bold">Access Denied: Admins only</h2>
                <button
                  onClick={() => (window.location.href = '/admin-dashboard')}
                  className="px-4 py-2 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 transition"
                >
                  Back to Dashboard
                </button>
              </div>
            )
          }
        />

        {/* Public page already in your app */}
        <Route path="/admin/generalpartner" element={<Generalpartner />} />

        <Route
          path="/investor-dashboard"
          element={user && userType === 'investor' ? <InvestorDashboard /> : <Navigate to="/login" />}
        />

        {/* Fallback */}
        <Route
          path="*"
          element={
            user ? (
              userType === 'admin' ? (
                <Navigate to="/admin-dashboard" />
              ) : userType === 'groupadmin' ? (
                <Navigate to="/group-admin-dashboard" />
              ) : (
                <Navigate to="/investor-dashboard" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>

      {/* Global chatbot (renders once, overlays all dashboards) */}
      {showChat && <ChatWidget apiBase="/api" />}
    </>
  );
};

export default App;
