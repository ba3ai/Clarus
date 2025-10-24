// src/components/groupadmin/FundPerformanceTab.jsx

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const performanceData = [
  { quarter: 'Q2 2019', investment: 4, gain: 0, moic: 1.0 },
  { quarter: 'Q3 2019', investment: 8, gain: 0, moic: 1.0 },
  { quarter: 'Q4 2019', investment: 15, gain: 0, moic: 1.0 },
  { quarter: 'Q1 2020', investment: 17, gain: 4, moic: 1.1 },
  { quarter: 'Q2 2020', investment: 21, gain: 4, moic: 1.1 },
  { quarter: 'Q3 2020', investment: 25, gain: 5, moic: 1.2 },
  { quarter: 'Q4 2020', investment: 42, gain: 6, moic: 1.3 },
  { quarter: 'Q1 2021', investment: 48, gain: 10, moic: 1.5 },
  { quarter: 'Q2 2021', investment: 82, gain: 20, moic: 1.8 },
  { quarter: 'Q3 2021', investment: 88, gain: 28, moic: 2.0 },
  { quarter: 'Q4 2021', investment: 88, gain: 30, moic: 2.1 },
  { quarter: 'Q1 2022', investment: 96, gain: 34, moic: 2.2 },
  { quarter: 'Q2 2022', investment: 109, gain: 39, moic: 2.3 },
  { quarter: 'Q3 2022', investment: 120, gain: 44, moic: 2.4 },
  { quarter: 'Q4 2022', investment: 148, gain: 50, moic: 2.5 },
  { quarter: 'Q1 2023', investment: 154, gain: 55, moic: 2.5 },
  { quarter: 'Q2 2023', investment: 164, gain: 60, moic: 2.6 },
  { quarter: 'Q3 2023', investment: 162, gain: 58, moic: 2.4 },
];

const statCards = [
  {
    title: 'Net Fund performance',
    data: [
      { label: 'Contribution', value: '$82.0M' },
      { label: 'NAV & Distribution', value: '$162.8M' },
      { label: 'Gain', value: '$80.8M' },
      { label: 'Fund size', value: '$140.0M' },
      { label: 'TVPI', value: '1.99x' },
      { label: 'IRR', value: '29.80%' },
    ]
  },
  {
    title: 'Total Portfolio performance',
    data: [
      { label: 'Investment', value: '$78.3M' },
      { label: 'Fair value', value: '$161.7M' },
      { label: 'Gain', value: '$83.4M' },
      { label: 'Companies', value: '2' },
      { label: 'MOIC', value: 'x2.06' },
      { label: 'IRR', value: '33.23%' },
    ]
  }
];

const FundPerformanceTab = () => {
  return (
    <div className="space-y-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {statCards.map((card, idx) => (
          <div key={idx} className="bg-white shadow p-6 rounded-lg">
            <h3 className="text-md font-semibold mb-4 text-gray-700">{card.title}</h3>
            <div className="grid grid-cols-2 gap-4">
              {card.data.map((item, i) => (
                <div key={i}>
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className="font-bold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Total Portfolio Performance Chart */}
      <div className="bg-white shadow p-6 rounded-lg">
        <h3 className="text-md font-semibold mb-4 text-gray-700">Total Portfolio Performance</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={performanceData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="quarter" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" domain={[1, 3]} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="investment" stackId="a" fill="#606060" name="Investment" />
            <Bar yAxisId="left" dataKey="gain" stackId="a" fill="#49C5B6" name="Net Gain/(Loss)" />
            <Line yAxisId="right" type="monotone" dataKey="moic" stroke="#FFA500" name="MOIC" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FundPerformanceTab;
