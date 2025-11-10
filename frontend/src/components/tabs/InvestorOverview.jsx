import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Sector
} from "recharts";

/* ——— Styles (includes buttons + tooltip for “?” help) ——— */
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

    /* Help tooltip */
    .qwrap{position:relative;display:inline-flex;align-items:center}
    .qmark{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;border:1px solid #cbd5e1;color:#64748b;background:#fff;font-weight:700;font-size:.75rem;line-height:1}
    .qtip{position:absolute; bottom:150%; left:0; background:#ffffff; color:#111827; border:1px solid #e5e7eb; border-radius:12px; padding:.6rem .8rem; font-size:.8rem; line-height:1.2; white-space:normal; min-width:160px; max-width:280px; box-shadow:0 10px 24px rgba(2,6,23,.15); opacity:0; pointer-events:none; transform:translateY(0); transition:opacity .16s ease, transform .16s ease; z-index:40}
    .qtip:before{content:""; position:absolute; top:100%; left:13px; border-width:11px 10px 0 10px; border-style:solid; border-color:rgba(2,6,23,.08) transparent transparent transparent}
    .qtip:after{content:""; position:absolute; top:calc(100% - 1px); left:14px; border-width:10px 9px 0 9px; border-style:solid; border-color:#ffffff transparent transparent transparent}
    .qwrap:hover .qtip{opacity:1; transform:translateY(-6px); pointer-events:auto}
  `}</style>
);

/* Utils */
const fmtUSD = (n) => `$${Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtPct = (n) => (n===null||n===undefined||Number.isNaN(Number(n)))?"—":`${Number(n).toFixed(2)}%`;

// Signed displays + tone
const signedPct = (n) => { const num = Number(n||0); if(!Number.isFinite(num)) return "—"; const s = num>0?"+":num<0?"-":""; return `${s} ${Math.abs(num).toFixed(2)}%`; };
const signedX   = (n) => { const num = Number(n||0); const s = num>0?"+":"-"; return `${s} ${Math.abs(num).toFixed(2)}x`; };
const toneFromNumber = (n,{allowMuted}={}) => { if(allowMuted&&(n===null||n===undefined||Number.isNaN(Number(n)))) return "muted"; return Number(n)>0?"positive":Number(n)<0?"negative":"muted"; };

const defaultPalette = ["#6366F1","#10B981","#60A5FA","#F59E0B","#EF4444","#8B5CF6","#14B8A6","#22C55E","#3B82F6","#EAB308","#F97316","#EC4899","#06B6D4","#84CC16"];

const isYM = (s)=> typeof s==="string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const ym   = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const toLabel=(ymStr)=>{ const [y,m]=ymStr.split("-").map(Number); const dt=new Date(y,m-1,1); return dt.toLocaleString(undefined,{month:"short",year:"numeric"}); };

/* —— XSRF helpers —— */
const getCookie = (name) => document.cookie.split("; ").find(r=>r.startsWith(name+"="))?.split("=")[1] ?? "";
const withXsrf = (opts={}) => ({ credentials:"include", headers:{ "X-XSRF-TOKEN":getCookie("XSRF-TOKEN"), ...(opts.headers||{}) }, ...opts });

/* Small inline help icon */
function HelpMark({ text }){ return (<span className="qwrap ml-1"><span className="qmark" aria-label="Help">?</span><span className="qtip">{text}</span></span>); }

/* Donut — with fallback solid ring when there’s no positive data */
function Donut({ title, totalLabel, totalValue, data }) {
  const d = Array.isArray(data) ? data : [];
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasRealData = d.some(it => Number(it?.value) > 0);
  const chartData = hasRealData ? d : [{ name:"Total", value: Math.max(1, Number(totalValue)||1), percent:100, color:"#E2E8F0" }];

  const displayValue = activeIndex>=0 && chartData[activeIndex] ? chartData[activeIndex].value : totalValue;

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

  const renderActive = ({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill }) => (
    <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius+8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
  );

  return (
    <div className="bg-white rounded-xl shadow p-6">
      {title ? <div className="text-center mb-3 text-sm text-slate-500">{title}</div> : null}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip/>} />
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={hasRealData?2:0} isAnimationActive={false}
                 activeIndex={activeIndex} activeShape={renderActive}
                 onMouseEnter={(_,i)=>setActiveIndex(i)} onMouseMove={(_,i)=>setActiveIndex(i)} onMouseLeave={()=>setActiveIndex(-1)}>
              {chartData.map((it,i)=>(<Cell key={i} fill={it.color || defaultPalette[i%defaultPalette.length]} />))}
            </Pie>
            <foreignObject pointerEvents="none" x="0" y="0" width="100%" height="100%">
              <div className="w-full h-full grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-xs text-slate-500">{totalLabel}</div>
                  <div className="font-bold text-lg">{fmtUSD(displayValue)}</div>
                </div>
              </div>
            </foreignObject>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* KPI card (supports help + tone) */
function KpiCard({ label, value, footnote, accent="default", help }){
  const accentClass = accent==="positive"?"text-emerald-600":accent==="negative"?"text-rose-600":accent==="muted"?"text-slate-700":"text-slate-800";
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="text-sm text-slate-500 flex items-center">
        <span>{label}</span>
        {help ? <HelpMark text={help}/> : null}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accentClass}`}>{value}</div>
      {footnote && <div className="mt-1 text-xs text-slate-500">{footnote}</div>}
    </div>
  );
}

/* ========= Reusable MonthRangeFilter (upper look) ========= */
function MonthRangeFilter({ months, pendingFrom, pendingTo, setPendingFrom, setPendingTo, onApply, onReset }){
  const canApply = useMemo(()=>{ if(!isYM(pendingFrom)||!isYM(pendingTo)) return false; const iFrom=months.findIndex(m=>m===pendingFrom); const iTo=months.findIndex(m=>m===pendingTo); return iFrom!==-1 && iTo!==-1 && iFrom<=iTo; },[months,pendingFrom,pendingTo]);
  const toOptions = useMemo(()=>{ if(!isYM(pendingFrom)) return months; const i=months.findIndex(m=>m===pendingFrom); return i===-1?months:months.slice(i); },[months,pendingFrom]);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2"><span className="label">From</span>
        <select className="select" value={pendingFrom} onChange={(e)=>setPendingFrom(e.target.value)}>{months.map(m=>(<option key={m} value={m}>{toLabel(m)}</option>))}</select>
      </div>
      <div className="flex items-center gap-2"><span className="label">to</span>
        <select className="select" value={pendingTo} onChange={(e)=>setPendingTo(e.target.value)}>{toOptions.map(m=>(<option key={m} value={m}>{toLabel(m)}</option>))}</select>
      </div>
      <button className="btn btn-primary" disabled={!canApply} onClick={onApply}>Apply</button>
      <button className="btn btn-muted" onClick={onReset}>Reset</button>
    </div>
  );
}

/* ROI tooltip (bar chart) */
function RoiTooltip({ active, payload, label, benchmark }){
  if(!active||!payload||!payload.length) return null;
  const elop=payload.find(p=>p.dataKey==="elopRoi");
  const bench=payload.find(p=>p.dataKey==="benchRoi");
  const elopValue=elop?Number(elop.value||0).toFixed(2):"0.00";
  const benchValue=bench?Number(bench.value||0).toFixed(2):"0.00";
  const elopMissing=!!(elop&&elop.payload&&elop.payload.elopMissing);
  return (
    <div className="bg-white shadow rounded-lg px-3 py-2 border border-slate-200 text-sm">
      <div className="font-medium text-slate-800 mb-1">{label}</div>
      <div className="text-slate-700">
        <div><span className="font-semibold">ELOP ROI</span>: {elopValue}%{elopMissing?" — missing data":""}</div>
        <div><span className="font-semibold">{benchmark} ROI</span>: {benchValue}%</div>
      </div>
    </div>
  );
}

/* ===== Page ===== */
export default function InvestorOverview(){
  const tabs=["Portfolio Allocation"]; const [activeTab,setActiveTab]=useState(tabs[0]);
  const [investorName,setInvestorName]=useState("");

  // KPIs
  const [initialValue,setInitialValue]=useState(0);
  const [currentValue,setCurrentValue]=useState(0);
  const [roiPct,setRoiPct]=useState(0);
  const [moic,setMoic]=useState(0);
  const [irrPct,setIrrPct]=useState(null);
  const [asOf,setAsOf]=useState("");
  const [timeSpan,setTimeSpan]=useState(null);
  const [kpiError,setKpiError]=useState("");
  const [joinYM,setJoinYM]=useState("");

  // Background market refresh (with XSRF)
  useEffect(()=>{ fetch("/api/market/refresh", withXsrf({ method:"POST" })).catch(()=>{}); },[]);

  /* ===== Investor KPI filter (UPPER) ===== */
  const sheetName="bCAS (Q4 Adj)";
  const [months,setMonths]=useState([]);
  const [loadingMonths,setLoadingMonths]=useState(true);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        setLoadingMonths(true);
        const res=await fetch(`/api/metrics/periods?sheet=${encodeURIComponent(sheetName)}`);
        const j=await res.json();
        const raw=Array.isArray(j?.periods)?j.periods:(Array.isArray(j)?j:[]);
        const yms=raw.map(it=>{ const s=(typeof it==="string")?it:(it?.as_of_date||it?.date||it?.as_of||""); const d=new Date(s); if(Number.isNaN(d.getTime())) return null; return ym(d); }).filter(Boolean);
        const uniq=Array.from(new Set(yms)).sort((a,b)=>a.localeCompare(b));
        if(mounted) setMonths(uniq);
      }catch{ if(mounted) setMonths([]); } finally{ if(mounted) setLoadingMonths(false); }
    })();
    return ()=>{ mounted=false; };
  },[sheetName]);

  const [invPendingFrom,setInvPendingFrom]=useState("");
  const [invPendingTo,setInvPendingTo]=useState("");
  const [invFromYM,setInvFromYM]=useState("");
  const [invToYM,setInvToYM]=useState("");

  useEffect(()=>{ if(!months.length) return; const start=months[0]; const end=months[months.length-1]; setInvPendingFrom(start); setInvPendingTo(end); setInvFromYM(start); setInvToYM(end); },[months]);

  const applyInvestorRange=useCallback(()=>{ if(!isYM(invPendingFrom)||!isYM(invPendingTo)) return; const iFrom=months.findIndex(m=>m===invPendingFrom); const iTo=months.findIndex(m=>m===invPendingTo); if(iFrom===-1||iTo===-1||iFrom>iTo) return; setInvFromYM(invPendingFrom); setInvToYM(invPendingTo); },[invPendingFrom,invPendingTo,months]);
  const resetInvestorRange=useCallback(()=>{ if(!months.length) return; const start=months[0]; const end=months[months.length-1]; setInvPendingFrom(start); setInvPendingTo(end); setInvFromYM(start); setInvToYM(end); },[months]);

  const buildHeaders=()=>{ const headers={}; try{ const raw=localStorage.getItem("accessToken"); if(raw && raw.split(".").length===3){ const payload=JSON.parse(atob(raw.split(".")[1])); const email=payload.email||payload.upn||payload.preferred_username; const name=payload.name; if(email) headers["X-User-Email"]=email; if(name) headers["X-User-Name"]=name; } }catch{} return headers; };

  const investorHint=(()=>{ try{ const url=new URL(window.location.href); const fromQS=url.searchParams.get("investor"); if(fromQS){ localStorage.setItem("investorHint",fromQS); return fromQS; } return localStorage.getItem("investorHint")||""; }catch{ try{ return localStorage.getItem("investorHint")||""; }catch{ return ""; } } })();

  useEffect(()=>{
    if(!isYM(invFromYM)||!isYM(invToYM)) return;
    const params=new URLSearchParams({ sheet:sheetName });
    params.set("from",`${invFromYM}-01`); params.set("to",`${invToYM}-01`);
    if(investorHint) params.set("investor", investorHint);
    (async()=>{
      try{
        setKpiError("");
        const res=await fetch(`/api/metrics/investor-overview?${params.toString()}`, { credentials:"include", headers:buildHeaders() });
        const j=await res.json(); if(!res.ok) throw new Error(j?.error||`HTTP ${res.status}`);
        setInvestorName(j.investor||"");
        setInitialValue(Number(j.initial_value||0));
        setCurrentValue(Number(j.current_value||0));
        setMoic(Number(j.moic||0));
        setRoiPct(Number(j.roi_pct||0));
        setIrrPct(j.irr_pct!==undefined?Number(j.irr_pct):null);
        setAsOf(j.current_date||j.latest_date||"");
        setTimeSpan(j.time_span||null);
        if(j.join_date){ const d=new Date(j.join_date); if(!Number.isNaN(d.getTime())) setJoinYM(ym(d)); else if(j.time_span?.start_date){ const s=new Date(j.time_span.start_date); if(!Number.isNaN(s.getTime())) setJoinYM(ym(s)); else if(months.length) setJoinYM(months[0]); } else if(months.length) setJoinYM(months[0]); }
        else if(j.time_span?.start_date){ const s=new Date(j.time_span.start_date); if(!Number.isNaN(s.getTime())) setJoinYM(ym(s)); else if(months.length) setJoinYM(months[0]); }
        else if(months.length) setJoinYM(months[0]);
      }catch(e){
        console.error("Investor overview fetch error:", e);
        setKpiError(e.message||"Investor data not found.");
        setInvestorName(""); setInitialValue(0); setCurrentValue(0); setMoic(0); setRoiPct(0); setIrrPct(null); setAsOf(""); setTimeSpan(null); setJoinYM("");
      }
    })();
  },[invFromYM,invToYM,investorHint]);

  /* ===== Allocation (scaled by current value) ===== */
  const [alloc,setAlloc]=useState({ as_of:null, total:0, items:[] });
  const allocMonth=useMemo(()=>{ if(asOf) return `${String(new Date(asOf).getFullYear())}-${String(new Date(asOf).getMonth()+1).padStart(2,"0")}`; return isYM(invToYM)?invToYM:""; },[asOf,invToYM]);
  useEffect(()=>{ let cancelled=false; (async()=>{ if(!allocMonth){ setAlloc({as_of:null,total:0,items:[]}); return; } try{ const res=await fetch(`/api/metrics/allocation?period_end=${encodeURIComponent(allocMonth)}`); const j=await res.json(); if(!res.ok) throw new Error(j?.error||`HTTP ${res.status}`); if(!cancelled) setAlloc(j); }catch(e){ console.warn("allocation fetch failed:", e); if(!cancelled) setAlloc({as_of:null,total:0,items:[]}); } })(); return ()=>{ cancelled=true; }; },[allocMonth]);
  const investorSlices=useMemo(()=>{ if(!currentValue||!alloc?.items?.length) return []; return alloc.items.filter(it=>(it.percent||0)>0).map((it,idx)=>({ name:it.name, value:Number((currentValue*(it.percent/100)).toFixed(2)), percent:Number(it.percent), color:it.color||defaultPalette[idx%defaultPalette.length] })).filter(x=>x.value>0); },[alloc,currentValue]);

  /* ===== Compare Bar (LOWER) — filter now matches & syncs with upper ===== */
  const BENCHMARKS=["S&P 500","Dow","Nasdaq","Russell","VIX","Gold"];
  const BENCH_SYMBOLS={ "S&P 500":"^GSPC", "Dow":"^DJI", "Nasdaq":"^IXIC", "Russell":"^RUT", "VIX":"^VIX", "Gold":"GC=F" };
  const [selectedBenchmark,setSelectedBenchmark]=useState(BENCHMARKS[0]);

  // Applied compare range (used for fetching)
  const [cmpFromMonth,setCmpFromMonth]=useState(()=>{ const now=new Date(); return `${now.getFullYear()}-01`; });
  const [cmpToMonth,setCmpToMonth]=useState(()=>ym(new Date()));
  // Pending inputs (controls mirror upper look)
  const [cmpPendingFrom,setCmpPendingFrom]=useState(cmpFromMonth);
  const [cmpPendingTo,setCmpPendingTo]=useState(cmpToMonth);

  // Mirror when the UPPER filter is applied -> update LOWER (pending + applied)
  useEffect(()=>{
    if(isYM(invFromYM)) { setCmpFromMonth(invFromYM); setCmpPendingFrom(invFromYM); }
    if(isYM(invToYM))   { setCmpToMonth(invToYM);   setCmpPendingTo(invToYM);   }
  },[invFromYM,invToYM]);

  // Normalize applied range and keep pending aligned
  const monthToDate=(ymStr)=>{ if(!isYM(ymStr)) return null; const [y,m]=ymStr.split("-").map(Number); return new Date(y,m-1,1); };
  useEffect(()=>{ if(!isYM(cmpFromMonth)||!isYM(cmpToMonth)) return; let a=monthToDate(cmpFromMonth); let b=monthToDate(cmpToMonth); if(!a||!b) return; if(a>b) [a,b]=[b,a]; const today=new Date(); const monthStartToday=new Date(today.getFullYear(),today.getMonth(),1); if(b>monthStartToday) b=monthStartToday; const f=ym(a), t=ym(b); if(f!==cmpFromMonth) setCmpFromMonth(f); if(t!==cmpToMonth) setCmpToMonth(t); setCmpPendingFrom(f); setCmpPendingTo(t); },[cmpFromMonth,cmpToMonth]);

  // Months list for lower filter — reuse the same list when available
  const cmpMonths=useMemo(()=>{ if(months.length) return months; if(isYM(cmpFromMonth)&&isYM(cmpToMonth)){ const out=[]; const cur=new Date(monthToDate(cmpFromMonth)); const end=monthToDate(cmpToMonth); while(cur<=end){ out.push(ym(cur)); cur.setMonth(cur.getMonth()+1);} return out; } return []; },[months,cmpFromMonth,cmpToMonth]);

  const [elopMaxKey,setElopMaxKey]=useState(null);
  const cmpMonthsClamped=useMemo(()=>{ if(!elopMaxKey) return (cmpMonths||[]).map(k=>({key:k,label:toLabel(k)})); const idx=cmpMonths.findIndex(k=>k===elopMaxKey); const list=idx===-1?cmpMonths:cmpMonths.slice(0,idx+1); return list.map(k=>({key:k,label:toLabel(k)})); },[cmpMonths,elopMaxKey]);

  // ELOP series
  const [elopRoiSeries,setElopRoiSeries]=useState([]);
  const [elopMissingSeries,setElopMissingSeries]=useState([]);
  const [elopLoading,setElopLoading]=useState(false);
  const [elopError,setElopError]=useState("");
  useEffect(()=>{ if(!isYM(cmpFromMonth)||!isYM(cmpToMonth)||cmpMonths.length===0) return; const from=`${cmpFromMonth}-01`; const to=`${cmpToMonth}-01`; setElopLoading(true); setElopError(""); fetch(`/api/portfolio/roi_monthly?sheet=${encodeURIComponent(sheetName)}&start=${from}&end=${to}`).then(r=>r.json()).then(j=>{ if(!j||j.ok===false) throw new Error(j?.error||"Failed to fetch ELOP ROI"); const byMonth={}; const byMissing={}; let lastKey=null; for(const it of (j.rows||[])){ const d=new Date(it.date); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; byMonth[key]=Number(it.roi_pct??0); byMissing[key]=!!it.missing; lastKey=key; } setElopMaxKey(lastKey||null); const series=cmpMonths.map(k=>(Number.isFinite(byMonth[k])?byMonth[k]:0)); const missing=cmpMonths.map(k=>!!byMissing[k]); setElopRoiSeries(series); setElopMissingSeries(missing); }).catch(err=>setElopError(err.message)).finally(()=>setElopLoading(false)); },[cmpFromMonth,cmpToMonth,cmpMonths]);

  // Benchmark series (store_history uses XSRF POST)
  const [benchRoiSeries,setBenchRoiSeries]=useState([]);
  const [benchError,setBenchError]=useState("");
  const [isBenchLoading,setIsBenchLoading]=useState(false);
  useEffect(()=>{ if(!isYM(cmpFromMonth)||!isYM(cmpToMonth)||cmpMonths.length===0) return; const symbol=BENCH_SYMBOLS[selectedBenchmark]; if(!symbol) return; const from=`${cmpFromMonth}-01`; const to=`${cmpToMonth}-01`; setIsBenchLoading(true); setBenchError(""); fetch(`/api/market/store_history?symbol=${encodeURIComponent(symbol)}&start=${from}&end=${to}&interval=1mo`, withXsrf({ method:"POST" })) .then(()=>fetch(`/api/market/roi_monthly?symbols=${encodeURIComponent(symbol)}&start=${from}&end=${to}`)) .then(r=>r.json()) .then(j=>{ const rows=(j?.by_symbol?.[symbol]??[]); const byMonth={}; for(const it of rows){ const d=new Date(it.date); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; byMonth[key]=Number(it.roi_pct??0); } const series=cmpMonths.map(k=>(Number.isFinite(byMonth[k])?byMonth[k]:0)); setBenchRoiSeries(series); }) .catch(err=>setBenchError(err.message)) .finally(()=>setIsBenchLoading(false)); },[selectedBenchmark,cmpFromMonth,cmpToMonth,cmpMonths]);

  const comparisonData=useMemo(()=> cmpMonthsClamped.map((m,i)=>({ name:m.label, elopRoi:Number(elopRoiSeries[i]||0), benchRoi:Number(benchRoiSeries[i]||0), elopMissing:false, predicted:false })), [cmpMonthsClamped,elopRoiSeries,benchRoiSeries]);

  // Apply/reset handlers for LOWER filter
  const applyCompareRange=useCallback(()=>{ if(!isYM(cmpPendingFrom)||!isYM(cmpPendingTo)) return; setCmpFromMonth(cmpPendingFrom); setCmpToMonth(cmpPendingTo); },[cmpPendingFrom,cmpPendingTo]);
  const resetCompareRange=useCallback(()=>{ const from=isYM(invFromYM)?invFromYM:cmpFromMonth; const to=isYM(invToYM)?invToYM:cmpToMonth; setCmpPendingFrom(from); setCmpPendingTo(to); setCmpFromMonth(from); setCmpToMonth(to); },[invFromYM,invToYM,cmpFromMonth,cmpToMonth]);

  // KPI strings + tones
  const roiValueStr=signedPct(roiPct); const roiTone=toneFromNumber(roiPct);
  const moicValueStr=signedX(moic);    const moicTone=toneFromNumber(moic);
  const irrTone = irrPct===null||irrPct===undefined?"muted":toneFromNumber(irrPct,{allowMuted:true});
  const irrValueStr = irrPct===null||irrPct===undefined?"—":signedPct(irrPct);

  // ROI Growth (benchmark avg)
  const avgCompanyRoi = useMemo(()=>{ if(!benchRoiSeries.length) return null; let sum=0,n=0; for(const v of benchRoiSeries){ if(Number.isFinite(v)){ sum+=Number(v||0); n++; } } return n===0?null:sum/n; },[benchRoiSeries]);
  const roiGrowthValueStr=signedPct(avgCompanyRoi); const roiGrowthTone=toneFromNumber(avgCompanyRoi,{allowMuted:true});

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-sky-100 border border-sky-200 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-slate-700 text-sm">{investorName?<>Viewing as <span className="font-semibold">{investorName}</span></>:<>Your portfolio overview</>}</div>
          {joinYM && (<div className="text-slate-600 text-sm">Since <span className="font-semibold">{toLabel(joinYM)}</span></div>)}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-700">Investor data range</div>
          {loadingMonths? (<div className="text-sm text-slate-500">Loading periods…</div>) : months.length? (
            <MonthRangeFilter months={months} pendingFrom={invPendingFrom} pendingTo={invPendingTo} setPendingFrom={setInvPendingFrom} setPendingTo={setInvPendingTo} onApply={applyInvestorRange} onReset={resetInvestorRange} />
          ) : (<div className="text-sm text-rose-600">No periods available</div>)}
        </div>
        {kpiError && (<div className="mt-2 text-xs text-rose-600">{kpiError} — try setting <code>localStorage.setItem("investorHint","&lt;Investor Name&gt;")</code> or add <code>?investor=&lt;Name&gt;</code> in the URL.</div>)}
      </div>

      {/* KPIs + Donut */}
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
                  <svg width="48" height="24" viewBox="0 0 48 24" fill="none"><path d="M4 12h36" stroke="#94a3b8" strokeWidth="2" /><path d="M32 6l8 6-8 6" fill="none" stroke="#94a3b8" strokeWidth="2" /></svg>
                </div>
                <div className="text-center">
                  <div className="text-slate-500 text-sm">Current value</div>
                  <div className="text-3xl font-bold text-slate-800 mt-1">{fmtUSD(currentValue)}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KpiCard label="ROI" help="Return on Investment: (Current − Initial) ÷ Initial within the selected range." value={roiValueStr} accent={roiTone} />
              <KpiCard label="MOIC" help="Multiple on Invested Capital: Current Value ÷ Initial Value." value={moicValueStr} accent={moicTone} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KpiCard label="IRR" help="Annualized internal rate of return over the selected time span." value={irrValueStr} accent={irrTone} footnote={timeSpan?.years?`Time span: ${Number(timeSpan.years).toFixed(2)} yrs (${new Date(timeSpan.start_date).toLocaleDateString()} → ${new Date(timeSpan.end_date).toLocaleDateString()})`:undefined} />
              <KpiCard label={`ROI Growth (${selectedBenchmark})`} help={`Average monthly ROI of ${selectedBenchmark} from ${toLabel(cmpFromMonth)} to ${toLabel(cmpToMonth)}.`} value={roiGrowthValueStr} accent={roiGrowthTone} />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="flex items-center gap-6 px-6 pt-4 border-b">
              <button onClick={()=>setActiveTab("Portfolio Allocation")} className="py-3 border-b-2 -mb-px transition border-sky-600 text-sky-700">Portfolio Allocation</button>
            </div>
            <div className="p-6 grid grid-cols-1 gap-6">
              <Donut title="" totalLabel="Current Value" totalValue={Math.round(currentValue)} data={investorSlices} />
            </div>
          </div>
        </div>
      </div>

      {/* Compare Bar with LOWER filter that mirrors the UPPER one */}
      <div className="bg-white rounded-xl shadow">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Compare monthly ROI with</span>
            <select className="px-3 py-2 rounded-lg border border-slate-300 bg-white" value={selectedBenchmark} onChange={(e)=>setSelectedBenchmark(e.target.value)}>
              {BENCHMARKS.map(b=> (<option key={b} value={b}>{b}</option>))}
            </select>
          </div>
          {/* LOWER filter now uses the same MonthRangeFilter UI and is kept in sync */}
          <MonthRangeFilter
            months={cmpMonths}
            pendingFrom={cmpPendingFrom}
            pendingTo={cmpPendingTo}
            setPendingFrom={setCmpPendingFrom}
            setPendingTo={setCmpPendingTo}
            onApply={applyCompareRange}
            onReset={resetCompareRange}
          />
        </div>

        <div className="px-6 pt-4">
          <div className="text-center font-semibold text-slate-800 text-lg">Monthly ROI — ELOP vs {selectedBenchmark}</div>
          <div className="text-center text-slate-500 text-xs mb-2">{cmpMonthsClamped[0]?.label ?? ""} – {cmpMonthsClamped[cmpMonthsClamped.length-1]?.label ?? ""}</div>
          {(elopLoading||isBenchLoading) && <div className="text-center text-xs text-slate-500 mb-2">Loading…</div>}
          {elopError && <div className="text-center text-xs text-rose-600 mb-2">{elopError}</div>}
          {benchError && <div className="text-center text-xs text-rose-600 mb-2">{benchError}</div>}
        </div>

        <div className="p-6">
          <div className="h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top:24, right:20, left:8, bottom:56 }} barCategoryGap={16}>
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
                <XAxis dataKey="name" tick={{ fill:"#475569", fontSize:11 }} angle={-45} textAnchor="end" height={70} />
                <YAxis tickFormatter={(v)=>`${Number(v).toFixed(0)}%`} tick={{ fill:"#475569", fontSize:12 }} domain={["auto","auto"]} />
                <Tooltip content={<RoiTooltip benchmark={selectedBenchmark} />} />
                <Bar dataKey="elopRoi"  name="ELOP ROI"             radius={[6,6,0,0]} fill="url(#elopSolid)" />
                <Bar dataKey="benchRoi" name={`${selectedBenchmark} ROI`} radius={[6,6,0,0]} fill="url(#benchSolid)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-sm text-slate-700"><span className="inline-block w-4 h-3 rounded" style={{background:"linear-gradient(#5B8DEF,#93C5FD)"}} /> ELOP ROI</div>
            <div className="flex items-center gap-2 text-sm text-slate-700"><span className="inline-block w-4 h-3 rounded" style={{background:"linear-gradient(#FF9056,#FFC2A6)"}} /> {selectedBenchmark} ROI</div>
          </div>
        </div>
      </div>

      <InnerScrollStyles />
    </div>
  );
}
