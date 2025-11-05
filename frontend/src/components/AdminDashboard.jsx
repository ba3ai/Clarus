// src/components/AdminDashboard.jsx
import React, { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

import {
  Home,
  UserPlus,
  Users,
  FileSpreadsheet,
  FileText,
  Keyboard,
  LogOut,
  BarChart2,
} from "lucide-react";

import Settings from "./tabs/Settings";
import AddUser from "./tabs/AddUser";
import AllUsers from "./tabs/AllUsers";
import ExcelSheet from "./tabs/ExcelSheet";
import QuickBooks from "./tabs/QuickBooks";
import ManualEntry from "./tabs/ManualEntry";
import Overview from "./tabs/Overview";
import Funds from "./tabs/Funds";
import Investors from "./tabs/Investors";
import Documents from "./tabs/Documents";
import KnowledgeBase from "./tabs/KnowledgeBase";

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const { user, logout } = useContext(AuthContext);

  // Auth/role are already enforced by <RequireRole role="admin" /> in App.jsx.
  // Still, render a small guard to avoid flicker while booting.
  if (user === undefined) return <div className="p-6">Loading…</div>;

  const adminData = {
    fullName:
      user?.name ||
      [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
      "Admin",
    email: user?.email || "",
    userType: (user?.user_type || "").toLowerCase(),
  };

  const SectionCard = ({ title, children }) => (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        </div>
        <div className="p-4 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <Overview />;
      case "portfolio":
        return (
          <SectionCard title="Portfolio">
            This is the Portfolio area. Add charts/tables for portfolio positions, allocations,
            KPIs, and documents when endpoints are ready.
          </SectionCard>
        );
      case "funds":
        return <Funds />;
      case "spvs":
        return (
          <SectionCard title="SPVs">
            SPV list, allocations, capital movements, and reporting hooks. (Placeholder UI)
          </SectionCard>
        );
      case "investors":
        return <Investors />;
      case "companies":
        return (
          <SectionCard title="Companies">
            Portfolio companies with metrics, documents, and valuations. (Placeholder UI)
          </SectionCard>
        );
      case "management":
        return (
          <SectionCard title="Management">
            Management company items: fees, expenses, approvals, workflows. (Placeholder UI)
          </SectionCard>
        );
      case "taxes":
        return (
          <SectionCard title="Taxes">
            Tax center for K-1s, returns, filings, and deadline tracking. (Placeholder UI)
          </SectionCard>
        );
      case "documents":
        return <Documents />;
      case "settings":
        return <Settings />;
      case "addUser":
        return <AddUser />;
      case "allUsers":
        return <AllUsers />;
      case "excel":
        return <ExcelSheet />;
      case "quickbooks":
        return <QuickBooks />;
      case "manual":
        return <ManualEntry />;
      case "knowledge":
        return <KnowledgeBase />;
      default:
        return <Overview />;
    }
  };

  const TabButton = ({ label, tabKey, icon }) => (
    <button
      onClick={() => setActiveTab(tabKey)}
      className={`flex items-center gap-2 w-full px-4 py-2 rounded-md text-sm transition font-medium ${
        activeTab === tabKey
          ? "bg-blue-100 text-blue-800"
          : "text-gray-700 hover:bg-gray-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col justify-between shadow-sm">
        <div>
          <div className="px-6 py-5 border-b border-gray-200">
            <h2
              className="text-xl font-bold text-center tracking-tight cursor-pointer hover:text-blue-600"
              onClick={() => setActiveTab("overview")}
            >
              Admin Panel
            </h2>
            <p className="text-lg text-black-600 text-center">
              Financial Reporting Agent
            </p>
          </div>

          <nav className="p-4 space-y-6 ml-[10px]">
            <div>
              <h3 className="text-base font-bold text-gray-500 uppercase mb-2">
                Dashboard
              </h3>
              <TabButton label="Overview" tabKey="overview" icon={<Home size={16} />} />
              <TabButton label="Portfolio" tabKey="portfolio" icon={<BarChart2 size={16} />} />
              <TabButton label="Funds" tabKey="funds" icon={<FileText size={16} />} />
              <TabButton label="SPVs" tabKey="spvs" icon={<FileText size={16} />} />
              <TabButton label="Investors" tabKey="investors" icon={<Users size={16} />} />
              <TabButton label="Companies" tabKey="companies" icon={<Home size={16} />} />
              <TabButton label="Management" tabKey="management" icon={<FileText size={16} />} />
              <TabButton label="Taxes" tabKey="taxes" icon={<FileText size={16} />} />
              <TabButton label="Documents" tabKey="documents" icon={<FileText size={16} />} />
              <TabButton label="Settings" tabKey="settings" icon={<Home size={16} />} />
              <TabButton label="Knowledge Base" tabKey="knowledge" icon={<FileText size={16} />} />
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-500 uppercase mb-2">Users</h3>
              <TabButton label="Add User" tabKey="addUser" icon={<UserPlus size={16} />} />
              <TabButton label="All Users" tabKey="allUsers" icon={<Users size={16} />} />
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-500 uppercase mb-2">Integration</h3>
              <TabButton label="Excel Sheet" tabKey="excel" icon={<FileSpreadsheet size={16} />} />
              <TabButton label="QuickBooks" tabKey="quickbooks" icon={<FileText size={16} />} />
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-500 uppercase mb-2">Manual Entry</h3>
              <TabButton label="Entry Form" tabKey="manual" icon={<Keyboard size={16} />} />
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-500 uppercase mb-2">Funds</h3>
              <a
                href="/admin/opportunity"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md text-sm transition font-medium text-gray-700 hover:bg-gray-200"
              >
                <FileText size={16} />
                Opportunity Fund
              </a>

              <a
                href="/admin/generalpartner"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-4 py-2 rounded-md text-sm transition font-medium text-gray-700 hover:bg-gray-200"
              >
                <BarChart2 size={16} />
                General Partner
              </a>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-red-500 hover:text-red-700 transition w-full text-sm font-medium"
          >
            <LogOut size={16} />
            Logout
          </button>
          <p className="text-xs mt-2 text-gray-400">Logged in as Admin</p>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col">
        <header className="flex justify-end items-center p-4 bg-white border-b relative">
          <div className="relative group cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">
              {adminData.fullName?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="absolute right-0 mt-2 hidden group-hover:block bg-white shadow-lg border rounded-md w-64 p-4 z-50">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Admin Info</h4>
              <div className="text-sm text-gray-600">
                <div><strong>Full Name:</strong> {adminData.fullName}</div>
                <div><strong>Email:</strong> {adminData.email}</div>
                <div><strong>User Type:</strong> {adminData.userType}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-6 overflow-y-auto bg-white shadow-inner flex-1">
          {renderTab()}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
