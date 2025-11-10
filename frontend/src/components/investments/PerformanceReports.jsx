import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const PerformanceReports = () => {
  const performanceData = [
    { month: "Jan", value: 10 },
    { month: "Feb", value: 12 },
    { month: "Mar", value: 18 },
    { month: "Apr", value: 30 },
    { month: "May", value: 40 },
    { month: "Jun", value: 33 },
    { month: "Jul", value: 50 },
    { month: "Aug", value: 70 },
    { month: "Sep", value: 60 },
    { month: "Oct", value: 75 },
    { month: "Nov", value: 85 },
    { month: "Dec", value: 95 },
  ];

  const stats = [
    { label: "Total Investment", value: "$80,000" },
    { label: "Current Balance", value: "$95,000" },
    { label: "Total ROI", value: "+18.75%" },
    { label: "Total Expense", value: "$5,000" },
    { label: "Investment Types", value: "Real Estate, Bonds, ETFs" },
  ];

  return (
    <div className="bg-white rounded-lg p-6 shadow-md">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">Performance Reports</h2>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className="bg-slate-50 border border-gray-200 p-4 rounded-lg shadow-sm"
          >
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className="text-lg font-semibold text-gray-800">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Line Chart */}
      <div className="bg-white border border-gray-200 p-4 rounded-lg">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-gray-600">Period: Last 12 Months</span>
          <span className="text-sm text-gray-600">Investment Type: All</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={performanceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#21529f"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PerformanceReports;
