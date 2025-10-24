import React, { useState } from "react";
import {
  BarChart2,
  FileText,
  Users,
  Briefcase,
  Archive,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const fundData = {
  name: "Antigravity Fund 1",
  status: "ACTIVE",
  date: "June 5th, 2023",
  committedCapital: "$1,000,000",
  calledSoFar: "$100,000",
  fundsAvailable: "$90,000",
  leftToCall: "$900,000",
  investments: [
    {
      company: "Brex",
      currentValue: "$1,345,223",
      initialInvestment: "$1,000,000",
      lastUpdated: "1/11/23",
      positive: true,
    },
    {
      company: "Cardless",
      currentValue: "$100,000",
      initialInvestment: "$100,000",
      lastUpdated: "2/17/23",
      positive: true,
    },
    {
      company: "Kaycakes",
      currentValue: "$432,567",
      initialInvestment: "$600,000",
      lastUpdated: "2/14/23",
      positive: false,
    },
    {
      company: "Pipe",
      currentValue: "$710,436",
      initialInvestment: "$800,000",
      lastUpdated: "10/02/23",
      positive: false,
    },
  ],
};

const historyData = [
  { date: "5/10/23", value: "$78,000", doc: "Statement.pdf" },
  { date: "2/12/22", value: "$92,000", doc: "Statement.pdf" },
  { date: "7/19/21", value: "$100,000", doc: "Statement.pdf" },
];

const SidebarItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition
      ${active ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"}`}
  >
    {icon}
    {label}
  </button>
);

export default function OpportunityFundDashboard() {
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState("Fund");
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 shadow-sm flex flex-col justify-between">
        <div>
          <div className="p-5 border-b border-gray-100 text-center">
            <h1 className="text-xl font-bold text-gray-800">Opportunity Fund</h1>
            <p className="text-md text-gray-500">Dashboard</p>
          </div>

          <nav className="flex flex-col p-4 space-y-1">
            <SidebarItem icon={<BarChart2 size={18} />} label="Fund" active={activeTab === "Fund"} onClick={() => setActiveTab("Fund")} />
            <SidebarItem icon={<Briefcase size={18} />} label="Lead" active={activeTab === "Lead"} onClick={() => setActiveTab("Lead")} />
            <SidebarItem icon={<FileText size={18} />} label="Documents" active={activeTab === "Documents"} onClick={() => setActiveTab("Documents")} />
            <SidebarItem icon={<Users size={18} />} label="Profiles & Teams" active={activeTab === "Profiles & Teams"} onClick={() => setActiveTab("Profiles & Teams")} />
            <SidebarItem icon={<Archive size={18} />} label="Tax Center" active={activeTab === "Tax Center"} onClick={() => setActiveTab("Tax Center")} />
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => navigate("/admin-dashboard")}
            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 w-full text-sm"
          >
            <ArrowLeft size={16} /> Back to Admin Panel
          </button>
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 text-red-500 hover:text-red-700 w-full text-sm"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 space-y-8">
        {/* Fund Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded">
              {fundData.status}
            </span>
            <h1 className="text-2xl font-bold mt-2">{fundData.name}</h1>
            <p className="text-gray-500">{fundData.date}</p>
          </div>
          <div className="space-x-2">
            <button className="px-4 py-2 bg-gray-900 text-white rounded">
              Start Investment
            </button>
            <button className="px-4 py-2 bg-gray-200 rounded">Call Capital</button>
          </div>
        </div>

        {/* Fund Summary */}
        {activeTab === "Fund" && (
          <>
            <div className="grid grid-cols-4 gap-4 bg-white shadow rounded-lg p-4">
              <div>
                <p className="text-gray-500">Committed Capital</p>
                <p className="text-lg font-semibold">{fundData.committedCapital}</p>
              </div>
              <div>
                <p className="text-gray-500">Called So Far</p>
                <p className="text-lg font-semibold">{fundData.calledSoFar}</p>
              </div>
              <div>
                <p className="text-gray-500">Funds Available</p>
                <p className="text-lg font-semibold">{fundData.fundsAvailable}</p>
              </div>
              <div>
                <p className="text-gray-500">Left to Call</p>
                <p className="text-lg font-semibold">{fundData.leftToCall}</p>
              </div>
            </div>

            {/* Investments Table */}
            <div className="bg-white shadow rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Fund Investments</h2>
                <input
                  type="text"
                  placeholder="Search"
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>
              <table className="min-w-full border text-center">
                <thead>
                  <tr className="bg-gray-50 text-center">
                    <th className="p-2 border ">Company</th>
                    <th className="p-2 border">Current Value</th>
                    <th className="p-2 border">Initial Investment</th>
                    <th className="p-2 border">Last Updated</th>
                    <th className="p-2 border">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fundData.investments.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-2 border">{item.company}</td>
                      <td
                        className={`p-2 border font-medium ${
                          item.positive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {item.currentValue}
                      </td>
                      <td className="p-2 border">{item.initialInvestment}</td>
                      <td className="p-2 border">{item.lastUpdated}</td>
                      <td
                        className="p-2 border text-blue-600 cursor-pointer"
                        onClick={() => setShowHistory(true)}
                      >
                        View
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Placeholder content for other tabs */}
        {activeTab !== "Fund" && (
          <div className="bg-white p-6 rounded shadow text-gray-600">
            <h2 className="text-xl font-semibold mb-2">{activeTab}</h2>
            <p>Content for the "{activeTab}" section will go here.</p>
          </div>
        )}
      </main>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center">
          <div className="bg-white rounded-lg p-6 w-96 shadow-lg">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold">Kaycakes history</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                X
              </button>
            </div>
            <table className="w-full border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border">Date</th>
                  <th className="p-2 border">Value</th>
                  <th className="p-2 border">Docs</th>
                </tr>
              </thead>
              <tbody>
                {historyData.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border">{row.date}</td>
                    <td className="p-2 border text-red-600">{row.value}</td>
                    <td className="p-2 border text-blue-600 cursor-pointer">{row.doc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right mt-4">
              <button
                onClick={() => setShowHistory(false)}
                className="bg-gray-900 text-white px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
