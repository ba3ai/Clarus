// src/components/investments/TransactionHistory.jsx
import React from 'react';

const transactions = [
  { date: '2024-05-01', type: 'Deposit', amount: 10000, status: 'Completed' },
  { date: '2024-05-15', type: 'Withdrawal', amount: 2500, status: 'Pending' },
  { date: '2024-06-01', type: 'Dividend', amount: 500, status: 'Completed' },
];

const TransactionHistory = () => (
  <div className="bg-white p-6 rounded-lg shadow-md">
    <h2 className="text-2xl font-bold text-blue-700 mb-4">Transaction History</h2>
    <table className="w-full text-sm text-left">
      <thead>
        <tr className="text-gray-500 border-b">
          <th className="py-2">Date</th>
          <th className="py-2">Type</th>
          <th className="py-2">Amount</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t, i) => (
          <tr key={i} className="border-b text-gray-700">
            <td className="py-2">{t.date}</td>
            <td className="py-2">{t.type}</td>
            <td className="py-2">${t.amount.toLocaleString()}</td>
            <td className="py-2">{t.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default TransactionHistory;
