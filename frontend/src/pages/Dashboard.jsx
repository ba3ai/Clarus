import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import AdminDashboard from "../components/AdminDashboard";
import GroupAdminDashboard from "../components/GroupAdminDashboard";
import InvestorDashboard from "../components/InvestorDashboard";

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  if (user === undefined) return <div>Loading…</div>;
  if (user === null) return <Navigate to="/login" replace />;
  const t = (user.user_type || "").toLowerCase();
  if (t === "admin") return <AdminDashboard />;
  if (t === "groupadmin") return <GroupAdminDashboard />;
  return <InvestorDashboard />;
}
