// frontend/src/pages/ExcelSheet.jsx
import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx"; // ⬅️ NEW: for client-side sheet detection

/* -----------------------------------------------------------
   Config
----------------------------------------------------------- */
const API_BASE = import.meta?.env?.VITE_API_BASE || "";
const TABS = [
  { id: "upload", label: "Upload" },
  { id: "sharepoint", label: "SharePoint" },
];
// Backend accepts only Excel types for ingest:
const ACCEPTED = [".xlsx", ".xls", ".xlsm"];
const MAX_FILE_MB = 50;

/* -----------------------------------------------------------
   Utilities
----------------------------------------------------------- */
const clsx = (...xs) => xs.filter(Boolean).join(" ");
const fmt = (ts) => { try { return new Date(ts).toLocaleString(); } catch { return ts; } };
const bytesToMB = (n) => (n / (1024 * 1024)).toFixed(2);

// Extract a friendly filename from a SharePoint sharing URL
const fileNameFromShareUrl = (u) => {
  try {
    const clean = (u || "").split("?")[0];
    const last = clean.split("/").pop() || "";
    return decodeURIComponent(last) || "";
  } catch { return ""; }
};

/* -----------------------------------------------------------
   Page
----------------------------------------------------------- */
export default function ExcelSheet() {
  const [tab, setTab] = useState("upload");

  // MS status (for SharePoint)
  const [msStatus, setMsStatus] = useState({ connected: false, account: "", expires_in: 0 });

  // Upload state
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadHistory, setUploadHistory] = useState([]);
  const inputRef = useRef(null);

  // Worksheet selection
  const [worksheet, setWorksheet] = useState("bCAS (Q4 Adj)");
  const [sheetList, setSheetList] = useState([]); // ⬅️ NEW: all sheet names in the file

  // SharePoint state
  const [spShareUrl, setSpShareUrl] = useState("");
  const [spFileName, setSpFileName] = useState("");     // shows selected/active file
  const [spMeta, setSpMeta] = useState(null);           // preserved (not rendered by buttons)
  const [spPreview, setSpPreview] = useState(null);     // preserved (not rendered by buttons)
  const [spError, setSpError] = useState("");
  const [savedConns, setSavedConns] = useState([]);
  const [spSheetName, setSpSheetName] = useState("bCAS (Q4 Adj)");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [invSyncMsg, setInvSyncMsg] = useState("");
  const [invSyncBusy, setInvSyncBusy] = useState(false);

  /* -------------------------- Init ------------------------- */
  useEffect(() => {
    refreshStatus();
    fetchUploadHistory();
    fetchConnections();
  }, []);

  const refreshStatus = async () => {
    try {
      const r = await fetch(`${API_BASE}/auth/ms/status`, { credentials: "include" });
      const j = await r.json();
      setMsStatus(j);
    } catch {
      setMsStatus({ connected: false });
    }
  };

  /* -----------------------------------------------------------
     Upload: validation & progress upload
  ----------------------------------------------------------- */
  const validateFile = (f) => {
    if (!f) return "Please select a file.";
    const name = (f.name || "").toLowerCase();
    const okType = ACCEPTED.some((ext) => name.endsWith(ext));
    if (!okType) return `Unsupported type. Allowed: ${ACCEPTED.join(", ")}`;
    if (f.size > MAX_FILE_MB * 1024 * 1024) return `Max size ${MAX_FILE_MB} MB exceeded.`;
    return "";
  };

  // ⬅️ NEW: read workbook locally and detect sheet names
  const detectSheetsFromFile = async (f) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const names = wb.SheetNames || [];
      setSheetList(names);
      // Prefer "Master" if present; else keep current; else default to first
      const master = names.find((n) => n.trim().toLowerCase() === "master");
      if (master) {
        setWorksheet(master);
      } else if (!names.includes(worksheet)) {
        setWorksheet(names[0] || worksheet);
      }
    } catch (e) {
      // If parsing fails we silently keep the manual text box value
      console.warn("Failed to parse sheet names:", e);
      setSheetList([]);
    }
  };

  const pickFile = (f) => {
    setErrorMsg("");
    setSuccessMsg("");
    const err = validateFile(f);
    if (err) { setErrorMsg(err); setFile(null); setSheetList([]); return; }
    setFile(f);
    // Auto-detect sheet names for this file
    detectSheetsFromFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  /** Upload → /excel/upload_and_ingest → parse → store → delete → JSON */
  const uploadWithProgress = async () => {
    if (!file) return setErrorMsg("Please select a file first.");
    setBusy(true); setProgress(0); setErrorMsg(""); setSuccessMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (worksheet?.trim()) fd.append("sheet", worksheet.trim());

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/excel/upload_and_ingest`, true);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (evt) => {
          if (!evt.lengthComputable) return;
          const p = Math.round((evt.loaded / evt.total) * 100);
          setProgress(p);
        };

        xhr.onload = () => {
          let j = {};
          try { j = JSON.parse(xhr.responseText || "{}"); } catch {}
          if (xhr.status >= 200 && xhr.status < 300 && j && j.ok) {
            // success text: investor + admin work handled server-side
            setSuccessMsg(
              `Stored ${Array.isArray(j.admin_periods_upserted) ? j.admin_periods_upserted.length : 0} period(s) for “${j.sheet}”.`
            );
            setProgress(100);
            fetchUploadHistory();
            resolve();
          } else {
            const msg = (j && j.error) ? j.error : `Upload failed (HTTP ${xhr.status})`;
            setErrorMsg(msg);
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => {
          const msg = "Network error while uploading.";
          setErrorMsg(msg);
          reject(new Error(msg));
        };

        xhr.send(fd);
      });

      setFile(null);
      setSheetList([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      // errorMsg already set above
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const fetchUploadHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/excel/upload_history`, { credentials: "include" });
      const data = await res.json();
      setUploadHistory(Array.isArray(data) ? data : []);
    } catch {}
  };

  /* -----------------------------------------------------------
     SharePoint helpers
  ----------------------------------------------------------- */
  const connectMicrosoft = () => {
    const back = new URL(window.location.href);
    if (spShareUrl) back.searchParams.set("sp_connect_url", spShareUrl);
    const dest = `${API_BASE}/auth/ms/login?redirect=${encodeURIComponent(back.toString())}`;
    window.location.assign(dest);
  };

  const signOutMicrosoft = async () => {
    await fetch(`${API_BASE}/auth/ms/logout`, { method: "POST", credentials: "include" });
    setMsStatus({ connected: false });
  };

  // (kept for future use) — not rendered by buttons
  const fetchSpMetadataByUrl = async () => {
    setSpError(""); setSpMeta(null);
    const r = await fetch(`${API_BASE}/api/sharepoint/excel/metadata_by_url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url: spShareUrl }),
    });
    const j = await r.json();
    if (!j.ok) return setSpError(j.error || "Failed");
    setSpMeta(j);
  };

  const fetchSpPreviewByUrl = async () => {
    setSpError(""); setSpPreview(null);
    const body = { url: spShareUrl, mode: "range", worksheet: "Summary", address: "A1:F200", first_row_headers: true };
    const r = await fetch(`${API_BASE}/api/sharepoint/excel/preview_by_url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) return setSpError(j.error || "Failed");
    setSpPreview(j);
  };

  const fetchConnections = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/sharepoint/excel/connections?include_shared=1`, { credentials: "include" });
      const j = await r.json();
      if (j.ok) setSavedConns(j.connections || []);
    } catch {}
  };

  const connectByUrl = async () => {
    const url = (spShareUrl || "").trim();
    if (!url) return setSpError("Paste a SharePoint file URL first.");
    const r = await fetch(`${API_BASE}/api/sharepoint/excel/connect_by_url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url }),
    });
    const j = await r.json();
    if (!j.ok) return setSpError(j.error || "Failed to connect");
    setSavedConns(j.connections || []);
    setSpFileName(fileNameFromShareUrl(url)); // show friendly name after connect
    setSpShareUrl("");
  };

  const deleteConnection = async (id) => {
    const r = await fetch(`${API_BASE}/api/sharepoint/excel/connections/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = await r.json();
    if (j.ok) setSavedConns(j.connections || []);
    if (savedConns.find((c) => String(c.id) === String(id))?.url === spShareUrl) {
      setSpShareUrl(""); setSpFileName("");
    }
  };

  const handleSyncToDB = async () => {
    setSyncMsg(""); setSpError("");
    const sheet = (spSheetName || "").trim();
    if (!sheet) return setSpError("Enter a worksheet name.");
    try {
      setSyncBusy(true);
      const r = await fetch(`${API_BASE}/api/metrics/sync/auto-now`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ sheets: [sheet] }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setSpError(j.error || "Sync failed"); setSyncMsg(""); return; }
      const total = (j.results || []).reduce((n, x) => n + (x.count ?? x.upserted ?? 0), 0);
      setSyncMsg(`Synced ✓  Stored ${total} period(s) for '${sheet}'.`);
    } catch (e) { setSpError(String(e)); } finally { setSyncBusy(false); }
  };

  const handleGlobalAutoSync = async () => {
    setSyncMsg(""); setSpError("");
    try {
      setSyncBusy(true);
      const r = await fetch(`${API_BASE}/api/metrics/sync/auto-now`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setSpError(j.error || "Auto-sync failed"); setSyncMsg(""); return; }
      setSyncMsg("Auto-sync started ✓  Check logs/results panel for details.");
    } catch (e) { setSpError(String(e)); } finally { setSyncBusy(false); }
  };

  const handleInvestorSync = async () => {
    setInvSyncMsg(""); setSpError("");
    const sheet = (spSheetName || "").trim();
    if (!sheet) return setSpError("Enter a worksheet name.");
    try {
      setInvSyncBusy(true);
      const r = await fetch(`${API_BASE}/api/investors/sync`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ sheet }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setSpError(j.error || "Investor sync failed"); setInvSyncMsg(""); return; }
      setInvSyncMsg(`Investor snapshot stored ✓  rows=${j.rows}, as_of=${j.as_of}`);
      try { window.dispatchEvent(new CustomEvent("snapshot:updated", { detail: j })); } catch {}
    } catch (e) { setSpError(String(e)); } finally { setInvSyncBusy(false); }
  };

  /* -----------------------------------------------------------
     Render
  ----------------------------------------------------------- */
  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Excel & Sheets Hub</h2>
        <button
          onClick={() => { refreshStatus(); fetchUploadHistory(); fetchConnections(); }}
          className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "px-4 py-2 rounded-lg border text-sm",
              tab === t.id
                ? "bg-indigo-600 border-indigo-600 text-white shadow"
                : "bg-white border-slate-300 hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ========================== Upload Tab ========================== */}
      {tab === "upload" && (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div className="absolute inset-x-0 -top-24 h-48 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 opacity-10 pointer-events-none" />
          <div className="p-6 md:p-8 space-y-6 bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white grid place-items-center shadow">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 16V7m0 0l-3 3m3-3l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M7 17a5 5 0 010-10 6.5 6.5 0 0112.3 1.9A4.5 4.5 0 0120 17H7z" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">Upload Excel</div>
                <div className="text-sm text-slate-600">
                  Drag & drop or choose a file. We support Excel (.xlsx/.xls/.xlsm) up to {MAX_FILE_MB} MB.
                </div>
              </div>
            </div>

            {/* Worksheet select — auto-filled from the uploaded file */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Worksheet</label>
              {sheetList.length > 0 ? (
                <div className="flex items-center gap-2">
                  <select
                    className="border border-slate-300 rounded-lg px-3 py-2 w-72"
                    value={worksheet}
                    onChange={(e) => setWorksheet(e.target.value)}
                  >
                    {sheetList.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <div className="hidden md:flex gap-1 flex-wrap max-w-[420px]">
                    {sheetList.slice(0, 6).map((n) => (
                      <button
                        key={n}
                        onClick={() => setWorksheet(n)}
                        className={clsx(
                          "px-2 py-1 rounded border text-xs",
                          n === worksheet ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300 hover:bg-slate-50"
                        )}
                        title={`Use sheet: ${n}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <input
                  className="border border-slate-300 rounded-lg px-3 py-2 w-72"
                  value={worksheet}
                  onChange={(e) => setWorksheet(e.target.value)}
                  placeholder="Master"
                />
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={clsx(
                "rounded-xl border-2 border-dashed p-6 md:p-10 text-center transition",
                dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50"
              )}
            >
              <div className="space-y-3">
                <div className="text-slate-700">
                  {file ? <span className="font-medium">{file.name}</span> : (<><span className="font-medium">Drop your file here</span><span className="text-slate-500"> or </span></>)}
                </div>

                {!file && (
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 shadow"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    Choose file
                  </button>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED.join(",")}
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] || null)}
                  disabled={busy}
                />

                {file && (
                  <div className="mx-auto max-w-lg bg-white border border-slate-200 rounded-lg p-3 text-left shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium text-slate-900 truncate">{file.name}</div>
                        <div className="text-slate-500">{bytesToMB(file.size)} MB</div>
                      </div>
                      <button
                        className="text-slate-600 hover:text-rose-600"
                        onClick={() => { setFile(null); setErrorMsg(""); setSuccessMsg(""); inputRef.current && (inputRef.current.value = ""); setSheetList([]); }}
                        disabled={busy}
                        title="Remove"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </button>
                    </div>

                    {busy && (
                      <div className="mt-3">
                        <div className="w-full h-2 bg-slate-200 rounded">
                          <div className="h-2 rounded bg-gradient-to-r from-indigo-500 to-sky-500 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{progress}%</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-slate-500">
                Allowed types: <span className="font-medium">{ACCEPTED.join(", ")}</span> • Max size: <span className="font-medium">{MAX_FILE_MB} MB</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                  disabled={busy}
                >
                  Choose another
                </button>
                <button
                  onClick={uploadWithProgress}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow disabled:opacity-60"
                  disabled={!file || busy}
                >
                  {busy ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>

            {successMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M4.93 19.07l14.14-14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="mt-4">
              <div className="text-sm font-semibold text-slate-900 mb-2">Recent uploads</div>
              {uploadHistory?.length ? (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
                  {uploadHistory.map((u, i) => (
                    <li key={i} className="flex items-center justify-between px-3 py-2 bg-white hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm text-slate-800">{u.filename}</div>
                        <div className="text-xs text-slate-500">{fmt(u.uploaded_at)}</div>
                      </div>
                      {u.size && <div className="text-xs text-slate-500">{bytesToMB(u.size)} MB</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-500">No uploads yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================== SharePoint Tab ======================== */}
      {tab === "sharepoint" && (
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          {/* Microsoft status */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <div className="text-sm">
              <span className={clsx(
                "text-xs px-2 py-1 rounded mr-3",
                msStatus.connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
              )}>
                {msStatus.connected ? `Connected — ${msStatus.account || ""}` : "Not connected"}
              </span>
              {msStatus.connected && !!msStatus.expires_in && (
                <span className="text-slate-500">
                  token expires in ~{Math.max(0, Math.floor(msStatus.expires_in / 60))}m
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!msStatus.connected ? (
                <button onClick={connectMicrosoft} className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                  Connect Microsoft
                </button>
              ) : (
                <button onClick={signOutMicrosoft} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                  Sign out
                </button>
              )}
            </div>
          </div>

          {/* Selected/active file indicator (if any) */}
          {spFileName && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white grid place-items-center shadow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </div>
                <div className="truncate">
                  <div className="text-sm font-medium text-slate-900 truncate">{spFileName}</div>
                  <div className="text-xs text-slate-500">Selected SharePoint workbook</div>
                </div>
              </div>
              <button
                onClick={() => { setSpShareUrl(""); setSpFileName(""); }}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          )}

          {/* Add a new connection by URL */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <label className="text-sm font-medium text-slate-800">Add SharePoint workbook</label>
            <div className="flex gap-2">
              <input
                className="border border-slate-300 p-2 rounded-lg w-full"
                placeholder="https://tenant.sharepoint.com/:x:/r/sites/.../file.xlsx?..."
                value={spShareUrl}
                onChange={(e) => setSpShareUrl(e.target.value)}
              />
              <button
                onClick={connectByUrl}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 10-7.07-7.07L10 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                Connect
              </button>
            </div>
            <div className="text-xs text-slate-500">
              You can save multiple files. Use a card below to select which one to work with.
            </div>
          </div>

          {/* Worksheet + Sync (uses the currently selected file on the server) */}
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">Worksheet Name</label>
                <input
                  className="border border-slate-300 p-2 rounded-lg w-full"
                  placeholder="bCAS (Q4 Adj)"
                  value={spSheetName}
                  onChange={(e) => setSpSheetName(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                  <button disabled={syncBusy} onClick={handleSyncToDB}
                          className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                    {syncBusy ? "Syncing…" : "Sync to DB"}
                  </button>
                  <button disabled={syncBusy} onClick={handleGlobalAutoSync}
                          className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-black disabled:opacity-60">
                    {syncBusy ? "Running…" : "Run Global Auto-Sync"}
                  </button>
                  <button disabled={invSyncBusy} onClick={handleInvestorSync}
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                    {invSyncBusy ? "Syncing investors…" : "Investor Sync"}
                  </button>
                </div>
                {syncMsg && <div className="text-emerald-700 text-sm">{syncMsg}</div>}
                {invSyncMsg && <div className="text-emerald-700 text-sm">{invSyncMsg}</div>}
                {spError && <div className="text-rose-600 text-sm">{spError}</div>}
              </div>
              <div className="text-xs text-slate-600">
                The “Sync to DB” button reads month columns for the selected worksheet and stores totals into
                <span className="font-mono"> portfolio_period_metrics</span>.
              </div>
            </div>
          </div>

          {/* GRID of saved connections */}
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="font-medium mb-3">Your SharePoint connections</div>

            {savedConns?.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedConns.map((c) => {
                  const fname = fileNameFromShareUrl(c.url);
                  const isActive = spFileName && fname === spFileName;
                  return (
                    <div key={c.id} className={clsx(
                      "rounded-xl border p-4 bg-white shadow-sm",
                      isActive ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"
                    )}>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white grid place-items-center shrink-0">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M7 3h7l4 4v14H7V3z" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{fname || "(file)"}</div>
                          <div className="text-xs text-slate-500 truncate">drive: <span className="font-mono">{c.drive_id}</span></div>
                          <div className="text-xs text-slate-500 truncate">item: <span className="font-mono">{c.item_id}</span></div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => { setSpShareUrl(c.url); setSpFileName(fname); }}
                          className={clsx(
                            "px-3 py-1.5 rounded-lg text-sm",
                            isActive ? "bg-indigo-600 text-white" : "bg-slate-900 text-white hover:bg-black"
                          )}
                          title="Select this workbook"
                        >
                          {isActive ? "Selected" : "Use"}
                        </button>
                        <button
                          onClick={() => deleteConnection(c.id)}
                          className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white hover:bg-slate-50 text-rose-600"
                          title="Remove connection"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">No connections yet. Add one above.</div>
            )}
          </div>

          {/* (Optional) preserved metadata/preview blocks for future toggle */}
          {spMeta && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-3">
                <div className="font-medium mb-2">Worksheets</div>
                {spMeta.worksheets?.length ? (
                  <ul className="text-sm space-y-1">{spMeta.worksheets.map((w) => <li key={w.id}>{w.name}</li>)}</ul>
                ) : (
                  <div className="text-slate-500 text-sm">None</div>
                )}
              </div>
              <div className="border border-slate-200 rounded-xl p-3">
                <div className="font-medium mb-2">Tables</div>
                {spMeta.tables?.length ? (
                  <ul className="text-sm space-y-1">{spMeta.tables.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
                ) : (
                  <div className="text-slate-500 text-sm">None</div>
                )}
              </div>
            </div>
          )}

          {spPreview && (
            <div className="overflow-auto border border-slate-200 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>{spPreview.columns.map((c) => <th key={c} className="px-2 py-1 text-left border-b">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {spPreview.rows.map((row, i) => (
                    <tr key={i} className="odd:bg-white even:bg-slate-50">
                      {spPreview.columns.map((c) => <td key={c} className="px-2 py-1 border-b">{row[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {spPreview.truncated && (
                <div className="p-2 text-xs text-slate-500">Showing first {spPreview.rows.length} rows (truncated).</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
