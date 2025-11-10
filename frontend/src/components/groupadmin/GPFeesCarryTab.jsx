import React from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const incomeData = [
  { category: 'other income', amount: 5261 },
  { category: 'primary paycheck', amount: 3742 },
];

const debtData = [
  { account: 'Chase Sapphire', balance: -216 },
  { account: 'Chase Ink', balance: -15 },
  { account: 'Chase Freedom Unlimited', balance: -1 },
  { account: 'Amex Gold', balance: -56 },
];

const expenseData = [
  { category: 'subscriptions', amount: -402, budget: -626 },
  { category: 'groceries', amount: -1057, budget: -1200 },
  { category: 'gym', amount: -318, budget: -200 },
  { category: 'education', amount: -17, budget: -50 },
  { category: 'restaurants & other', amount: -242, budget: -600 },
  { category: 'other expenses', amount: -2770, budget: -8000 },
  { category: 'other shopping', amount: -343, budget: 0 },
  { category: 'bills & utilities', amount: -3692, budget: -60 },
  { category: 'other health & wellness', amount: -108, budget: -250 },
  { category: 'travel & vacation', amount: -471, budget: -200 },
  { category: 'other transportation', amount: -163, budget: -50 },
];

const billsData = [
  { month: 'Jan Y24', amount: 1000 },
  { month: 'Feb Y24', amount: 3000 },
  { month: 'Mar Y24', amount: 2000 },
  { month: 'Apr Y24', amount: 5000 },
  { month: 'May Y24', amount: 4000 },
  { month: 'Jun Y24', amount: 3000 },
];

const varianceMetrics = [
  { label: 'Maximum Variance', value: '$5,767,899.32', percentage: '21%', date: '10th Sep 2022', color: 'rose' },
  { label: 'Minimum Variance', value: '$1,197,359.80', percentage: '15.45%', date: '18th Sep 2022', color: 'green' },
  { label: 'Average Variance', value: '$1,678,899.32', percentage: '21%', date: '10th Sep 2022', color: 'amber' },
];

const GPFeesCarryTab = () => {
  return (
    <div className="space-y-6">
      {/* Income Section */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Income by Category</h3>
          <table className="w-full table-auto border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">Category</th>
                <th className="border p-2 text-left">Amount</th>
              </tr>
            </thead>
            <tbody>
              {incomeData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border p-2">{row.category}</td>
                  <td className="border p-2 text-right">${row.amount}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border p-2">Total</td>
                <td className="border p-2 text-right">${incomeData.reduce((total, row) => total + row.amount, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Debt Balances Section */}
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Current Debt Balances</h3>
          <table className="w-full table-auto border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">Account</th>
                <th className="border p-2 text-left">Balance</th>
              </tr>
            </thead>
            <tbody>
              {debtData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border p-2">{row.account}</td>
                  <td className="border p-2 text-right">${row.balance}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border p-2">Total</td>
                <td className="border p-2 text-right">${debtData.reduce((total, row) => total + row.balance, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Section with Budget */}
      <div className="bg-white p-6 rounded shadow">
        <h3 className="text-lg font-semibold mb-4">Expense by Category with Budget</h3>
        <table className="w-full table-auto border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2 text-left">Category</th>
              <th className="border p-2 text-left">Amount</th>
              <th className="border p-2 text-left">Budget</th>
            </tr>
          </thead>
          <tbody>
            {expenseData.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="border p-2">{row.category}</td>
                <td className={`border p-2 text-right ${row.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>${row.amount}</td>
                <td className={`border p-2 text-right ${row.budget < 0 ? 'text-red-500' : 'text-green-500'}`}>${row.budget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bills and Subscriptions Chart */}
      <div className="bg-white p-6 rounded shadow">
        <h3 className="text-lg font-semibold mb-4">Bills and Subscriptions</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={billsData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="amount" fill="#f43f5e" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Variance Cards */}
      <div className="grid grid-cols-3 gap-6">
        {varianceMetrics.map((metric, index) => (
          <div key={index} className={`border-l-4 border-${metric.color}-500 bg-white p-4 rounded shadow`}>
            <p className={`text-${metric.color}-600 font-semibold`}>{metric.label}</p>
            <h2 className="text-xl font-bold mt-1">{metric.value} <span className="text-sm text-gray-500">({metric.percentage})</span></h2>
            <p className="text-sm text-gray-500">Measured on {metric.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GPFeesCarryTab;
