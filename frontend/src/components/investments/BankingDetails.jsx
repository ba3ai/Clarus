import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const bankAccounts = [
  { bank: "XYZ BANK", city: "City 1", balance: "$400k", card: "1234 5678 9012 3456", bg: "bg-blue-700" },
  { bank: "ABC BANK", city: "City 2", balance: "$800k", card: "1234 5678 9012 3456", bg: "bg-cyan-600" },
  { bank: "PQR BANK", city: "City 3", balance: "$750k", card: "1234 5678 9012 3456", bg: "bg-teal-500" },
];

const transactions = [
  { name: "Jan", FirstHalf: 0, SecondHalf: 50 },
  { name: "Feb", FirstHalf: 100, SecondHalf: 90 },
  { name: "Mar", FirstHalf: 200, SecondHalf: 150 },
  { name: "Apr", FirstHalf: 300, SecondHalf: 280 },
  { name: "May", FirstHalf: 290, SecondHalf: 270 },
  { name: "Jun", FirstHalf: 100, SecondHalf: 120 },
  { name: "Jul", FirstHalf: 50, SecondHalf: 80 },
  { name: "Aug", FirstHalf: 100, SecondHalf: 150 },
  { name: "Sep", FirstHalf: 200, SecondHalf: 220 },
  { name: "Oct", FirstHalf: 300, SecondHalf: 350 },
  { name: "Now", FirstHalf: 400, SecondHalf: 430 },
];

const expenditures = [
  { name: "Business", value: 50 },
  { name: "Personal", value: 25 },
  { name: "Others", value: 25 },
];

const fundings = [
  { name: "Company 1", value: 25 },
  { name: "Company 2", value: 10 },
  { name: "Company 3", value: 65 },
];

const recentTransactions = [
  { name: "Name Here", email: "8010008422@xyz", date: "4 July 2018" },
  { name: "Name Here", email: "8010008423@xyz", date: "6 July 2018" },
  { name: "Name Here", email: "8010008424@xyz", date: "20 July 2018" },
  { name: "Name Here", email: "8010008425@xyz", date: "25 July 2018" },
  { name: "Name Here", email: "8010008426@xyz", date: "1 Aug 2018" },
  { name: "Name Here", email: "8010008427@xyz", date: "8 Aug 2018" },
  { name: "Name Here", email: "8010008428@xyz", date: "14 Aug 2018" },
  { name: "Name Here", email: "8010008429@xyz", date: "20 Aug 2018" },
];

const COLORS = ["#21529f", "#63b3ed", "#a0aec0"];

const BankDashboard = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Banking Accounts Details</h1>

      {/* Bank Cards */}
      <div className="flex gap-6 mb-6">
        {bankAccounts.map((acc, idx) => (
          <div key={idx} className={`rounded-lg text-white p-4 w-1/3 shadow-md ${acc.bg}`}>
            <h3 className="text-lg font-semibold mb-1">{acc.bank}</h3>
            <p className="text-sm">{acc.city}</p>
            <div className="text-lg mt-4 tracking-widest">{acc.card}</div>
            <p className="mt-2 text-sm">Balance</p>
            <p className="text-xl font-bold">{acc.balance}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-2">Transactions</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={transactions}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="FirstHalf" stroke="#21529f" strokeWidth={2} />
              <Line type="monotone" dataKey="SecondHalf" stroke="#63b3ed" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-2">Recent Transactions</h3>
          <div className="space-y-3 text-sm">
            {recentTransactions.map((t, idx) => (
              <div key={idx} className="flex justify-between border-b pb-2">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-gray-500">{t.email}</p>
                </div>
                <p className="text-gray-600 whitespace-nowrap">{t.date}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Donut Charts */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">Expenditures</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={expenditures} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {expenditures.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">Fundings</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={fundings} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {fundings.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default BankDashboard;
