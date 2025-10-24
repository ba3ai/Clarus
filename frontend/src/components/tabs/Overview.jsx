import React, { useEffect, useState, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";

/* ================== Config ================== */
const API_BASE = import.meta?.env?.VITE_API_BASE || "https://clarus.azurewebsites.net/api";
const DEFAULT_SHEET = "bCAS (Q4 Adj)";

/* ================== Helpers ================== */
const toNum = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmtMoney = (v) =>
  toNum(v)?.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) ?? "—";
const fmtMoney0 = (v) =>
  toNum(v)?.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) ?? "—";
const fmtUSD2 = (n) =>
  `$${(Number(n || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const fmtPct = (n) =>
  `${(Number(n || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const fmtPctSign = (v) => {
  const n = toNum(v);
  return n == null ? "—" : `${n >= 0 ? "+ " : "- "}${Math.abs(n).toFixed(2)}%`;
};

const ym = (d) => String(d).slice(0, 7); // YYYY-MM
const monthsBetween = (d0, d1) => {
  const a = new Date(d0);
  const b = new Date(d1);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

/** palette */
const COLORS = [
  "#6366F1",
  "#10B981",
  "#60A5FA",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#14B8A6",
  "#22C55E",
  "#3B82F6",
  "#EAB308",
  "#F97316",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

/* ================== Active Slice (pop on hover) ================== */
function ActiveSlice({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill }) {
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
}

/* ================== Tooltip: % on top, {name} — $ below ================== */
function DonutTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const percent =
    p?.payload?.percent != null
      ? p.payload.percent
      : p?.percent != null
      ? p.percent * 100
      : null;
  const name = p?.payload?.name ?? p?.name ?? "";
  return (
    <div
      className="rounded-md bg-white/95 shadow px-3 py-2 border border-gray-200"
      style={{ pointerEvents: "none" }}
    >
      <div className="text-sm font-semibold text-gray-800">
        {percent == null ? "—" : fmtPct(percent)}
      </div>
      <div className="text-xs text-gray-600 mt-1">
        <span className="font-medium">{name}</span> — {fmtUSD2(p?.value)}
      </div>
    </div>
  );
}

/* ================== Donut Component (center updates on hover) ================== */
function Donut({ data, title, total }) {
  const RING = { inner: 80, outer: 112 }; // thickness ~32px
  const [activeIndex, setActiveIndex] = useState(-1);

  const centerName =
    activeIndex >= 0 && data[activeIndex] ? data[activeIndex].name : title;
  const centerValue =
    activeIndex >= 0 && data[activeIndex] ? data[activeIndex].value : total;

  const onEnter = useCallback((_, i) => setActiveIndex(i), []);
  const onLeave = useCallback(() => setActiveIndex(-1), []);

  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={RING.inner}
            outerRadius={RING.outer}
            paddingAngle={1.2}
            isAnimationActive={true}
            stroke="#fff"
            strokeWidth={1.5}
            activeIndex={activeIndex}
            activeShape={ActiveSlice}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label that responds to hover */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center leading-tight">
          <div className="text-gray-500 text-sm">{centerName}</div>
          <div className="text-xl font-extrabold text-gray-900">
            {fmtMoney0(centerValue)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================== Users Panel + Demo Cards (kept) ================== */
function UsersPanel() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${API_BASE}/users?type=${encodeURIComponent(filter)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const j = await r.json();
        setRows(j.items || []);
        setCount(j.count || 0);
      } catch (e) {
        setErr(e.message || "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, [filter]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white mt-8">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-700">Users ({count})</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Filter</span>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="investor">Investor</option>
            <option value="admin">Admin</option>
            <option value="group-admin">Group Admin</option>
          </select>
        </div>
      </div>

      {err && <div className="px-4 py-3 text-sm text-red-600">{err}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Email</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Type</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Organization</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Permission</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.length ? (
              rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.user_type}</td>
                  <td className="px-4 py-2">{u.organization || "—"}</td>
                  <td className="px-4 py-2">{u.status}</td>
                  <td className="px-4 py-2">{u.permission}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={6}>
                  {err || "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ManagementOverview() {
  const stats = { managers: 7, activeMandates: 12, feesYTD: 1235000.25 };
  const rows = [
    { manager: "NorthBridge Capital", entities: 5, feesYTD: 482000 },
    { manager: "Apex Advisors", entities: 3, feesYTD: 316500 },
    { manager: "Summit Partners", entities: 4, feesYTD: 239000 },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-700">Management — overview</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
        <StatCard label="Total managers" value={stats.managers} />
        <StatCard label="Active mandates" value={stats.activeMandates} />
        <StatCard label="Management fees (YTD)" value={fmtMoney(stats.feesYTD)} />
      </div>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Manager</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Entities</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Fees YTD</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.manager}</td>
                <td className="px-4 py-2">{r.entities}</td>
                <td className="px-4 py-2">{fmtMoney(r.feesYTD)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaxesOverview() {
  const stats = { returnsDue: 5, paidYTD: 842000, outstanding: 96500, nextDeadline: "2025-10-31" };
  const rows = [
    { entity: "Opportunity Fund I LP", form: "1065", fy: "2024", due: "2025-10-31", status: "Due" },
    { entity: "General Partner LLC", form: "1120", fy: "2024", due: "2025-11-15", status: "Prep" },
    { entity: "SPV Alpha LLC", form: "1065", fy: "2024", due: "2025-10-31", status: "Filed" },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-700">Taxes — overview</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4">
        <StatCard label="Returns due" value={stats.returnsDue} />
        <StatCard label="Taxes paid (YTD)" value={fmtMoney(stats.paidYTD)} />
        <StatCard label="Outstanding" value={fmtMoney(stats.outstanding)} />
        <StatCard label="Next deadline" value={stats.nextDeadline} />
      </div>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Entity</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Form</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">FY</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Due</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.entity}</td>
                <td className="px-4 py-2">{r.form}</td>
                <td className="px-4 py-2">{r.fy}</td>
                <td className="px-4 py-2">{r.due}</td>
                <td className="px-4 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FundsOverview({ aumHint }) {
  const stats = {
    totalFunds: 4,
    aum: toNum(aumHint) ?? 100826843.65,
    navChgYTD: 10.2,
  };
  const rows = [
    { fund: "Opportunity Fund I", nav: 52100000, irr: 13.1, moic: 1.22 },
    { fund: "Opportunity Fund II", nav: 32700000, irr: 11.6, moic: 1.18 },
    { fund: "General Partner Holdings", nav: 11600000, irr: 8.9, moic: 1.10 },
    { fund: "SPV Alpha", nav: 5600000, irr: 19.4, moic: 1.35 },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-700">Funds — overview</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
        <StatCard label="Total funds" value={stats.totalFunds} />
        <StatCard label="AUM (approx.)" value={fmtMoney(stats.aum)} sub="Uses current value when available" />
        <StatCard label="NAV change (YTD)" value={fmtPctSign(stats.navChgYTD)} />
      </div>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Fund</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">NAV</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">IRR</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">MOIC</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.fund}</td>
                <td className="px-4 py-2">{fmtMoney(r.nav)}</td>
                <td className="px-4 py-2">{fmtPctSign(r.irr)}</td>
                <td className="px-4 py-2">{r.moic.toFixed(2)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================== Main Overview (synced donuts & KPIs) ================== */
export default function Overview() {
  const [tab, setTab] = useState("portfolio");
  const [opsTab, setOpsTab] = useState("management");

  // left KPI block (from portfolio_period_metrics)
  const [initialValue, setInitialValue] = useState(null);
  const [currentValue, setCurrentValue] = useState(null);
  const [roiPct, setRoiPct] = useState(null);
  const [moic, setMoic] = useState(null);
  const [irrPct, setIrrPct] = useState(null);
  const [error, setError] = useState("");

  const [payloadMeta, setPayloadMeta] = useState({
    source: "db",
    basis: "range",
    period_end: "",
  });

  // month→month selection
  const [periods, setPeriods] = useState([]);
  const [months, setMonths] = useState([]);
  const [fromYM, setFromYM] = useState("");
  const [toYM, setToYM] = useState("");

  // donut allocations (initial/current)
  const [allocInit, setAllocInit] = useState({ total: 0, items: [], as_of: null });
  const [allocCurr, setAllocCurr] = useState({ total: 0, items: [], as_of: null });

  /** compute initial/current from portfolio_period_metrics */
  const computeRangeFromPeriods = useCallback((fromM, toM, rowsArg) => {
    const baseRows = Array.isArray(rowsArg) ? rowsArg : periods;
    if (!baseRows.length || !fromM || !toM) return { init: null, cur: null };

    const findByMonth = (m) => baseRows.find((r) => ym(r.as_of_date) === m);
    const firstRow = findByMonth(fromM);
    const lastRow = findByMonth(toM);

    let init = null;
    let cur = toNum(lastRow?.ending_balance);

    if (fromM === toM) {
      init = toNum(firstRow?.beginning_balance);
      if (init == null) {
        const [y, m] = fromM.split("-").map(Number);
        const prevM = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
        const prevRow = findByMonth(prevM);
        init = toNum(prevRow?.ending_balance) ?? cur ?? 0;
      }
    } else {
      init = toNum(firstRow?.ending_balance);
    }

    return { init, cur };
  }, [periods]);

  const computeCagrIrrByMonths = (fromYYYYMM, toYYYYMM, v0, vN) => {
    if (!fromYYYYMM || !toYYYYMM || !v0 || !vN) return null;
    const monthsDiff = Math.max(1, monthsBetween(`${fromYYYYMM}-01`, `${toYYYYMM}-01`));
    const years = monthsDiff / 12;
    return (Math.pow(vN / v0, 1 / years) - 1) * 100.0;
  };

  const applyFromTo = (fromM, toM, rowsArg) => {
    if (!fromM || !toM) return;
    const baseRows = Array.isArray(rowsArg) ? rowsArg : periods;
    if (!baseRows.length) return;

    const monthsAsc = Array.from(new Set(baseRows.map((r) => ym(r.as_of_date))));
    if (monthsAsc.indexOf(fromM) > monthsAsc.indexOf(toM)) {
      setError("Invalid month range");
      return;
    }
    setError("");

    const { init, cur } = computeRangeFromPeriods(fromM, toM, baseRows);

    const m = init ? cur / init : null;
    const r = init ? ((cur - init) / init) * 100 : null;
    const irr = computeCagrIrrByMonths(fromM, toM, init, cur);

    setInitialValue(init);
    setCurrentValue(cur);
    setMoic(m);
    setRoiPct(r);
    setIrrPct(irr);

    setPayloadMeta({ source: "db", basis: "range", period_end: toM });
  };

  /* ---- Load periods (months) for left KPIs & controls ---- */
  useEffect(() => {
    (async () => {
      setError("");
      try {
        const res = await fetch(
          `${API_BASE}/metrics/periods?sheet=${encodeURIComponent(DEFAULT_SHEET)}`,
          { headers: { Accept: "application/json" }, cache: "no-store" }
        );
        const rows = await res.json();
        if (!Array.isArray(rows) || !rows.length) throw new Error("No data");
        rows.sort((a, b) => new Date(a.as_of_date) - new Date(b.as_of_date));
        setPeriods(rows);

        const yms = Array.from(new Set(rows.map((r) => ym(r.as_of_date))));
        setMonths(yms);

        const f = yms[0];
        const t = yms[yms.length - 1];
        setFromYM(f);
        setToYM(t);
        applyFromTo(f, t, rows);
      } catch (e) {
        setError(e.message || "Failed to load data");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- SSE refresh (optional) ---- */
  useEffect(() => {
    let es;
    (async () => {
      try {
        es = new EventSource(`${API_BASE}/metrics/stream`);
        es.addEventListener("refresh", async () => {
          try {
            const res = await fetch(
              `${API_BASE}/metrics/periods?sheet=${encodeURIComponent(DEFAULT_SHEET)}`,
              { headers: { Accept: "application/json" }, cache: "no-store" }
            );
            const rows = await res.json();
            if (!Array.isArray(rows) || !rows.length) return;
            rows.sort((a, b) => new Date(a.as_of_date) - new Date(b.as_of_date));

            setPeriods(rows);
            const yms = Array.from(new Set(rows.map((r) => ym(r.as_of_date))));
            setMonths(yms);

            const validFrom = yms.includes(fromYM) ? fromYM : yms[0];
            const validTo = yms.includes(toYM) ? toYM : yms[yms.length - 1];
            setFromYM(validFrom);
            setToYM(validTo);
            applyFromTo(validFrom, validTo, rows);
          } catch {}
        });
      } catch {}
    })();
    return () => es?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYM, toYM]);

  /* ---- Allocation fetcher (now tolerant; never throws) ---- */
  const fetchAlloc = async (periodEnd) => {
    try {
      const r = await fetch(
        `${API_BASE}/metrics/allocation?period_end=${encodeURIComponent(periodEnd)}`,
        { headers: { Accept: "application/json" }, cache: "no-store" }
      );
      const j = await r.json();
      // If backend responds with error or empty items, we just return an empty set — we'll fallback later
      if (!r.ok) return { total: 0, as_of: null, items: [] };
      const items = (j.items || [])
        .map((x, i) => ({
          name: x.name,
          value: Number(x.value || 0),
          percent: Number(x.percent || 0),
          color: x.color || COLORS[i % COLORS.length],
        }))
        .filter((it) => it.value > 0);
      return { total: Number(j.total || 0), as_of: j.as_of, items };
    } catch {
      return { total: 0, as_of: null, items: [] };
    }
  };

  // Turn an empty allocation into a single "All" slice using the provided total
  const withFallbackSlice = (alloc, totalForMonth) => {
    const t = toNum(totalForMonth) ?? toNum(alloc.total) ?? 0;
    const items =
      alloc.items && alloc.items.length
        ? alloc.items
        : t > 0
        ? [{ name: "All", value: t, percent: 100, color: COLORS[0] }]
        : [];
    return { ...alloc, total: t, items };
  };

  /* ---- Load donuts (Initial=fromYM, Current=toYM) and keep totals synced with KPIs ---- */
  useEffect(() => {
    (async () => {
      if (!fromYM || !toYM || !periods.length) return;
      const [initAlloc, currAlloc] = await Promise.all([fetchAlloc(fromYM), fetchAlloc(toYM)]);
      const { init, cur } = computeRangeFromPeriods(fromYM, toYM, periods);

      // Apply fallback so we always have a "full chart" until per-investment data arrives
      setAllocInit(withFallbackSlice(initAlloc, init));
      setAllocCurr(withFallbackSlice(currAlloc, cur));
    })();
  }, [fromYM, toYM, periods, computeRangeFromPeriods]);

  /* ================== UI ================== */
  return (
    <div className="p-6 bg-white rounded-2xl shadow">
      {/* Header + range */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">360° Portfolio Overview</h2>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">From</div>
          <select className="border rounded px-2 py-1 text-sm" value={fromYM} onChange={(e) => setFromYM(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="text-sm text-gray-600">to</div>
          <select className="border rounded px-2 py-1 text-sm" value={toYM} onChange={(e) => setToYM(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button
            className="px-3 py-1 rounded text-sm bg-sky-600 text-white hover:bg-sky-700"
            onClick={() => applyFromTo(fromYM, toYM)}
            title="Apply month range"
          >
            Apply
          </button>

          <button
            className="text-sky-600 text-sm hover:underline"
            onClick={() => {
              if (!months.length) return;
              const f = months[0];
              const t = months[months.length - 1];
              setFromYM(f);
              setToYM(t);
              applyFromTo(f, t);
            }}
            title="Reset to full span"
          >
            Reset
          </button>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">Error: {error}</div>}

      {/* KPIs + Donuts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left KPIs */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-slate-50 p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
              <div className="text-center">
                <div className="text-xs text-gray-500">Initial value</div>
                <div className="text-2xl font-semibold text-sky-700">{fmtMoney(initialValue)}</div>
              </div>
              <div className="text-center text-2xl text-gray-400">→</div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Current value</div>
                <div className="text-2xl font-semibold text-sky-700">{fmtMoney(currentValue)}</div>
                {toYM && <div className="text-[11px] text-gray-500 mt-1">as of {toYM}</div>}
              </div>
            </div>

            <div className="mt-2 text-[11px] text-gray-400">
              <span>source: {payloadMeta.source}</span>
              <span className="mx-2">•</span>
              <span>basis: {payloadMeta.basis}</span>
              {payloadMeta.period_end && (
                <>
                  <span className="mx-2">•</span>
                  <span>period_end: {payloadMeta.period_end}</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">ROI</div>
              <div className="mt-2 text-lg font-semibold text-gray-800">{fmtPctSign(roiPct)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">MOIC</div>
              <div className="mt-2 text-lg font-semibold text-gray-800">
                {toNum(moic) == null ? "—" : `${toNum(moic).toFixed(2)}x`}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">IRR (annualized)</div>
              <div className="mt-2 text-lg font-semibold text-gray-800">
                {irrPct == null ? "—" : fmtPctSign(irrPct)}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Donuts */}
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="flex gap-6 text-sm mb-3 border-b border-gray-200">
            <button
              onClick={() => setTab("portfolio")}
              className={`pb-2 -mb-px ${
                tab === "portfolio" ? "text-sky-700 border-b-2 border-sky-600 font-medium" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Portfolio Allocation
            </button>
            <button
              onClick={() => setTab("industry")}
              className={`pb-2 -mb-px ${
                tab === "industry" ? "text-sky-700 border-b-2 border-sky-600 font-medium" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Industry Allocation
            </button>
            <button
              onClick={() => setTab("top")}
              className={`pb-2 -mb-px ${
                tab === "top" ? "text-sky-700 border-b-2 border-sky-600 font-medium" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Top Performers
            </button>
          </div>

          {/* Removed red "no values" banner in favor of graceful fallback */}

          <div className="text-center text-sm text-gray-600 mb-2">All</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 items-center">
            {/* Initial donut (from month) */}
            <div>
              <Donut data={allocInit.items} title="Initial Value" total={allocInit.total} />
              {fromYM && (
                <div className="text-center text-[11px] text-gray-500 -mt-1">as of {fromYM}</div>
              )}
            </div>

            <div className="hidden sm:flex items-center justify-center text-2xl text-gray-400">→</div>

            {/* Current donut (to month) */}
            <div>
              <Donut data={allocCurr.items} title="Current Value" total={allocCurr.total} />
              {toYM && (
                <div className="text-center text-[11px] text-gray-500 -mt-1">as of {toYM}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Users + Ops (kept) */}
      <UsersPanel />

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white">
        <div className="px-4 pt-3 border-b border-gray-200">
          <div className="flex gap-6">
            {[
              { key: "management", label: "Management" },
              { key: "taxes", label: "Taxes" },
              { key: "funds", label: "Funds" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setOpsTab(key)}
                className={`pb-3 -mb-px text-sm ${
                  opsTab === key ? "text-sky-700 border-b-2 border-sky-600 font-medium" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-0">
          {opsTab === "management" && <ManagementOverview />}
          {opsTab === "taxes" && <TaxesOverview />}
          {opsTab === "funds" && <FundsOverview aumHint={currentValue} />}
        </div>
      </div>
    </div>
  );
}
