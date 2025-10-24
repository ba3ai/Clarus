// src/pages/InvestorDashboard.jsx
import React, { useState, useEffect, useContext } from "react";
import Portfolio from "./investments/Portfolio";                // NEW
import MyInvestments from "./investments/MyInvestments";
import PerformanceReports from "./investments/PerformanceReports";
import CapitalAllocation from "./investments/CapitalAllocation";
import TransactionHistory from "./investments/TransactionHistory";
import Statemensts from "./investments/Statements";
import PersonalInformation from "./investments/PersonalInformation";
import BankingDetails from "./investments/BankingDetails";
import InvestorOverview from "./tabs/InvestorOverview";
import Documents from "./investments/Documents";              // NEW

import Accreditation from "./investments/Accreditation";        // NEW

import Contacts from "./investments/Contacts";                   // NEW (import your Contacts.jsx)

import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { jwtDecode } from "jwt-decode";

const InvestorDashboard = () => {
  const [selectedTab, setSelectedTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        logout();
        navigate("/login");
        return;
      }
      try {
        const decoded = jwtDecode(token);
        if (decoded.user_type !== "investor") {
          logout();
          navigate("/login");
          return;
        }
      } catch (e) {
        setError("Session expired. Please log in again.");
        logout();
        navigate("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [logout, navigate]);

  const handleTabChange = (tabId) => {
    if (tabId === "logout") {
      logout();
      navigate("/login");
    } else {
      setSelectedTab(tabId);
    }
  };

  if (loading) return <p className="p-6">Loading dashboard...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white p-6 border-r">
        <h2 className="text-2xl font-bold text-blue-700 mb-6">Investor Panel</h2>
        <nav className="space-y-4">
          <div className="font-semibold text-gray-500 uppercase text-sm">Dashboard</div>
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("overview")}>
            Overview
          </button>

          <div className="font-semibold text-gray-500 uppercase text-sm mt-6">Investments</div>

          {/* Portfolio before My Investments */}
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("portfolio")}>
            Portfolio
          </button>
          {/* 
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("my-investments")}>
            My Investments
          </button>
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("performance-reports")}>
            Performance Reports
          </button>
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("capital-allocation")}>
            Capital Allocation
          </button>
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("transaction-history")}>
            Transaction History
          </button>
          */}
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("statements")}>
            Statements
          </button>
         
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("documents")}>
            Documents
          </button>

          <div className="font-semibold text-gray-500 uppercase text-sm mt-6">Profile</div>
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("personalinformation")}>
            Personal Information
          </button>

          {/* Order under Profile */}
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("accreditation")}>
            Accreditation
          </button>


          {/* NEW: Contacts right after Disbursement Preferences */}
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("contacts")}>
            Contacts
          </button>

          {/* 
          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("banking-details")}>
            Banking Details
          </button>
          */}

          <button className="block w-full text-left hover:bg-blue-100 rounded px-3 py-2" onClick={() => handleTabChange("logout")}>
            Logout
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {selectedTab === "overview" && <InvestorOverview />}

        {/* Investments */}
        {selectedTab === "portfolio" && <Portfolio />}
        {/* {selectedTab === "my-investments" && <MyInvestments />} */}
        {/* {selectedTab === "performance-reports" && <PerformanceReports />} */}
        {/* {selectedTab === "capital-allocation" && <CapitalAllocation />} */}
        {/* {selectedTab === "transaction-history" && <TransactionHistory />} */}

        {selectedTab === "statements" && <Statemensts />}
        {selectedTab === "esignature" && <ESignature />}
        {selectedTab === "documents" && <Documents />}

        {/* Profile */}
        {selectedTab === "personalinformation" && <PersonalInformation />}
        {selectedTab === "accreditation" && <Accreditation />}
        {selectedTab === "disbursement-preferences" && <DisbursementPreferences />}

        {/* NEW: Contacts content */}
        {selectedTab === "contacts" && <Contacts />}

        {/* {selectedTab === "banking-details" && <BankingDetails />} */}
      </main>
    </div>
  );
};

export default InvestorDashboard;
