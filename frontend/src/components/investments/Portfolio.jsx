// frontend/src/pages/Portfolio.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector
} from "recharts";

/** Utilities */
const currency = (n) =>
  (Number(n || 0)).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

const fmtPct = (n) =>
  (n === null || n === undefined || Number.isNaN(Number(n)))
    ? "—"
    : `${Number(n).toFixed(2)}%`;

const defaultPalette = [
  "#6366F1", "#10B981", "#60A5FA", "#F59E0B", "#EF4444",
  "#8B5CF6", "#14B8A6", "#22C55E", "#3B82F6", "#EAB308",
  "#F97316", "#EC4899", "#06B6D4", "#84CC16"
];

const isYM = (s) => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** End-of-month label like "Mar 31, 2025" */
const endOfMonthLabel = (ymStr) => {
  if (!ymStr) return "—";
  const [Y, M] = ymStr.split("-").map(Number);
  const d = new Date(Y, M, 0); // last day of month
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

/* ---- Donut copied to match InvestorOverview style ---- */
function Donut({ title, totalLabel, totalValue, data }) {
  const d = Array.isArray(data) ? data : [];
  const [activeIndex, setActiveIndex] = useState(-1);

  // Center value = hovered slice value or the provided total
  const displayValue = activeIndex >= 0 && d[activeIndex]
    ? d[activeIndex].value
    : totalValue;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="bg-white shadow rounded-lg px-3 py-2 border border-slate-200 text-sm">
        <div className="font-semibold text-slate-800">{p.name || "—"}</div>
        <div className="text-emerald-600">{fmtPct(p.percent)}</div>
        <div className="text-slate-700">
          {currency(p.value)}
        </div>
      </div>
    );
  };

  // Hovered slice becomes slightly larger (same behavior as InvestorOverview)
  const renderActive = (props) => {
    const {
      cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill,
    } = props;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    );
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      {title ? <div className="text-center mb-3 text-sm text-slate-500">{title}</div> : null}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={d}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={105}
              paddingAngle={2}
              isAnimationActive={false}
              activeIndex={activeIndex}
              activeShape={renderActive}
              onMouseEnter={(_, idx) => setActiveIndex(idx)}
              onMouseMove={(_, idx) => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(-1)}
            >
              {d.map((it, i) => (
                <Cell key={i} fill={it.color || defaultPalette[i % defaultPalette.length]} />
              ))}
            </Pie>

            {/* Center label via foreignObject (non-interactive) */}
            <foreignObject pointerEvents="none" x="0" y="0" width="100%" height="100%">
              <div className="w-full h-full grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-xs text-slate-500">{totalLabel}</div>
                  <div className="font-bold text-lg">
                    {currency(displayValue)}
                  </div>
                </div>
              </div>
            </foreignObject>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** —— period discovery matches InvestorOverview —— */
const SHEET = "bCAS (Q4 Adj)"; // same sheet used in overview

export default function Portfolio() {
  /** Filters/UI */
  const [company, setCompany] = useState("All");
  const [industry, setIndustry] = useState("All");
  const [type, setType] = useState("All");
  const [investor, setInvestor] = useState("All");
  const [query, setQuery] = useState("");

  /** Period list (months) — identical to Overview’s loader */
  const [months, setMonths] = useState([]);
  const [loadingMonths, setLoadingMonths] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingMonths(true);
        const res = await fetch(`/api/metrics/periods?sheet=${encodeURIComponent(SHEET)}`);
        const j = await res.json();
        const raw = Array.isArray(j?.periods) ? j.periods : (Array.isArray(j) ? j : []);
        const yms = raw.map((it) => {
          const s = typeof it === "string" ? it : (it?.as_of_date || it?.date || it?.as_of || "");
          const d = new Date(s);
          if (Number.isNaN(d.getTime())) return null;
          return ym(d);
        }).filter(Boolean);
        const uniq = Array.from(new Set(yms)).sort((a, b) => a.localeCompare(b));
        if (mounted) setMonths(uniq);
      } catch {
        if (mounted) setMonths([]);
      } finally {
        if (mounted) setLoadingMonths(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /** Range state (applied vs pending) */
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");
  const [fromYM, setFromYM] = useState("");
  const [toYM, setToYM] = useState("");

  useEffect(() => {
    if (!months.length) return;
    const start = months[0];
    const end = months[months.length - 1];
    setPendingFrom(start);
    setPendingTo(end);
    setFromYM(start);
    setToYM(end);
  }, [months]);

  const applyRange = useCallback(() => {
    if (!isYM(pendingFrom) || !isYM(pendingTo)) return;
    const iFrom = months.findIndex((m) => m === pendingFrom);
    const iTo = months.findIndex((m) => m === pendingTo);
    if (iFrom === -1 || iTo === -1 || iFrom > iTo) return;
    setFromYM(pendingFrom);
    setToYM(pendingTo);
  }, [pendingFrom, pendingTo, months]);

  const resetRange = useCallback(() => {
    if (!months.length) return;
    const start = months[0];
    const end = months[months.length - 1];
    setPendingFrom(start);
    setPendingTo(end);
    setFromYM(start);
    setToYM(end);
  }, [months]);

  /** Build headers like InvestorOverview so auth context can flow through */
  const buildHeaders = () => {
    const headers = {};
    try {
      const raw = localStorage.getItem("accessToken");
      if (raw && raw.split(".").length === 3) {
        const payload = JSON.parse(atob(raw.split(".")[1]));
        const email = payload.email || payload.upn || payload.preferred_username;
        const name  = payload.name;
        if (email) headers["X-User-Email"] = email;
        if (name)  headers["X-User-Name"]  = name;
      }
    } catch {}
    return headers;
  };

  /** ============= Fund-level KPIs (same endpoint as overview, no investor) ============= */
  const [initial, setInitial] = useState(0);
  const [current, setCurrent] = useState(0);
  const [roiPct, setRoiPct] = useState(0);
  const [moic, setMoic] = useState(0);
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    if (!isYM(fromYM) || !isYM(toYM)) return;
    const params = new URLSearchParams({ sheet: SHEET });
    params.set("from", `${fromYM}-01`);
    params.set("to", `${toYM}-01`);
    // fund totals
    (async () => {
      try {
        const res = await fetch(`/api/metrics/investor-overview?${params.toString()}`, {
          credentials: "include",
          headers: buildHeaders(),
        });
        const j = await res.json();
        setInitial(Number(j.initial_value || 0));
        setCurrent(Number(j.current_value || 0));
        setMoic(Number(j.moic || 0));
        setRoiPct(Number(j.roi_pct || 0));
        setAsOf(j.current_date || j.latest_date || "");
      } catch {
        setInitial(0); setCurrent(0); setMoic(0); setRoiPct(0); setAsOf("");
      }
    })();
  }, [fromYM, toYM]);

  /** ============= Allocation → donut + table ============= */
  const allocMonth = useMemo(() => {
    if (asOf) {
      const d = new Date(asOf);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    return toYM || "";
  }, [asOf, toYM]);

  const [slices, setSlices] = useState([]);
  useEffect(() => {
    (async () => {
      if (!allocMonth) { setSlices([]); return; }
      try {
        const res = await fetch(`/api/metrics/allocation?period_end=${encodeURIComponent(allocMonth)}`);
        const j = await res.json();
        const items = Array.isArray(j?.items) ? j.items : [];
        const out = items
          .filter(it => Number(it.percent) > 0)
          .map((it, idx) => ({
            name: it.name,
            percent: Number(it.percent),
            value: Number((current * (Number(it.percent) / 100)).toFixed(2)),
            color: it.color || defaultPalette[idx % defaultPalette.length],
          }));
        setSlices(out);
      } catch {
        setSlices([]);
      }
    })();
  }, [allocMonth, current]);

  /** Table rows (latest only, 3 columns) */
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    async function loadTable() {
      setLoadingRows(true);
      try {
        const derived = slices.map((s, i) => ({
          id: i + 1,
          name: s.name,
          current: s.value,
          dateYm: allocMonth,
        }));
        setRows(derived);
      } finally {
        setLoadingRows(false);
      }
    }
    loadTable();
  }, [slices, allocMonth]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name?.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Portfolio Summary</h1>

      {/* Filters + range (mirrors overview) */}
      <div className="rounded-xl bg-sky-200/60 border border-sky-200 p-3 flex flex-wrap items-center gap-3">
        <select className="rounded-lg bg-white border border-slate-300 px-3 py-2"
          value={company} onChange={e => setCompany(e.target.value)}>
          <option>Companies: All</option>
        </select>

        <span className="text-slate-700">where</span>

        <select className="rounded-lg bg-white border border-slate-300 px-3 py-2"
          value={industry} onChange={e => setIndustry(e.target.value)}>
          <option>Industries: All</option>
        </select>

        <select className="rounded-lg bg-white border border-slate-300 px-3 py-2"
          value={type} onChange={e => setType(e.target.value)}>
          <option>Investment types: All</option>
          <option>Equity</option>
          <option>Debt</option>
        </select>

        <select className="rounded-lg bg-white border border-slate-300 px-3 py-2"
          value={investor} onChange={e => setInvestor(e.target.value)}>
          <option>Investors: All</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <select
            className="rounded-lg bg-white border border-slate-300 px-3 py-2"
            value={pendingFrom}
            onChange={(e) => setPendingFrom(e.target.value)}
          >
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-slate-700">to</span>
          <select
            className="rounded-lg bg-white border border-slate-300 px-3 py-2"
            value={pendingTo}
            onChange={(e) => setPendingTo(e.target.value)}
          >
            {months
              .slice(Math.max(0, months.indexOf(pendingFrom)))
              .map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={applyRange} className="rounded-lg bg-sky-600 text-white px-3 py-2 text-sm font-medium">Apply</button>
          <button onClick={resetRange} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Reset</button>
        </div>
      </div>

      {/* Overview + Donut (now matches InvestorOverview) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-slate-700 mb-3 font-medium">360° Portfolio Overview</div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <div className="text-slate-500 text-sm">Initial value</div>
                  <div className="text-xl text-sky-700 font-semibold">{currency(initial)}</div>
                </div>
                <div className="text-slate-400">→</div>
                <div className="text-center">
                  <div className="text-slate-500 text-sm">Current value</div>
                  <div className="text-xl text-sky-700 font-semibold">{currency(current)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-slate-500 text-sm">ROI</div>
              <div className="text-emerald-600 text-xl font-semibold">
                {roiPct >= 0 ? "+" : ""}{fmtPct(roiPct)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-slate-500 text-sm">MOIC</div>
              <div className="text-slate-800 text-xl font-semibold">{Number(moic || 0).toFixed(2)}x</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-6 grid grid-cols-1 gap-6">
            <Donut
              title="Portfolio Allocation"
              totalLabel="Current Value"
              totalValue={Math.round(current)}
              data={slices}
            />
          </div>
        </div>
      </div>

      {/* Search + Table (3 columns) */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <input
            className="w-80 rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Search by anything"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Export</button>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Edit columns</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left px-5 py-3 font-medium">NAME</th>
                <th className="text-left px-5 py-3 font-medium">INVESTMENT</th>
                <th className="text-left px-5 py-3 font-medium">DATE</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={3}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="px-5 py-6 text-slate-500" colSpan={3}>No results</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-5 py-3 text-sky-700">{r.name}</td>
                    <td className="px-5 py-3">{currency(r.current)}</td>
                    <td className="px-5 py-3">{endOfMonthLabel(r.dateYm)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
