import React, { useEffect, useState } from "react";

const ITEMS_PER_PAGE = 10;
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

export default function AllUsers() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddUserPopup, setShowAddUserPopup] = useState(false);

  async function fetchUsers() {
    try {
      setLoading(true); setError("");

      // Cookie-based auth: send credentials, no hardcoded origin
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (res.status === 401) {
        throw new Error("Not authorized. Please sign in again.");
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Failed to fetch users: ${res.status}${msg ? ` – ${msg}` : ""}`);
      }

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data?.users || []);
      setFilteredUsers(Array.isArray(data) ? data : data?.users || []);
    } catch (err) {
      setError(err?.message || "Error fetching users");
      setUsers([]); setFilteredUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(term) ||
        (u.email || "").toLowerCase().includes(term)
    );
    setFilteredUsers(filtered);
    setCurrentPage(1);
  }, [searchTerm, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const handleAddUser = () => setShowAddUserPopup(true);
  const closePopup = () => { setShowAddUserPopup(false); fetchUsers(); };

  if (loading) return <p className="text-center mt-6">Loading users...</p>;
  if (error) return <p className="text-center text-red-600 mt-6">{error}</p>;

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">All Users</h1>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <input
            type="text"
            placeholder="🔍 Search by name or email"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <button
            onClick={handleAddUser}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-5 py-2 rounded-lg shadow-md transition w-full sm:w-auto"
          >
            + Add New User
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Bank</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Permission</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center p-4">
                  No users found.
                </td>
              </tr>
            ) : (
              paginated.map((user) => (
                <tr key={user.id || `${user.email}-${user.name}`} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{user.name || "—"}</td>
                  <td className="px-4 py-2">{user.email || "—"}</td>
                  <td className="px-4 py-2">{user.bank || "—"}</td>
                  <td className="px-4 py-2">{user.status || "—"}</td>
                  <td className="px-4 py-2">{user.permission || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-500 mt-4">
        Showing {paginated.length} of {filteredUsers.length} users
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center items-center gap-4">
          <button
            onClick={handlePrev}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            ◀ Prev
          </button>
          <span className="text-gray-700 font-semibold">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={handleNext}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            Next ▶
          </button>
        </div>
      )}

      {/* AddUser modal placeholder — keep your existing <AddUser /> implementation */}
      {showAddUserPopup && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50">
          <div className="relative w-full max-w-6xl bg-white rounded-lg shadow-lg max-h-[90vh] overflow-y-auto">
            <button
              onClick={closePopup}
              className="absolute top-3 right-3 bg-white text-gray-600 px-3 py-1 rounded shadow hover:bg-gray-100"
            >
              ✖ Close
            </button>
            {/* If AddUser is local to another path, import it there. */}
            {/* <AddUser /> */}
          </div>
        </div>
      )}
    </div>
  );
}
