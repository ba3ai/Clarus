// frontend/src/pages/Investors.jsx
import React, { useEffect, useMemo, useState } from "react";

function Investors() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchUrl, setFetchUrl] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    "";

  async function findEndpoint() {
    const candidates = [
      "https://clarus.azurewebsites.net/api/invitations?status=accepted",
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.data)
            ? data.data
            : [];
          if (Array.isArray(list)) {
            setFetchUrl(url);
            return list;
          }
        }
      } catch {
        /* try next */
      }
    }
    throw new Error(
      "No invitations API endpoint responded. Expose /api/invitations?status=accepted (recommended)."
    );
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const list = await findEndpoint();
        if (!mounted) return;
        // Normalize: pull investor fields (company_name, address, contact_phone, email)
        const normalized = list
          .filter((it) => (it.status || "").toLowerCase() === "accepted")
          .map((it) => {
            const inv = it.investor || {};
            return {
              id: it.id ?? it.invitation_id ?? inv.id ?? crypto.randomUUID(),
              name: inv.name || it.name || "",
              email: inv.email || it.email || "",
              company_name: inv.company_name || "",
              address: inv.address || "",
              contact_phone: inv.contact_phone || "",
              invited_by: it.invited_by ?? null,
              created_at: it.created_at || null, // invite time
              used_at: it.used_at || null,      // accepted time
              status: it.status || "accepted",
            };
          });
        setRows(normalized);
      } catch (e) {
        setError(
          e?.message ||
            "Failed to load accepted investors. Please check the API route."
        );
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        r.company_name.toLowerCase().includes(s) ||
        r.address.toLowerCase().includes(s) ||
        r.contact_phone.toLowerCase().includes(s) ||
        String(r.invited_by || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  function fmt(dt) {
    if (!dt) return "—";
    try {
      const d = new Date(dt);
      if (Number.isNaN(d.getTime())) return dt;
      return d.toLocaleString();
    } catch {
      return dt;
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Investors (Invitation Accepted)</h2>
        <div className="text-sm text-gray-500">
          {fetchUrl ? `Source: ${fetchUrl}` : ""}
        </div>
      </div>

      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, company, address, contact…"
          className="w-full max-w-sm rounded-lg border px-3 py-2 outline-none focus:ring"
        />
      </div>

      {loading && (
        <div className="rounded-lg border p-6 text-gray-600">Loading…</div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border p-6 text-gray-600">
          No accepted investors found.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">User Id (Email)</th>
                <th className="px-4 py-3 font-medium">Invited By</th>
                <th className="px-4 py-3 font-medium">Invited On</th>
                <th className="px-4 py-3 font-medium">Accepted On</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.name || "—"}</td>
                  <td className="px-4 py-3">{r.company_name || "—"}</td>
                  <td className="px-4 py-3">{r.address || "—"}</td>
                  <td className="px-4 py-3">{r.contact_phone || "—"}</td>
                  <td className="px-4 py-3">{r.email || "—"}</td>
                  <td className="px-4 py-3">{r.invited_by ?? "—"}</td>
                  <td className="px-4 py-3">{fmt(r.created_at)}</td>
                  <td className="px-4 py-3">{fmt(r.used_at)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Investors;
