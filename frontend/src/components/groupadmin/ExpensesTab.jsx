import React from 'react';

const ExpensesTab = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-500">Management Fees</h3>
          <p className="text-2xl font-bold text-blue-600 mt-2">$2.1M</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-500">Organizational Expenses</h3>
          <p className="text-2xl font-bold text-orange-500 mt-2">$0.3M</p>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-500">Other Expenses</h3>
          <p className="text-2xl font-bold text-red-500 mt-2">$0.1M</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h3 className="text-lg font-semibold mb-4">Expenses Breakdown</h3>
        <table className="w-full table-auto text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2 text-left">Category</th>
              <th className="border p-2 text-right">Amount</th>
              <th className="border p-2 text-right">Percentage</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-gray-50">
              <td className="border p-2">Management Fees</td>
              <td className="border p-2 text-right">$2,100,000</td>
              <td className="border p-2 text-right">84%</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="border p-2">Organizational Expenses</td>
              <td className="border p-2 text-right">$300,000</td>
              <td className="border p-2 text-right">12%</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="border p-2">Other Expenses</td>
              <td className="border p-2 text-right">$100,000</td>
              <td className="border p-2 text-right">4%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExpensesTab;
