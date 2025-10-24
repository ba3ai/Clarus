import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import CapitalAccountTab from './groupadmin/CapitalAccountTab';
import FundPerformanceTab from './groupadmin/FundPerformanceTab';
import CashFlowTab from './groupadmin/CashFlowTab';
import GPFeesCarryTab from './groupadmin/GPFeesCarryTab';
import ExpensesTab from './groupadmin/ExpensesTab';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, BarChart, Bar,
  PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Legend
} from 'recharts';

const GroupAdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    axios
      .get('/api/group-admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUsers(res.data))
      .catch((err) => console.error(err));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const lineData = [
    { year: '2010', investment: 8000 },
    { year: '2011', investment: 12000 },
    { year: '2012', investment: 18000 },
    { year: '2013', investment: 15000 },
    { year: '2014', investment: 25000 },
    { year: '2015', investment: 12000 },
  ];

  const barData = [
    { group: 'AAA', value: 28000 },
    { group: 'A', value: 26000 },
    { group: 'AA', value: 12000 },
    { group: 'BB', value: 5000 },
    { group: 'BBB', value: 15000 },
  ];

  const pieData = [
    { name: 'CMO', value: 27 },
    { name: 'Corporates', value: 60 },
    { name: 'Municipal', value: 4 },
    { name: 'MBS', value: 1 },
    { name: 'Cash', value: 8 },
  ];

  const scatterData = [
    { book: 100, market: 28000, group: 'AAA' },
    { book: 700, market: 26000, group: 'A' },
    { book: 400, market: 12000, group: 'AA' },
    { book: 200, market: 5000, group: 'BB' },
    { book: 300, market: 15000, group: 'BBB' },
  ];

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#00C49F'];

  const renderOverview = () => (
    <>
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-500">Total Invested Amount</h3>
          <p className="text-2xl font-bold text-pink-600 mt-2">$79,155M</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-500">Number of Investments</h3>
          <p className="text-2xl font-bold text-purple-600 mt-2">2216</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-500">Rate of Return</h3>
          <p className="text-2xl font-bold text-blue-600 mt-2">-4.16%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Yearly Total Investment</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData}>
              <Line type="monotone" dataKey="investment" stroke="#8884d8" />
              <CartesianGrid stroke="#ccc" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Total Investment by Rating Group</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="group" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Total Investment by Asset Class</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RePieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </RePieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Market vs Book Value by Rating</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ScatterChart>
              <CartesianGrid />
              <XAxis dataKey="market" name="Market Value" unit="$" />
              <YAxis dataKey="book" name="Book Value" unit="$" />
              <ZAxis range={[60]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Rating" data={scatterData} fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 mt-6 rounded shadow">
        <h3 className="text-lg font-semibold mb-4">Top Investment Companies</h3>
        <table className="w-full table-auto border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2 text-left">Company</th>
              <th className="border p-2 text-left">Industry</th>
              <th className="border p-2 text-left">Investment</th>
              <th className="border p-2 text-left">Return</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-gray-50">
              <td className="border p-2">Alpha Capital</td>
              <td className="border p-2">Finance</td>
              <td className="border p-2">$10,000,000</td>
              <td className="border p-2 text-green-600">+5%</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="border p-2">Zenith Ventures</td>
              <td className="border p-2">Tech</td>
              <td className="border p-2">$7,500,000</td>
              <td className="border p-2 text-red-500">-2%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-white border-r flex flex-col justify-between shadow-sm">
        <div>
          <div className="px-6 py-5 border-b">
            <h2 className="text-xl font-bold text-center">Group Admin</h2>
            <p className="text-sm text-gray-500 text-center">Dashboard</p>
          </div>

          <nav className="p-4 space-y-2">
            {[
              'Overview',
              'Fund Performance Status',
              'Cash Flow and Net IRR',
              'Capital Account',
              'GP Fees & carry and Expenses',
            ].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm w-full text-left font-medium ${
                  activeTab === tab ? 'bg-blue-100 text-blue-800' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 space-y-6">
        {activeTab === 'Overview' && renderOverview()}
        {activeTab === 'Fund Performance Status' && <FundPerformanceTab />}
        {activeTab === 'Cash Flow and Net IRR' && <CashFlowTab />}
        {activeTab === 'Capital Account' && <CapitalAccountTab />}
        {activeTab === 'GP Fees & carry and Expenses' && <GPFeesCarryTab />}
        {activeTab === 'Expenses' && <ExpensesTab />}
      </main>
    </div>
  );
};

export default GroupAdminDashboard;
