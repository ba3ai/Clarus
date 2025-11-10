// src/components/investments/MyInvestments.jsx
import React from 'react';

const MyInvestments = () => {
  // Placeholder sample data
  const investments = [
    { asset: 'Fund A', type: 'Real Estate', amount: 25000, status: 'Active' },
    { asset: 'Bond X', type: 'Debt', amount: 10000, status: 'Closed' },
    { asset: 'Stock Y', type: 'Equity', amount: 18000, status: 'Active' }
  ];

  return (
    <div>
      <h2 className="text-3xl font-bold text-blue-800 mb-6 text-center">My Investments</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="px-6 py-3 text-left">Asset</th>
              <th className="px-6 py-3 text-left">Type</th>
              <th className="px-6 py-3 text-left">Amount</th>
              <th className="px-6 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {investments.map((inv, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="px-6 py-3">{inv.asset}</td>
                <td className="px-6 py-3">{inv.type}</td>
                <td className="px-6 py-3">${inv.amount.toLocaleString()}</td>
                <td className="px-6 py-3">{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MyInvestments;
