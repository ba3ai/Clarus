// src/components/Statements.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

function cx(...xs) { return xs.filter(Boolean).join(" "); }
function toCurrency(n) {
  if (n == null || Number.isNaN(n)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n); }
  catch { return Number(n).toLocaleString(); }
}
function toPct(n, digits = 4) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(digits)}%`;
}
function toISODate(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => {
    const s = v == null ? "" : String(v);
    return (s.includes(",") || s.includes("\n") || s.includes("\"")) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Statements({ profiles = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Controls
  const [profileFilter, setProfileFilter] = useState("All profiles");
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");
  const [dueAsc, setDueAsc] = useState(true);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  // Drawer/detail state
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  // Quarter controls (default to current)
  const today = new Date();
  const defaultYear = today.getFullYear();
  const defaultQuarter = Math.floor(today.getMonth() / 3) + 1;
  const [year, setYear] = useState(defaultYear);
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [entityName, setEntityName] = useState("Elpis Opportunity Fund LP");
  const [genBusy, setGenBusy] = useState(false);

  // Visible columns
  const [visible, setVisible] = useState({
    name:      true,
    investor:  true,
    entity:    true,
    dueDate:   true,
    status:    true,
    amountDue: true,
    paidDate:  true,
    download:  true,
    view:      true,
  });

  const menuRef = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowColumnsMenu(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function fetchRows() {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/statements");
      if (!res.ok) throw new Error(`GET /api/statements -> ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.map(r => ({ ...r, _due: new Date(r.dueDate) }));

    if (profileFilter && profileFilter !== "All profiles" && profileFilter !== "Filter by all profiles") {
      out = out.filter(r => (r.profile || r.entity || "").toLowerCase().includes(profileFilter.toLowerCase()));
    }
    if (tab === "Outstanding") out = out.filter(r => String(r.status).toLowerCase() === "outstanding");
    if (tab === "Paid") out = out.filter(r => String(r.status).toLowerCase() === "paid");

    if (q) {
      out = out.filter(r =>
        [r.name, r.investor, r.entity, r.status, toISODate(r.dueDate), toISODate(r.paidDate), r.amountDue]
          .map(x => (x == null ? "" : String(x))).some(s => s.toLowerCase().includes(q))
      );
    }
    out.sort((a,b) => (a._due - b._due) * (dueAsc ? 1 : -1));
    return out;
  }, [rows, profileFilter, tab, query, dueAsc]);

  function onExport() {
    const header = [
      visible.name && "Name",
      visible.investor && "Investor",
      visible.entity && "Entity",
      visible.dueDate && "Due Date",
      visible.status && "Status",
      visible.amountDue && "Amount Due",
      visible.paidDate && "Paid Date",
    ].filter(Boolean);
    const body = filtered.map(r => [
      visible.name && r.name,
      visible.investor && r.investor,
      visible.entity && r.entity,
      visible.dueDate && toISODate(r.dueDate),
      visible.status && r.status,
      visible.amountDue && r.amountDue,
      visible.paidDate && toISODate(r.paidDate),
    ].filter(Boolean));
    downloadCSV("statements.csv", [header, ...body]);
  }

  const colToggle = (key) => setVisible(v => ({ ...v, [key]: !v[key] }));

  async function onGenerateQuarter() {
    setGenBusy(true); setErr("");
    try {
      const res = await fetch("/api/statements/generate-quarter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), quarter: Number(quarter), entity_name: entityName }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`POST /api/statements/generate-quarter -> ${res.status}: ${t}`);
      }
      await fetchRows();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setGenBusy(false);
    }
  }

  async function openDetail(id) {
    setDetailId(id);
    setDetail(null);
    setDetailErr("");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/statements/${id}`, {
        headers: { Accept: "application/json" },
      });

      // If server returns non-2xx, capture the text (often HTML error page) for diagnostics
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`GET /api/statements/${id} -> ${res.status}\n${txt.slice(0, 400)}`);
      }

      // Must be JSON; otherwise the preview would fail (e.g., server sent HTML/PDF)
      const ct = res.headers.get("content-type") || "";
      if (!ct.toLowerCase().includes("application/json")) {
        const txt = await res.text();
        throw new Error(
          `Server did not return JSON (content-type: ${ct || "unknown"}).\n` +
          `First 400 chars of response:\n${txt.slice(0, 400)}`
        );
      }

      const data = await res.json();
      setDetail(data);
    } catch (e) {
      setDetailErr(String(e.message || e));
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setDetailErr("");
  }

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Profiles filter */}
        <div className="relative">
          <select
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
          >
            <option>Filter by all profiles</option>
            {(profiles.length ? profiles : ["All profiles"]).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          {(["All", "Outstanding", "Paid"]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                "h-10 rounded-xl border px-5 text-sm font-medium transition",
                tab === t ? "border-sky-300 bg-white shadow-sm text-slate-900" : "border-slate-300 bg-white/70 text-slate-600 hover:bg-white"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Quarter generator */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="number"
            className="h-10 w-24 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min="2000"
            max="2100"
            title="Year"
          />
          <select
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            title="Quarter"
          >
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>
          <input
            type="text"
            className="h-10 w-64 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Entity name"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
          />
          <button
            onClick={onGenerateQuarter}
            disabled={genBusy}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm",
              genBusy ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-sky-600 text-white hover:bg-sky-700"
            )}
            title="Generate statements (PDFs) for the selected quarter"
          >
            {genBusy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.2"/><path d="M4 12a8 8 0 0 1 8-8" fill="none" stroke="currentColor" strokeWidth="4"/></svg>
                Generating…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Generate PDFs
              </>
            )}
          </button>

          <button
            onClick={fetchRows}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Search + actions */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by anything"
            className="w-72 max-w-[60%] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Export visible rows to CSV"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowColumnsMenu(v => !v)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Show / hide columns"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                Edit columns
              </button>

              {showColumnsMenu && (
                <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                  {Object.keys(visible).map(key => (
                    <label key={key} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <span className="capitalize text-slate-700">
                        {key === "dueDate" ? "Due Date"
                          : key === "paidDate" ? "Paid Date"
                          : key.charAt(0).toUpperCase() + key.slice(1)}
                      </span>
                      <input type="checkbox" className="h-4 w-4" checked={visible[key]} onChange={() => colToggle(key)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {visible.name && <th className="w-[17%] px-4 py-3">Name</th>}
                {visible.investor && <th className="w-[17%] px-4 py-3">Investor</th>}
                {visible.entity && <th className="w-[17%] px-4 py-3">Entity</th>}
                {visible.dueDate && (
                  <th className="w-[12%] px-4 py-3">
                    <button
                      onClick={() => setDueAsc(v => !v)}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                      title="Sort by Due Date"
                    >
                      <span>Due Date</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {dueAsc ? (<polyline points="6 15 12 9 18 15" />) : (<polyline points="6 9 12 15 18 9" />)}
                      </svg>
                    </button>
                  </th>
                )}
                {visible.status && <th className="w-[10%] px-4 py-3">Status</th>}
                {visible.amountDue && <th className="w-[10%] px-4 py-3">Amount Due</th>}
                {visible.paidDate && <th className="w-[10%] px-4 py-3">Paid Date</th>}
                {visible.download && <th className="w-[7%] px-4 py-3">PDF</th>}
                {visible.view && <th className="w-[7%] px-4 py-3">View</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={9}>Loading…</td></tr>}
              {!!err && !loading && <tr><td className="px-4 py-10 text-center text-rose-600" colSpan={9}>{err}</td></tr>}
              {!loading && !err && filtered.length === 0 && <tr><td className="px-4 py-12 text-center text-slate-500" colSpan={9}>Nothing to display</td></tr>}

              {filtered.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  {visible.name && <td className="truncate px-4 py-3 font-medium text-slate-800" title={row.name}>{row.name}</td>}
                  {visible.investor && <td className="truncate px-4 py-3 text-slate-700" title={row.investor}>{row.investor}</td>}
                  {visible.entity && <td className="truncate px-4 py-3 text-slate-700" title={row.entity}>{row.entity}</td>}
                  {visible.dueDate && <td className="px-4 py-3 text-slate-700">{toISODate(row.dueDate) || "—"}</td>}
                  {visible.status && (
                    <td className="px-4 py-3">
                      <span className={cx(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        String(row.status).toLowerCase() === "paid"
                          ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      )}>
                        {row.status}
                      </span>
                    </td>
                  )}
                  {visible.amountDue && <td className="px-4 py-3 tabular-nums text-slate-800">{toCurrency(row.amountDue)}</td>}
                  {visible.paidDate && <td className="px-4 py-3 text-slate-700">{toISODate(row.paidDate) || "—"}</td>}

                  {visible.download && (
                    <td className="px-4 py-3">
                      {row.pdfAvailable ? (
                        <a
                          href={`/api/statements/${row.id}/pdf`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  )}

                  {visible.view && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(row.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        title="View statement values"
                      >
                        View
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right drawer for Statement detail */}
      {detailId !== null && (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/20" onClick={closeDetail} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[720px] overflow-y-auto rounded-l-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-sm text-slate-500">
                  {detail?.entity} &middot; {detail?.investor}
                </div>
                <div className="text-base font-semibold text-slate-900">
                  Statement {detail?.period?.start} – {detail?.period?.end}
                </div>
              </div>
              <button
                onClick={closeDetail}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              {detailLoading && <div className="py-10 text-center text-slate-500">Loading…</div>}
              {!!detailErr && (
                <div className="py-10 text-center text-rose-600 whitespace-pre-wrap">
                  {detailErr}
                </div>
              )}

              {!detailLoading && detail && !detailErr && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Current Period */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 text-center text-sm font-semibold text-slate-700">Current Period</div>
                    <div className="mb-4 text-center text-xs text-slate-500">
                      ({detail.period.start} – {detail.period.end})
                    </div>
                    <StatementValuesTable block={detail.current} />
                  </div>

                  {/* YTD */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 text-center text-sm font-semibold text-slate-700">Year-to-Date</div>
                    <div className="mb-4 text-center text-xs text-slate-500">
                      ({new Date(detail.period.end).getFullYear()}-01-01 – {detail.period.end})
                    </div>
                    <YtdValuesTable block={detail.ytd} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small sub-tables ---------- */

function Row({ label, value, fmt = "money" }) {
  const out = fmt === "pct" ? toPct(value, 4) : toCurrency(value);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5 text-sm">
      <div className="text-slate-600">{label}</div>
      <div className={cx(
        "tabular-nums font-medium",
        fmt === "pct" ? "text-slate-800" : "text-slate-900"
      )}>{out}</div>
    </div>
  );
}

function StatementValuesTable({ block }) {
  return (
    <div>
      <Row label="Beginning balance" value={block.beginning_balance} />
      <div className="my-1 h-px bg-slate-200" />
      <Row label="Contributions" value={block.contributions} />
      <Row label="Distributions" value={block.distributions} />
      <div className="my-1 h-px bg-slate-200" />
      <Row label="Unrealized gain/(loss)" value={block.unrealized_gl} />
      <Row label="Incentive fees" value={block.incentive_fees} />
      <Row label="Management fees" value={block.management_fees} />
      <Row label="Operating expenses" value={block.operating_expenses} />
      <Row label="Adjustment" value={block.adjustment} />
      <div className="my-1 h-px bg-slate-200" />
      <Row label="Total net income/(loss)" value={block.net_income_loss} />
      <div className="my-1 h-px bg-slate-200" />
      <Row label="Ending balance" value={block.ending_balance} />
      <Row label="Percent (ownership)" value={block.ownership_percent} fmt="pct" />
      <Row label="ROI" value={block.roi_pct} fmt="pct" />
    </div>
  );
}

function YtdValuesTable({ block }) {
  return (
    <div>
      <Row label="Beginning balance" value={block.beginning_balance} />
      <div className="my-1 h-px bg-slate-200" />
      <Row label="Unrealized gain/(loss)" value={block.unrealized_gl} />
      <Row label="Management fees" value={block.management_fees} />
      <div className="my-1 h-px bg-slate-200" />
      <Row label="Ending balance" value={block.ending_balance} />
      <Row label="ROI" value={block.roi_pct} fmt="pct" />
    </div>
  );
}
