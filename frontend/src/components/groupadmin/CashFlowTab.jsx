import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend
} from 'recharts';

const cashflowData = [
  { date: '13 Oct', actual: 3 },
  { date: '14 Oct', actual: 3 },
  { date: '15 Oct', actual: 5 },
  { date: '16 Oct', actual: 4 },
  { date: '17 Oct', actual: 0 },
  { date: '18 Oct', forecast: 3 },
  { date: '19 Oct', forecast: 3 },
  { date: '20 Oct', forecast: 5 },
  { date: '21 Oct', forecast: 3.8 },
  { date: '22 Oct', forecast: 6 }
];

const inflows = [
  { name: 'Account Receivables', value: 9.8 },
  { name: 'Royalties', value: 5.1 },
  { name: 'Commissions', value: 0.9 },
  { name: 'Interest Receipts', value: 0.2 },
  { name: 'Tax Refunds', value: 0.1 },
];

const outflows = [
  { name: 'Account Payables', value: -8.3 },
  { name: 'Payroll', value: -6.1 },
  { name: 'Tax Payments', value: -2.5 },
  { name: 'Capex', value: -1.8 },
  { name: 'Rent/Admin Charges', value: -0.9 },
];

const donutData = [
  { name: 'Inflow', value: 60, fill: '#06b6d4' },
  { name: 'Outflow', value: 40, fill: '#f43f5e' }
];

const varianceMetrics = [
  { label: 'Maximum Variance', value: '$5,767,899.32', percentage: '21%', date: '10th Sep 2022', color: 'rose' },
  { label: 'Minimum Variance', value: '$1,197,359.80', percentage: '15.45%', date: '18th Sep 2022', color: 'green' },
  { label: 'Average Variance', value: '$1,678,899.32', percentage: '21%', date: '10th Sep 2022', color: 'amber' },
];

const CashFlowTab = () => {
  return (
    <div className="space-y-6">
      {/* Line Chart and Donut Chart */}
      <div className="grid grid-cols-3 gap-6">
        {/* Net Cashflow Line */}
        <div className="col-span-2 bg-white p-6 rounded shadow">
          <h2 className="text-lg font-semibold mb-4">Net Cashflow - Past 30 Days</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={cashflowData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[-2, 10]} tickFormatter={(v) => `${v}M`} />
              <Tooltip formatter={(v) => `$${v}M`} />
              <Line type="monotone" dataKey="actual" stroke="#f97316" name="Actual" />
              <Line type="monotone" dataKey="forecast" stroke="#16a34a" name="Forecast" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Donut Chart */}
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Net Cashflow</h3>
          <ResponsiveContainer width="100%" height={250}>
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="80%"
              barSize={20}
              data={donutData}
            >
              <RadialBar background clockWise dataKey="value" />
              <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" />
              <Tooltip formatter={(v) => `${v}%`} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Inflows & Outflows */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Inflows</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart layout="vertical" data={inflows}>
              <XAxis type="number" domain={[0, 10]} tickFormatter={(v) => `${v}M`} />
              <YAxis type="category" dataKey="name" width={130} />
              <Tooltip formatter={(v) => `$${v}M`} />
              <Bar dataKey="value" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Outflows</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart layout="vertical" data={outflows}>
              <XAxis type="number" domain={[-10, 0]} tickFormatter={(v) => `${-v}M`} />
              <YAxis type="category" dataKey="name" width={130} />
              <Tooltip formatter={(v) => `$${-v}M`} />
              <Bar dataKey="value" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Variance Cards */}
      <div className="grid grid-cols-3 gap-6">
        {varianceMetrics.map((metric, index) => (
          <div
            key={index}
            className={`border-l-4 border-${metric.color}-500 bg-white p-4 rounded shadow`}
          >
            <p className={`text-${metric.color}-600 font-semibold`}>{metric.label}</p>
            <h2 className="text-xl font-bold mt-1">
              {metric.value}{' '}
              <span className="text-sm text-gray-500">({metric.percentage})</span>
            </h2>
            <p className="text-sm text-gray-500">Measured on {metric.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CashFlowTab;
