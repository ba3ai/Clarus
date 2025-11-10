// Table for records
import React from 'react';

const valuationData = {
  preMoneyValuation: 1000000,
  newEquityRaised: 3500000,
  totalShares: 900000,
  postMoneyValuation: 4500000,
  perShare: 5
};

const capTable = [
  { name: 'Founders', capital: 0, common: 200000, pref: 0, total: 200000, ownership: '22.2%' },
  { name: '[Investor Name]', capital: 100000, common: 0, pref: 20000, total: 20000, ownership: '2.2%' },
  { name: '[Investor Name]', capital: 250000, common: 0, pref: 50000, total: 50000, ownership: '5.6%' },
  { name: '[Investor Name]', capital: 100000, common: 0, pref: 20000, total: 20000, ownership: '2.2%' },
  { name: '[Investor Name]', capital: 1200000, common: 0, pref: 240000, total: 240000, ownership: '26.7%' },
  { name: '[Investor Name]', capital: 250000, common: 0, pref: 50000, total: 50000, ownership: '5.6%' },
  { name: '[Investor Name]', capital: 100000, common: 0, pref: 20000, total: 20000, ownership: '2.2%' },
  { name: '[Investor Name]', capital: 500000, common: 0, pref: 100000, total: 100000, ownership: '11.1%' },
  { name: '[Investor Name]', capital: 400000, common: 0, pref: 80000, total: 80000, ownership: '8.9%' },
  { name: '[Investor Name]', capital: 250000, common: 0, pref: 50000, total: 50000, ownership: '5.6%' },
  { name: '[Investor Name]', capital: 350000, common: 0, pref: 70000, total: 70000, ownership: '7.8%' },
];

const RecordTable = () => {
  return (
    <div className="max-w-6xl mx-auto p-6 bg-white text-sm font-sans">
      {/* Company Valuation */}
      <div className="border rounded shadow mb-10">
        <div className="bg-orange-500 text-white font-semibold px-4 py-2">Company Valuation</div>
        <div className="p-4">
          <p className="font-bold text-gray-700 mb-2">Series A</p>
          <table className="w-full text-left border-t border-b border-gray-200">
            <thead>
              <tr className="text-gray-500">
                <th className="py-2"></th>
                <th className="py-2">Total Value ($)</th>
                <th className="py-2">Per Share ($)</th>
                <th className="py-2"># of Shares</th>
                <th className="py-2">% of Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="py-2 text-gray-600">Pre-Money Valuation</td>
                <td className="text-blue-600 font-semibold">$1,000,000</td>
                <td>$5.00</td>
                <td className="text-blue-600 font-semibold">200,000</td>
                <td>22.2%</td>
              </tr>
              <tr className="border-t">
                <td className="py-2 text-gray-600">New Equity Raised</td>
                <td>$3,500,000</td>
                <td>$5.00</td>
                <td>700,000</td>
                <td>77.8%</td>
              </tr>
              <tr className="border-t font-bold text-black">
                <td className="py-2">Post-Money Valuation</td>
                <td>$4,500,000</td>
                <td>$5.00</td>
                <td>900,000</td>
                <td>100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cap Table */}
      <div className="border rounded shadow">
        <div className="bg-orange-500 text-white font-semibold px-4 py-2">Company Ownership Cap Table</div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-left border-t border-b border-gray-200">
            <thead>
              <tr className="text-gray-500">
                <th className="py-2">Shareholders</th>
                <th className="py-2">Capital ($)</th>
                <th className="py-2">Common Shares</th>
                <th className="py-2">Pref. Shares</th>
                <th className="py-2">Total Shares</th>
                <th className="py-2">% Ownership</th>
              </tr>
            </thead>
            <tbody>
              {capTable.map((row, index) => (
                <tr key={index} className="border-t">
                  <td className="py-2 text-gray-700">{row.name}</td>
                  <td className="text-blue-700 font-semibold">${row.capital.toLocaleString()}</td>
                  <td>{row.common.toLocaleString()}</td>
                  <td>{row.pref.toLocaleString()}</td>
                  <td>{row.total.toLocaleString()}</td>
                  <td>{row.ownership}</td>
                </tr>
              ))}
              <tr className="border-t font-bold text-black">
                <td>Total</td>
                <td>$3,500,000</td>
                <td>200,000</td>
                <td>700,000</td>
                <td>900,000</td>
                <td>100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RecordTable;
