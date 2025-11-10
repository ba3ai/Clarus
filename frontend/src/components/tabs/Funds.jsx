// src/pages/Funds.jsx
import React, { useMemo, useState } from "react";

/* ---------- demo data (replace with API later) ---------- */
const RAW = [
  { id: 1, name: "VoltEdge Ventures", type: "Fund", status: "open",   minimum: 50000,   color: "#1d4ed8" },
  { id: 2, name: "NeuraCap Syndicate", type: "Syndicate", status: "closed", minimum: 500000, color: "#059669" },
  { id: 3, name: "Quantum Fuse Fund", type: "Fund", status: "open",   minimum: 100000,  color: "#7c3aed" },
  { id: 4, name: "ZeroLayer Capital", type: "Fund", status: "open",   minimum: 50000,   color: "#0ea5e9" },
  { id: 5, name: "EchoGrid SPV",      type: "Syndicate", status: "closed", minimum: 50000,   color: "#f59e0b" },
  { id: 6, name: "Orion Bridge Fund", type: "Fund", status: "open",   minimum: 250000,  color: "#22c55e" },
];

/* ---------- helpers ---------- */
const fmtMoney0 = (n) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const StatusPill = ({ status }) => (
  <span
    className={
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
      (status === "open"
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200")
    }
  >
    <svg width="10" height="10" viewBox="0 0 20 20" className={status === "open" ? "fill-emerald-500" : "fill-slate-400"}>
      <circle cx="10" cy="10" r="10" />
    </svg>
    {status}
  </span>
);

const LogoDot = ({ color }) => (
  <span
    className="inline-block h-8 w-8 rounded-full ring-1 ring-black/5"
    style={{ background: `radial-gradient(circle at 30% 30%, #fff 0 20%, ${color} 25% 100%)` }}
    aria-hidden
  />
);

/* ---------- page ---------- */
export default function Funds() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("name"); // name | minimum

  const rows = useMemo(() => {
    let data = [...RAW];

    if (query.trim()) {
      const q = query.toLowerCase();
      data = data.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (type !== "All") data = data.filter((r) => r.type === type);
    if (status !== "All") data = data.filter((r) => r.status === status);

    data.sort((a, b) => (sort === "minimum" ? a.minimum - b.minimum : a.name.localeCompare(b.name)));
    return data;
  }, [query, type, status, sort]);

  return (
    <div className="p-6">
      {/* Hero */}
      <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="px-6 pt-8 pb-4 sm:px-10">
          <div className="text-2xl font-semibold tracking-tight text-slate-900">
            Connecting Investors to{" "}
            <span className="bg-gradient-to-r from-teal-600 to-sky-600 bg-clip-text text-transparent">
              Top-Tier Investment Managers
            </span>
          </div>
        </div>

        {/* “Browser” frame header */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
          <div className="ml-3 text-xs text-slate-500">clarus.app • Funds</div>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between px-4 sm:px-6">
          <div className="flex gap-6 text-sm">
            <button className="relative py-3 font-medium text-sky-700">
              Funds
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-sky-600" />
            </button>
            <button className="py-3 text-slate-500 hover:text-slate-700">SPVs</button>
            <button className="py-3 text-slate-500 hover:text-slate-700">Investors</button>
            <button className="py-3 text-slate-500 hover:text-slate-700">Companies</button>
            <button className="py-3 text-slate-500 hover:text-slate-700">Management</button>
            <button className="py-3 text-slate-500 hover:text-slate-700">Taxes</button>
          </div>

          <div className="hidden items-center gap-2 pr-2 sm:flex">
            <button className="rounded-full border border-slate-200 p-1.5 hover:bg-slate-50">
              <svg width="18" height="18" viewBox="0 0 24 24" className="fill-slate-500">
                <path d="M10 18a8 8 0 1 1 5.293-2.707l4.707 4.707-1.414 1.414-4.707-4.707A7.963 7.963 0 0 1 10 18Zm0-14a6 6 0 1 0 .001 12A6 6 0 0 0 10 4Z" />
              </svg>
            </button>
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          </div>
        </div>

        {/* Body: Connections pane */}
        <div className="px-4 pb-6 pt-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">Connections</div>
              <div className="text-sm text-slate-500">Approved Connections</div>
            </div>

            {/* filters */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search funds…"
                className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-sky-400"
              />
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-400"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option>All</option>
                <option>Fund</option>
                <option>Syndicate</option>
                <option>SPV</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-400"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-400"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Sort: Name</option>
                <option value="minimum">Sort: Minimum</option>
              </select>
            </div>
          </div>

          {/* table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 text-right font-medium">Minimum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <LogoDot color={r.color} />
                          <div className="font-medium text-slate-800">{r.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {fmtMoney0(r.minimum)}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                        No matches found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              <div>
                Showing <span className="font-medium text-slate-700">{rows.length}</span> of{" "}
                <span className="font-medium text-slate-700">{RAW.length}</span>
              </div>
              <button className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                View all
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
