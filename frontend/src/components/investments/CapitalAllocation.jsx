import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { AuthContext } from "../../context/AuthContext";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";

const CapitalAllocation = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        logout();
        navigate("/login");
        return;
      }

      try {
        const decoded = jwtDecode(token);
        if (decoded.user_type !== "investor") {
          logout();
          navigate("/login");
          return;
        }

        // Dummy data, replace with actual API call if needed
        const allocation = [
          { name: "Real Estate", value: 400 },
          { name: "Equities", value: 300 },
          { name: "Cash", value: 200 },
          { name: "Bonds", value: 100 }
        ];

        setData(allocation);
      } catch (err) {
        console.error("Error fetching capital allocation data", err);
        logout();
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [logout, navigate]);

  const COLORS = ["#21529f", "#a0aec0", "#edf2f7", "#718096"];

  if (loading) return <p className="p-6">Loading capital allocation...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">Capital Allocation</h2>
      <p className="text-sm text-gray-600 mb-6">This section provides a visual breakdown of your current investment allocations.</p>
      <div className="w-full h-96">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CapitalAllocation;
