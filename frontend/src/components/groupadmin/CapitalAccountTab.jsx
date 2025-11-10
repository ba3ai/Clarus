import React, { useState } from 'react';

const mockData = [
  {
    investor: 'TOTAL',
    ownership: '100%',
    commitment: '271,000,003',
    capitalPaid: '70,500,000',
    distributions: '(62,736,000)',
    realizedGains: '19,331,000',
    unrealizedGains: '21,202,000',
    isSection: true
  },
  {
    investor: 'TOTAL FOR INVESTORS',
    ownership: '100%',
    commitment: '271,000,003',
    capitalPaid: '70,500,000',
    distributions: '(62,736,000)',
    realizedGains: '19,331,000',
    unrealizedGains: '21,202,000',
    isSection: true
  },
  {
    investor: 'General Partner',
    ownership: '0.4%',
    commitment: '1,000,000',
    capitalPaid: '705,000',
    distributions: '(627,000)',
    realizedGains: '193,000',
    unrealizedGains: '222,000',
    group: 'Carried interest partner'
  },
  {
    investor: 'Investor X',
    ownership: '9.2%',
    commitment: '25,000,000',
    capitalPaid: '17,625,000',
    distributions: '(15,684,000)',
    realizedGains: '4,833,000',
    unrealizedGains: '5,554,000',
    group: 'Carried interest partner'
  },
  {
    investor: 'Investor X',
    ownership: '7.4%',
    commitment: '20,000,000',
    capitalPaid: '14,100,000',
    distributions: '(12,547,000)',
    realizedGains: '3,866,000',
    unrealizedGains: '4,443,000',
    group: 'Carried interest partner'
  },
  {
    investor: 'Investor X',
    ownership: '3.0%',
    commitment: '8,000,000',
    capitalPaid: '5,640,000',
    distributions: '(5,019,000)',
    realizedGains: '1,546,000',
    unrealizedGains: '1,777,000',
    group: 'Carried interest partner'
  }
];

const CapitalAccountTab = () => {
  const [search, setSearch] = useState('');

  const filtered = mockData.filter(row =>
    row.investor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 bg-white rounded shadow space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-500">Total Invested Amount</h3>
          <p className="text-2xl font-bold text-pink-600 mt-2">$79,155M</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-500">Number of Investors</h3>
          <p className="text-2xl font-bold text-purple-600 mt-2">2216</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-500">Rate of Return</h3>
          <p className="text-2xl font-bold text-blue-600 mt-2">-4.16%</p>
        </div>
      </div>

      {/* Search Bar */}
      <input
        type="text"
        placeholder="Search investor"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 p-2 border rounded w-full"
      />

      {/* Data Table */}
      <table className="w-full table-auto border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2 text-left">Investor</th>
            <th className="border p-2 text-right">Ownership</th>
            <th className="border p-2 text-right">Commitment</th>
            <th className="border p-2 text-right">Paid in Capital</th>
            <th className="border p-2 text-right">Distributions</th>
            <th className="border p-2 text-right">Realised Gains</th>
            <th className="border p-2 text-right">Unrealised Gains</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => (
            <tr
              key={idx}
              className={row.isSection ? 'font-bold bg-gray-50' : 'hover:bg-gray-50'}
            >
              <td className="border p-2">{row.investor}</td>
              <td className="border p-2 text-right">{row.ownership}</td>
              <td className="border p-2 text-right">{row.commitment}</td>
              <td className="border p-2 text-right">{row.capitalPaid}</td>
              <td className="border p-2 text-right text-red-500">{row.distributions}</td>
              <td className="border p-2 text-right">{row.realizedGains}</td>
              <td className="border p-2 text-right">{row.unrealizedGains}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CapitalAccountTab;
