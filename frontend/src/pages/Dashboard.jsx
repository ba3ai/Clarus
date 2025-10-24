// src/pages/Dashboard.jsx

import React, { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import AdminDashboard from '../components/AdminDashboard';
import InvestorDashboard from '../components/InvestorDashboard';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const decoded = jwtDecode(token);
      console.log("Decoded token:", decoded);

      const userType = decoded?.user_type?.toLowerCase(); // Normalize
      if (userType === 'admin') {
        setRole('admin');
      } else if (userType === 'investor') {
        setRole('investor');
      } else {
        throw new Error("Unrecognized user type");
      }

    } catch (err) {
      console.error("Token decoding error:", err);
      localStorage.removeItem('token');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  if (loading) return <p>Checking access...</p>;

  return (
    <div>
      {role === 'admin' ? <AdminDashboard /> : <InvestorDashboard />}
    </div>
  );
};

export default Dashboard;
