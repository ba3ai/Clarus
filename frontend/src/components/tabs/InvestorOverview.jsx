// frontend/src/pages/InvestorOverview.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Sector
} from "recharts";

/* ——— Tiny helper to style just the inner horizontal scrollbars ——— */
const InnerScrollStyles = () => (
  <style>{`
    .inner-x-scroll{overflow-x:auto;overflow-y:hidden;max-width:100%}
    .inner-x-scroll::-webkit-scrollbar{height:10px}
    .inner-x-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:8px}
    .inner-x-scroll::-webkit-scrollbar-track{background:#f1f5f9}
    .btn{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem .9rem;border-radius:.6rem;border:1px solid #cbd5e1;background:#fff}
    .btn:hover{background:#f8fafc}
    .btn-primary{border-color:#0284c7;background:#0ea5e9;color:white}
    .btn-primary:hover{background:#0284c7}
    .btn-muted{border-color:#e2e8f0;background:#f8fafc;color:#334155}
    .select{padding:.5rem .6rem;border:1px solid #cbd5e1;border-radius:.6rem;background:#fff}
    .label{font-size:.85rem;color:#475569}
  `}</style>
);

/* Utils */
const fmtUSD = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) =>
  (n === null || n === undefined || Number.isNaN(Number(n))) ? "—" :
  `${Number(n).toFixed(2)}%`;

const defaultPalette = [
  "#6366F1", "#10B981", "#60A5FA", "#F59E0B", "#EF4444",
  "#8B5CF6", "#14B8A6", "#22C55E", "#3B82F6", "#EAB308",
  "#F97316", "#EC4899", "#06B6D4", "#84CC16"
];

const isYM = (s) => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const toLabel = (ymStr) => {
  const [y, m] = ymStr.split("-").map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString(undefined, { month: "short", year: "numeric" });
};

/* Donut with percent+value tooltip, hover enlarge, and dynamic center value */
function Donut({ title, totalLabel, totalValue, data }) {
  const d = Array.isArray(data) ? data : [];
  const [activeIndex, setActiveIndex] = useState(-1);

  // Value shown in the center: hovered slice value (if any) else total
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
        <div className="text-slate-700">{fmtUSD(p.value)}</div>
      </div>
    );
  };

  // render hovered slice a bit larger
  const renderActive = (props) => {
    const {
      cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill,
    } = props;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}   // enlarge by 8px
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
              outerRadius={105}       /* slightly thinner ring */
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

            {/* Center label — non-interactive so slices receive hover */}
            <foreignObject pointerEvents="none" x="0" y="0" width="100%" height="100%">
              <div className="w-full h-full grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-xs text-slate-500">
                    {totalLabel}
                  </div>
                  <div className="font-bold text-lg">
                    {fmtUSD(displayValue)}
                  </div>
                </div>
              </div>
            </foreignObject>
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend under the chart (optional) */}
      {/* <Legend payload={d.map((item,i)=>({id:item.name,type:"square",value:`${item.name}`,color:item.color||defaultPalette[i%defaultPalette.length]}))}/> */}
    </div>
  );
}

/* KPI */
function KpiCard({ label, value, footnote, accent = "default" }) {
  const accentClass =
    accent === "positive" ? "text-emerald-600" : accent === "muted" ? "text-slate-700" : "text-slate-800";
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accentClass}`}>{value}</div>
      {footnote && <div className="mt-1 text-xs text-slate-500">{footnote}</div>}
    </div>
  );
}

/* Month range filter (Apply / Reset) */
function MonthRangeFilter({ months, pendingFrom, pendingTo, setPendingFrom, setPendingTo, onApply, onReset }) {
  const canApply = useMemo(() => {
    if (!isYM(pendingFrom) || !isYM(pendingTo)) return false;
    const iFrom = months.findIndex((m) => m === pendingFrom);
    const iTo = months.findIndex((m) => m === pendingTo);
    return iFrom !== -1 && iTo !== -1 && iFrom <= iTo;
  }, [months, pendingFrom, pendingTo]);

  const toOptions = useMemo(() => {
    if (!isYM(pendingFrom)) return months;
    const i = months.findIndex((m) => m === pendingFrom);
    return i === -1 ? months : months.slice(i);
  }, [months, pendingFrom]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="label">From</span>
        <select className="select" value={pendingFrom} onChange={(e) => setPendingFrom(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>{toLabel(m)}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="label">to</span>
        <select className="select" value={pendingTo} onChange={(e) => setPendingTo(e.target.value)}>
          {toOptions.map((m) => (
            <option key={m} value={m}>{toLabel(m)}</option>
          ))}
        </select>
      </div>

      <button className="btn btn-primary" disabled={!canApply} onClick={onApply}>Apply</button>
      <button className="btn btn-muted" onClick={onReset}>Reset</button>
    </div>
  );
}

/* Simple month picker used by the Compare Bar section only */
function MonthPicker({ label, value, onChange }) {
  const months = [
    { k: "01", n: "January" }, { k: "02", n: "February" }, { k: "03", n: "March" },
    { k: "04", n: "April" },   { k: "05", n: "May" },      { k: "06", n: "June" },
    { k: "07", n: "July" },    { k: "08", n: "August" },   { k: "09", n: "September" },
    { k: "10", n: "October" }, { k: "11", n: "November" }, { k: "12", n: "December" },
  ];
  const year = isYM(value) ? value.slice(0, 4) : `${new Date().getFullYear()}`;
  const month = isYM(value) ? value.slice(5, 7) : "01";
  const set = (y, m) => { if (/^\d{4}$/.test(y) && /^(0[1-9]|1[0-2])$/.test(m)) onChange(`${y}-${m}`); };
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-slate-600">{label}</span>}
      <select className="px-3 py-2 rounded-lg border border-slate-300 bg-white" value={month} onChange={(e) => set(year, e.target.value)}>
        {months.map((m) => (<option key={m.k} value={m.k}>{m.n}</option>))}
      </select>
      <input
        type="number"
        className="w-28 px-3 py-2 rounded-lg border border-slate-300 bg-white"
        value={year}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
          if (v) set(v, month);
        }}
      />
    </div>
  );
}

/* Tooltip for ROI chart */
function RoiTooltip({ active, payload, label, benchmark }) {
  if (!active || !payload || !payload.length) return null;
  const elop = payload.find(p => p.dataKey === "elopRoi");
  const bench = payload.find(p => p.dataKey === "benchRoi");
  const elopValue = elop ? Number(elop.value || 0).toFixed(2) : "0.00";
  const benchValue = bench ? Number(bench.value || 0).toFixed(2) : "0.00";
  const elopMissing = !!(elop && elop.payload && elop.payload.elopMissing);
  return (
    <div className="bg-white shadow rounded-lg px-3 py-2 border border-slate-200 text-sm">
      <div className="font-medium text-slate-800 mb-1">{label}</div>
      <div className="text-slate-700">
        <div><span className="font-semibold">ELOP ROI</span>: {elopValue}%{elopMissing ? " — missing data" : ""}</div>
        <div><span className="font-semibold">{benchmark} ROI</span>: {benchValue}%</div>
      </div>
    </div>
  );
}

/* ===== Page ===== */
export default function InvestorOverview() {
  const tabs = ["Portfolio Allocation"];
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [investorName, setInvestorName] = useState("");

  // KPI state
  const [initialValue, setInitialValue] = useState(0);
  const [currentValue, setCurrentValue] = useState(0);
  const [roiPct, setRoiPct] = useState(0);
  const [moic, setMoic] = useState(0);
  const [irrPct, setIrrPct] = useState(null);
  const [asOf, setAsOf] = useState("");
  const [timeSpan, setTimeSpan] = useState(null);
  const [kpiError, setKpiError] = useState("");
  const [joinYM, setJoinYM] = useState("");

  // Background market refresh (best-effort)
  useEffect(() => { fetch("/api/market/refresh", { method: "POST" }).catch(() => {}); }, []);

  /* =================== SEPARATE FILTER #1 — Investor KPIs =================== */
  const sheetName = "bCAS (Q4 Adj)";
  const [months, setMonths] = useState([]);
  const [loadingMonths, setLoadingMonths] = useState(true);

  // Load month options
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingMonths(true);
        const res = await fetch(`/api/metrics/periods?sheet=${encodeURIComponent(sheetName)}`);
        const j = await res.json();
        const raw = Array.isArray(j?.periods) ? j.periods : (Array.isArray(j) ? j : []);
        const yms = raw.map((it) => {
          const s = (typeof it === "string") ? it : (it?.as_of_date || it?.date || it?.as_of || "");
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
  }, [sheetName]);

  // Pending + applied range for KPIs
  const [invPendingFrom, setInvPendingFrom] = useState("");
  const [invPendingTo, setInvPendingTo] = useState("");
  const [invFromYM, setInvFromYM] = useState("");
  const [invToYM, setInvToYM] = useState("");

  useEffect(() => {
    if (!months.length) return;
    const start = months[0];
    const end = months[months.length - 1];
    setInvPendingFrom(start);
    setInvPendingTo(end);
    setInvFromYM(start);
    setInvToYM(end);
  }, [months]);

  const applyInvestorRange = useCallback(() => {
    if (!isYM(invPendingFrom) || !isYM(invPendingTo)) return;
    const iFrom = months.findIndex((m) => m === invPendingFrom);
    const iTo = months.findIndex((m) => m === invPendingTo);
    if (iFrom === -1 || iTo === -1 || iFrom > iTo) return;
    setInvFromYM(invPendingFrom);
    setInvToYM(invPendingTo);
  }, [invPendingFrom, invPendingTo, months]);

  const resetInvestorRange = useCallback(() => {
    if (!months.length) return;
    const start = months[0];
    const end = months[months.length - 1];
    setInvPendingFrom(start);
    setInvPendingTo(end);
    setInvFromYM(start);
    setInvToYM(end);
  }, [months]);

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

  // Optional: allow forcing a specific investor
  const investorHint = (() => {
    try {
      const url = new URL(window.location.href);
      const fromQS = url.searchParams.get("investor");
      if (fromQS) {
        localStorage.setItem("investorHint", fromQS);
        return fromQS;
      }
      return localStorage.getItem("investorHint") || "";
    } catch {
      try { return localStorage.getItem("investorHint") || ""; } catch { return ""; }
    }
  })();

  // Fetch KPIs when investor range is applied
  useEffect(() => {
    if (!isYM(invFromYM) || !isYM(invToYM)) return;

    const params = new URLSearchParams({ sheet: sheetName });
    params.set("from", `${invFromYM}-01`);
    params.set("to", `${invToYM}-01`);
    if (investorHint) params.set("investor", investorHint);

    (async () => {
      try {
        setKpiError("");
        const res = await fetch(`/api/metrics/investor-overview?${params.toString()}`, {
          credentials: "include",
          headers: buildHeaders(),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        setInvestorName(j.investor || "");
        setInitialValue(Number(j.initial_value || 0));
        setCurrentValue(Number(j.current_value || 0));
        setMoic(Number(j.moic || 0));
        setRoiPct(Number(j.roi_pct || 0));
        setIrrPct(j.irr_pct !== undefined ? Number(j.irr_pct) : null);
        setAsOf(j.current_date || j.latest_date || "");
        setTimeSpan(j.time_span || null);

        // ----- JOIN DATE (Since ...) -----
        // Prefer explicit join_date; else fall back to the first cash-flow date (time_span.start_date).
        if (j.join_date) {
          const d = new Date(j.join_date);
          if (!Number.isNaN(d.getTime())) {
            setJoinYM(ym(d));
          } else if (j.time_span?.start_date) {
            const s = new Date(j.time_span.start_date);
            if (!Number.isNaN(s.getTime())) setJoinYM(ym(s));
            else if (months.length) setJoinYM(months[0]);
          } else if (months.length) {
            setJoinYM(months[0]);
          }
        } else if (j.time_span?.start_date) {
          const s = new Date(j.time_span.start_date);
          if (!Number.isNaN(s.getTime())) setJoinYM(ym(s));
          else if (months.length) setJoinYM(months[0]);
        } else if (months.length) {
          setJoinYM(months[0]);
        }
        // ---------------------------------
      } catch (e) {
        console.error("Investor overview fetch error:", e);
        setKpiError(e.message || "Investor data not found.");
        setInvestorName("");
        setInitialValue(0);
        setCurrentValue(0);
        setMoic(0);
        setRoiPct(0);
        setIrrPct(null);
        setAsOf("");
        setTimeSpan(null);
        setJoinYM("");
      }
    })();
  }, [invFromYM, invToYM, investorHint]);

  /* =================== Allocation → Investor Slices =================== */
  // Fetch portfolio allocation for the month we're showing (latest in applied range)
  const [alloc, setAlloc] = useState({ as_of: null, total: 0, items: [] });
  const allocMonth = useMemo(() => {
    // prefer KPI "asOf" (YYYY-MM-DD) if present; else the applied "to" month
    if (asOf) return `${String(new Date(asOf).getFullYear())}-${String(new Date(asOf).getMonth()+1).padStart(2,"0")}`;
    return isYM(invToYM) ? invToYM : "";
  }, [asOf, invToYM]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!allocMonth) { setAlloc({ as_of: null, total: 0, items: [] }); return; }
      try {
        const res = await fetch(`/api/metrics/allocation?period_end=${encodeURIComponent(allocMonth)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        if (!cancelled) setAlloc(j);
      } catch (e) {
        console.warn("allocation fetch failed:", e);
        if (!cancelled) setAlloc({ as_of: null, total: 0, items: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [allocMonth]);

  // Scale allocation % by investor's current value (and keep color/name from API)
  const investorSlices = useMemo(() => {
    if (!currentValue || !alloc?.items?.length) return [];
    return alloc.items
      .filter(it => (it.percent || 0) > 0)
      .map((it, idx) => ({
        name: it.name,
        value: Number((currentValue * (it.percent / 100)).toFixed(2)),
        percent: Number(it.percent),
        color: it.color || defaultPalette[idx % defaultPalette.length],
      }))
      .filter(x => x.value > 0);
  }, [alloc, currentValue]);

  /* =================== SEPARATE FILTER #2 — Compare Bar ==================== */
  const BENCHMARKS = ["S&P 500", "Dow", "Nasdaq", "Russell", "VIX", "Gold"];
  const BENCH_SYMBOLS = {
    "S&P 500": "^GSPC", "Dow": "^DJI", "Nasdaq": "^IXIC", "Russell": "^RUT", "VIX": "^VIX", "Gold": "GC=F",
  };
  const [selectedBenchmark, setSelectedBenchmark] = useState(BENCHMARKS[0]);

  const [cmpFromMonth, setCmpFromMonth] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-01`;
  });
  const [cmpToMonth, setCmpToMonth] = useState(() => ym(new Date()));

  const monthToDate = (ymStr) => {
    if (!isYM(ymStr)) return null;
    const [y, m] = ymStr.split("-").map(Number);
    return new Date(y, m - 1, 1);
  };

  // Normalize compare range
  useEffect(() => {
    if (!isYM(cmpFromMonth) || !isYM(cmpToMonth)) return;
    const a = monthToDate(cmpFromMonth);
    const b = monthToDate(cmpToMonth);
    if (!a || !b) return;
    const today = new Date();
    let from = a <= b ? a : b;
    let to = b >= a ? b : a;
    const monthStartToday = new Date(today.getFullYear(), today.getMonth(), 1);
    if (to > monthStartToday) to = monthStartToday;
    const fromStr = ym(from);
    const toStr = ym(to);
    if (fromStr !== cmpFromMonth) setCmpFromMonth(fromStr);
    if (toStr !== cmpToMonth) setCmpToMonth(toStr);
  }, [cmpFromMonth, cmpToMonth]);

  // Build months for compare chart
  const cmpMonths = useMemo(() => {
    if (!isYM(cmpFromMonth) || !isYM(cmpToMonth)) return [];
    const start = monthToDate(cmpFromMonth);
    const end = monthToDate(cmpToMonth);
    if (!start || !end) return [];
    const out = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = ym(cursor);
      const label = cursor.toLocaleString(undefined, { month: "short", year: "numeric" });
      out.push({ key, label });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out.length > 48 ? out.slice(-48) : out;
  }, [cmpFromMonth, cmpToMonth]);

  const [elopMaxKey, setElopMaxKey] = useState(null);
  const cmpMonthsClamped = useMemo(() => {
    if (!elopMaxKey) return cmpMonths;
    const idx = cmpMonths.findIndex(m => m.key === elopMaxKey);
    return idx === -1 ? cmpMonths : cmpMonths.slice(0, idx + 1);
  }, [cmpMonths, elopMaxKey]);

  // ELOP ROI for compare chart
  const [elopRoiSeries, setElopRoiSeries] = useState([]);
  const [elopMissingSeries, setElopMissingSeries] = useState([]);
  const [elopLoading, setElopLoading] = useState(false);
  const [elopError, setElopError] = useState("");

  useEffect(() => {
    if (!isYM(cmpFromMonth) || !isYM(cmpToMonth) || cmpMonths.length === 0) return;
    const from = `${cmpFromMonth}-01`;
    const to   = `${cmpToMonth}-01`;
    setElopLoading(true);
    setElopError("");
    fetch(`/api/portfolio/roi_monthly?sheet=${encodeURIComponent(sheetName)}&start=${from}&end=${to}`)
      .then(r => r.json())
      .then(j => {
        if (!j || j.ok === false) throw new Error(j?.error || "Failed to fetch ELOP ROI");
        const byMonth = {}; const byMissing = {}; let lastKey = null;
        for (const it of (j.rows || [])) {
          const d = new Date(it.date);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          byMonth[key] = Number(it.roi_pct ?? 0);
          byMissing[key] = !!it.missing;
          lastKey = key;
        }
        setElopMaxKey(lastKey || null);
        const series = cmpMonths.map(m => (Number.isFinite(byMonth[m.key]) ? byMonth[m.key] : 0));
        const missing = cmpMonths.map(m => !!byMissing[m.key]);
        setElopRoiSeries(series);
        setElopMissingSeries(missing);
      })
      .catch(err => setElopError(err.message))
      .finally(() => setElopLoading(false));
  }, [cmpFromMonth, cmpToMonth, cmpMonths]);

  // Benchmark ROI for compare chart
  const [benchRoiSeries, setBenchRoiSeries] = useState([]);
  const [benchError, setBenchError] = useState("");
  const [isBenchLoading, setIsBenchLoading] = useState(false);

  useEffect(() => {
    if (!isYM(cmpFromMonth) || !isYM(cmpToMonth) || cmpMonths.length === 0) return;
    const symbol = BENCH_SYMBOLS[selectedBenchmark];
    if (!symbol) return;
    const from = `${cmpFromMonth}-01`;
    const to   = `${cmpToMonth}-01`;
    setIsBenchLoading(true);
    setBenchError("");
    fetch(`/api/market/store_history?symbol=${encodeURIComponent(symbol)}&start=${from}&end=${to}&interval=1mo`, { method: "POST" })
      .then(() => fetch(`/api/market/roi_monthly?symbols=${encodeURIComponent(symbol)}&start=${from}&end=${to}`))
      .then(r => r.json())
      .then(j => {
        const rows = (j?.by_symbol?.[symbol] ?? []);
        const byMonth = {};
        for (const it of rows) {
          const d = new Date(it.date);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          byMonth[key] = Number(it.roi_pct ?? 0);
        }
        const series = cmpMonths.map(m => (Number.isFinite(byMonth[m.key]) ? byMonth[m.key] : 0));
        setBenchRoiSeries(series);
      })
      .catch(err => setBenchError(err.message))
      .finally(() => setIsBenchLoading(false));
  }, [selectedBenchmark, cmpFromMonth, cmpToMonth, cmpMonths]);

  // Compare chart data
  const comparisonData = useMemo(() => {
    return cmpMonthsClamped.map((m) => {
      const i = cmpMonths.findIndex(x => x.key === m.key);
      return {
        name: m.label,
        elopRoi: Number(elopRoiSeries[i] || 0),
        benchRoi: Number(benchRoiSeries[i] || 0),
        elopMissing: !!elopMissingSeries[i],
        predicted: false,
      };
    });
  }, [cmpMonths, cmpMonthsClamped, elopRoiSeries, benchRoiSeries, elopMissingSeries]);

  return (
    <div className="space-y-8">
      {/* Header — shows KPI filter & Joining month */}
      <div className="bg-sky-100 border border-sky-200 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-slate-700 text-sm">
            {investorName ? <>Viewing as <span className="font-semibold">{investorName}</span></> : <>Your portfolio overview</>}
          </div>
          {joinYM && (
            <div className="text-slate-600 text-sm">
              Since <span className="font-semibold">{toLabel(joinYM)}</span>
            </div>
          )}
        </div>

        {/* KPI-specific month→month filter (Apply/Reset) */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-700">Investor data range</div>
          {loadingMonths ? (
            <div className="text-sm text-slate-500">Loading periods…</div>
          ) : months.length ? (
            <MonthRangeFilter
              months={months}
              pendingFrom={invPendingFrom}
              pendingTo={invPendingTo}
              setPendingFrom={setInvPendingFrom}
              setPendingTo={setInvPendingTo}
              onApply={applyInvestorRange}
              onReset={resetInvestorRange}
            />
          ) : (
            <div className="text-sm text-rose-600">No periods available</div>
          )}
        </div>

        {kpiError && (
          <div className="mt-2 text-xs text-rose-600">
            {kpiError} — try setting <code>localStorage.setItem("investorHint","&lt;Investor Name&gt;")</code> or add <code>?investor=&lt;Name&gt;</code> in the URL.
          </div>
        )}
      </div>

      {/* KPIs + donut */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
                <div className="text-center">
                  <div className="text-slate-500 text-sm">Initial value</div>
                  <div className="text-3xl font-bold text-slate-800 mt-1">{fmtUSD(initialValue)}</div>
                </div>
                <div className="hidden sm:flex items-center justify-center">
                  <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
                    <path d="M4 12h36" stroke="#94a3b8" strokeWidth="2" />
                    <path d="M32 6l8 6-8 6" fill="none" stroke="#94a3b8" strokeWidth="2" />
                  </svg>
                </div>
                <div className="text-center">
                  <div className="text-slate-500 text-sm">Current value</div>
                  <div className="text-3xl font-bold text-slate-800 mt-1">{fmtUSD(currentValue)}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KpiCard label="ROI" value={`${roiPct >= 0 ? "+" : ""} ${Number(roiPct).toFixed(2)}%`} accent="positive" />
              <KpiCard label="MOIC" value={`${Number(moic).toFixed(2)}x`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KpiCard
                label="IRR (annualized)"
                value={fmtPct(irrPct)}
                footnote={timeSpan?.years ? `Time span: ${Number(timeSpan.years).toFixed(2)} yrs (${new Date(timeSpan.start_date).toLocaleDateString()} → ${new Date(timeSpan.end_date).toLocaleDateString()})` : undefined}
              />
              <KpiCard label="Distributed" value={fmtUSD(0)} />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="flex items-center gap-6 px-6 pt-4 border-b">
              <button
                onClick={() => setActiveTab("Portfolio Allocation")}
                className="py-3 border-b-2 -mb-px transition border-sky-600 text-sky-700"
              >
                Portfolio Allocation
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 gap-6">
              <Donut
                title=""
                totalLabel="Current Value"
                totalValue={Math.round(currentValue)}
                data={investorSlices}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ==================== Compare Bar — ELOP vs Benchmark ==================== */}
      <div className="bg-white rounded-xl shadow">
        {/* Controls (benchmark + its own month filter) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Compare monthly ROI with</span>
            <select
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white"
              value={selectedBenchmark}
              onChange={(e) => setSelectedBenchmark(e.target.value)}
            >
              {["S&P 500","Dow","Nasdaq","Russell","VIX","Gold"].map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </div>

          {/* Separate range just for the compare chart */}
          <div className="flex items-center gap-4">
            <MonthPicker label="From" value={cmpFromMonth} onChange={setCmpFromMonth} />
            <MonthPicker label="to" value={cmpToMonth} onChange={setCmpToMonth} />
          </div>
        </div>

        {/* Title + status */}
        <div className="px-6 pt-4">
          <div className="text-center font-semibold text-slate-800 text-lg">
            Monthly ROI — ELOP vs {selectedBenchmark}
          </div>
          <div className="text-center text-slate-500 text-xs mb-2">
            {cmpMonthsClamped[0]?.label ?? ""} – {cmpMonthsClamped[cmpMonthsClamped.length - 1]?.label ?? ""}
          </div>
            {/* (Loading / error banners) */}
          {(elopLoading || isBenchLoading) && <div className="text-center text-xs text-slate-500 mb-2">Loading…</div>}
          {elopError && <div className="text-center text-xs text-rose-600 mb-2">{elopError}</div>}
          {benchError && <div className="text-center text-xs text-rose-600 mb-2">{benchError}</div>}
        </div>

        {/* ROI% Chart */}
        <div className="p-6">
          <div className="h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 24, right: 20, left: 8, bottom: 56 }} barCategoryGap={16}>
                <defs>
                  <linearGradient id="elopSolid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B8DEF" />
                    <stop offset="100%" stopColor="#93C5FD" />
                  </linearGradient>
                  <linearGradient id="benchSolid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF9056" />
                    <stop offset="100%" stopColor="#FFC2A6" />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} angle={-45} textAnchor="end" height={70} />
                <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} tick={{ fill: "#475569", fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip content={<RoiTooltip benchmark={selectedBenchmark} />} />

                <Bar dataKey="elopRoi" name="ELOP ROI" radius={[6, 6, 0, 0]} fill="url(#elopSolid)" />
                <Bar dataKey="benchRoi" name={`${selectedBenchmark} ROI`} radius={[6, 6, 0, 0]} fill="url(#benchSolid)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend swatches */}
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <span className="inline-block w-4 h-3 rounded" style={{ background: "linear-gradient(#5B8DEF,#93C5FD)" }} />
              ELOP ROI
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <span className="inline-block w-4 h-3 rounded" style={{ background: "linear-gradient(#FF9056,#FFC2A6)" }} />
              {selectedBenchmark} ROI
            </div>
          </div>
        </div>
      </div>

      <InnerScrollStyles />
    </div>
  );
}
