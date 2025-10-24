import React, { useMemo, useState, useRef, useEffect } from "react";

/**
 * ESignatureTab (React + TailwindCSS)
 * ------------------------------------------------------------------
 * Matches the design/UX in your screenshot:
 *  - Tabs with counts: In-progress / Completed / Voided
 *  - Search by anything
 *  - Date sort (toggle asc/desc)
 *  - Export to CSV
 *  - Edit Columns (show/hide)
 *  - Empty state row: "Nothing to display"
 *
 * Usage:
 *  <ESignatureTab documents={docs} />
 *
 * "documents" is an array of objects:
 *  {
 *    id: string|number,
 *    title: string,                  // document name
 *    status: 'In-progress'|'Completed'|'Voided',
 *    date: string|Date               // created/signed date
 *  }
 */

function cx(...xs){return xs.filter(Boolean).join(" ");}
function toISO(d){ if(!d) return ""; const dt = d instanceof Date ? d : new Date(d); return Number.isNaN(dt.getTime())?"":dt.toISOString().slice(0,10); }

function downloadCSV(filename, rows){
  const csv = rows.map(r=>r.map(v=>{const s=v==null?"":String(v);return s.match(/[",\n]/)?`"${s.replace(/"/g,'""')}"`:s;})).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export default function ESignature({ documents = [] }){
  const [tab, setTab] = useState('In-progress');
  const [query, setQuery] = useState('');
  const [dateAsc, setDateAsc] = useState(true);
  const [showCols, setShowCols] = useState(false);
  const [visible, setVisible] = useState({ title:true, status:true, date:true });

  const menuRef = useRef(null);
  useEffect(()=>{ function onClick(e){ if(menuRef.current && !menuRef.current.contains(e.target)) setShowCols(false);} document.addEventListener('mousedown', onClick); return ()=>document.removeEventListener('mousedown', onClick); },[]);

  const counts = useMemo(()=>{
    const c = { 'In-progress':0, 'Completed':0, 'Voided':0 };
    for(const d of documents){ const s=(d.status||'').toString(); if(c[s]!==undefined) c[s]++; }
    return c;
  },[documents]);

  const filtered = useMemo(()=>{
    const q = query.trim().toLowerCase();
    let rows = documents.map(d=>({...d, _date: new Date(d.date)}));
    if (tab !== 'All') rows = rows.filter(d => (d.status||'').toLowerCase() === tab.toLowerCase());
    if (q) rows = rows.filter(d => [d.title, d.status, toISO(d.date)].map(x=>String(x||'').toLowerCase()).some(s=>s.includes(q)));
    rows.sort((a,b)=> (a._date-b._date) * (dateAsc?1:-1));
    return rows;
  },[documents, tab, query, dateAsc]);

  function onExport(){
    const header = [visible.title && 'Documents', visible.status && 'Status', visible.date && 'Date'].filter(Boolean);
    const body = filtered.map(r=>[visible.title && r.title, visible.status && r.status, visible.date && toISO(r.date)].filter(Boolean));
    downloadCSV('esignature_documents.csv', [header,...body]);
  }

  const toggleCol = (k)=> setVisible(v=>({...v, [k]:!v[k]}));

  const tabs = ['In-progress','Completed','Voided'];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-3">
        {tabs.map(t => (
          <button
            key={t}
            onClick={()=>setTab(t)}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
              tab===t ? "border-sky-300 bg-white shadow-sm text-slate-900" : "border-slate-300 bg-white/70 text-slate-600 hover:bg-white"
            )}
          >
            <span>{t}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-xs tabular-nums",
              tab===t?"bg-sky-50 text-sky-700 ring-1 ring-sky-200":"bg-slate-100 text-slate-600")}>{counts[t]||0}</span>
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <input
            type="text"
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
            placeholder="Search by anything"
            className="w-72 max-w-[60%] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />

          <div className="flex items-center gap-2">
            <button onClick={onExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>

            <div className="relative" ref={menuRef}>
              <button onClick={()=>setShowCols(v=>!v)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                Edit columns
              </button>
              {showCols && (
                <div className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                  {Object.keys(visible).map(k => (
                    <label key={k} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <span className="capitalize text-slate-700">{k}</span>
                      <input type="checkbox" className="h-4 w-4" checked={visible[k]} onChange={()=>toggleCol(k)} />
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
                {visible.title && <th className="w-[60%] px-4 py-3">Documents</th>}
                {visible.status && <th className="w-[20%] px-4 py-3">Status</th>}
                {visible.date && (
                  <th className="w-[20%] px-4 py-3">
                    <button onClick={()=>setDateAsc(v=>!v)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700" title="Sort by Date">
                      <span>Date</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{dateAsc? <polyline points="6 15 12 9 18 15"/> : <polyline points="6 9 12 15 18 9"/>}</svg>
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length===0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={3}>Nothing to display</td>
                </tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  {visible.title && <td className="truncate px-4 py-3 font-medium text-slate-800" title={row.title}>{row.title}</td>}
                  {visible.status && (
                    <td className="px-4 py-3">
                      <span className={cx(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        row.status==='Completed' ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                        : row.status==='Voided' ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                        : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      )}>{row.status}</span>
                    </td>
                  )}
                  {visible.date && <td className="px-4 py-3 text-slate-700">{toISO(row.date) || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- Optional demo wrapper (remove in prod) -------------------------------
export const Demo = () => {
  const docs = [
    { id: 1, title: 'Subscription Agreement - Jane Doe', status: 'In-progress', date: '2025-09-10' },
    { id: 2, title: 'Side Letter - Acme LP', status: 'Completed', date: '2025-08-22' },
    { id: 3, title: 'Transfer Form - John Smith', status: 'Voided', date: '2025-07-30' },
  ];
  return (
    <div className="p-6">
      <ESignature documents={docs} />
    </div>
  );
};
