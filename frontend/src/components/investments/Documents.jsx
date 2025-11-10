import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";

// Shared documents only ("My Files" removed)
const API_DOCS = "/api/documents";

/* ---- Helpers ---- */
function cx(...xs){return xs.filter(Boolean).join(" "); }
function toISO(d){ if(!d) return ""; const dt=d instanceof Date?d:new Date(d); return Number.isNaN(dt.getTime())? "" : dt.toLocaleDateString(); }
function ext(name=""){ const m=String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:""; }
const IMG_EXT = new Set(["png","jpg","jpeg","gif","webp","bmp","svg"]);
const TXT_EXT = new Set(["txt","csv","log","json","md","ts","js","py","xml","yaml","yml"]);
const isImageName = (n)=> IMG_EXT.has(ext(n));
const isPDFName   = (n)=> ext(n) === "pdf";
const isTextName  = (n)=> TXT_EXT.has(ext(n));

/* ---------- Portal menu ---------- */
function PortalMenu({ anchorRect, onClose, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  useEffect(() => {
    function place(){
      const mr = menuRef.current?.getBoundingClientRect?.();
      const vw = window.innerWidth, vh = window.innerHeight; const pad = 8;
      let left = anchorRect.left; let top = anchorRect.bottom + 6;
      const mw = mr?.width || 220, mh = mr?.height || 240;
      if (left + mw + pad > vw) left = Math.max(pad, vw - mw - pad);
      if (top + mh + pad > vh) top = Math.max(pad, anchorRect.top - mh - 6);
      setPos({ top, left });
    }
    place();
    const h = () => onClose();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("mousedown", h);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("mousedown", h);
    };
  }, [anchorRect, onClose]);
  return ReactDOM.createPortal(
    <div ref={menuRef} style={{ position:"fixed", top:pos.top, left:pos.left, zIndex:10000 }} className="w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl" onMouseDown={(e)=>e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
}

/* ---------- Preview Modal ---------- */
function PreviewModal({ open, onClose, file, fetchBlob, onDownload }) {
  const [url, setUrl] = useState(null);
  const [mime, setMime] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false; let createdUrl = null;
    (async () => {
      try{ setLoading(true); setErr("");
        const blob = await fetchBlob(file); if (cancelled) return;
        setMime(blob?.type || ""); createdUrl = URL.createObjectURL(blob); setUrl(createdUrl);
      }catch(e){ if (!cancelled) setErr(String(e?.message || e)); }
      finally{ if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; if (createdUrl) URL.revokeObjectURL(createdUrl); setUrl(null); };
  }, [open, file, fetchBlob]);

  useEffect(() => {
    function onKey(e){ if (e.key === "Escape") onClose?.(); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const filename = file?.name || file?.__doc?.title || "Document";
  const isImg = isImageName(filename) || (mime.startsWith("image/"));
  const isPdf = isPDFName(filename) || (mime === "application/pdf");
  const isTxt = isTextName(filename) || /^text\/|\/json$/.test(mime);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10002] bg-black/50" onMouseDown={onClose}>
      <div className="absolute inset-6 md:inset-12 lg:inset-16 bg-white rounded-2xl shadow-2xl overflow-hidden" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="truncate text-sm font-medium text-slate-800">{filename}</div>
          <div className="flex items-center gap-2">
            <button onClick={()=>onDownload(file)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Download</button>
            <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Close</button>
          </div>
        </div>
        <div className="h-full overflow-auto bg-slate-50">
          {loading && <div className="p-6 text-center text-slate-600">Loading preview…</div>}
          {err && <div className="p-6 text-center text-rose-700">Preview failed: {err}</div>}
          {!loading && !err && url && (
            <>
              {isImg && <img src={url} alt={filename} className="mx-auto block max-h-[calc(100vh-220px)] object-contain" />}
              {isPdf && <iframe title="pdf" src={url} className="w-full h-[calc(100vh-220px)]" />}
              {isTxt && (
                <div className="p-4">
                  <iframe title="text" src={url} className="w-full h-[calc(100vh-220px)] bg-white border rounded-lg" />
                </div>
              )}
              {!isImg && !isPdf && !isTxt && (
                <div className="p-6 text-center text-slate-700">Preview is not supported for this file type. Use <span className="font-medium">Download</span> to open it locally.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* =================== SHARED DOCUMENTS (flat list) =================== */
export default function Documents(){
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("dateDesc");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [docs, setDocs] = useState([]);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNode, setPreviewNode] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  // API helpers — shared only
  async function docsJSON(path, opts = {}){
    const res = await fetch(`${API_DOCS}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}) }, credentials: "include" });
    if(res.status === 401){ setAuthError("You’re not signed in or your session expired. Please log in again."); throw new Error("Unauthorized"); }
    if(!res.ok){ let msg = `Request failed (${res.status})`; try { const j = await res.json(); msg = j?.error || j?.message || msg; } catch {} throw new Error(msg); }
    return res.json();
  }
  async function docsBlob(path){
    const res = await fetch(`${API_DOCS}${path}`, { credentials: "include" });
    if(res.status === 401){ setAuthError("You’re not signed in or your session expired. Please log in again."); throw new Error("Unauthorized"); }
    if(!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.blob();
  }

  // Load shared docs
  useEffect(()=>{
    (async()=>{
      try{ setLoading(true); setAuthError("");
        const j = await docsJSON("");
        const arr = Array.isArray(j.documents) ? j.documents : [];
        const nodes = arr.map(d => ({ id: `doc:${d.id}`, name: d.title || d.original_name || `Document ${d.id}`, type: "file", dateUploaded: d.uploaded_at, __doc: d }));
        setDocs(nodes);
      }catch(e){ /* handled via banners */ }
      finally{ setLoading(false); }
    })();
  }, []);

  // Filtering & sorting
  const visibleRows = useMemo(()=>{
    const q = query.trim().toLowerCase();
    let filtered = q ? docs.filter(r => (r.name||"").toLowerCase().includes(q)) : [...docs];
    const compareNameAsc = (a,b) => (a.name||"").localeCompare(b.name||"");
    const compareNameDesc = (a,b) => -compareNameAsc(a,b);
    const toTime = (x) => { const d = x?.dateUploaded ? new Date(x.dateUploaded) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : -Infinity; };
    const compareDateAsc = (a,b) => toTime(a) - toTime(b) || compareNameAsc(a,b);
    const compareDateDesc = (a,b) => -compareDateAsc(a,b);
    const cmpMap = { az: compareNameAsc, za: compareNameDesc, dateAsc: compareDateAsc, dateDesc: compareDateDesc };
    filtered.sort(cmpMap[sortMode] || compareDateDesc);
    return filtered;
  }, [docs, query, sortMode]);

  // Actions
  async function handleDownload(node){
    const docId = node.__doc?.id ?? String(node.id).replace(/^doc:/,'');
    const blob = await docsBlob(`/download/${docId}`);
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = node.name || `document-${docId}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  async function fetchPreviewBlob(node){
    const docId = node.__doc?.id ?? String(node.id).replace(/^doc:/,'');
    return docsBlob(`/download/${docId}`);
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Shared Files</h2>
      </div>

      {/* Auth banner */}
      {authError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{authError}</div>
      )}

      {/* Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-600">Documents shared with you by admin.</div>
          <div className="grid w-full grid-cols-1 gap-2 md:w-auto md:auto-cols-max md:grid-flow-col md:items-center">
            <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"/>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Sort:</label>
              <select value={sortMode} onChange={(e)=>setSortMode(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="dateDesc">Date ↓ (New → Old)</option>
                <option value="dateAsc">Date ↑ (Old → New)</option>
                <option value="az">A → Z (Name)</option>
                <option value="za">Z → A (Name)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop/tablet table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-[70%] px-4 py-3">Name</th>
                <th className="w-[30%] px-4 py-3">Shared / Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleRows.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-10 text-center text-slate-500">{loading? 'Loading…' : 'No shared documents'}</td></tr>
              )}
              {visibleRows.map(node => (
                <tr key={node.id} className="hover:bg-slate-50/60 cursor-default">
                  <td className="px-4 py-3">
                    <button onClick={()=>{ setPreviewNode(node); setPreviewOpen(true); }} className="truncate font-medium text-slate-800 hover:underline text-left" title="Preview">
                      {node.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>{toISO(node.dateUploaded) || '—'}</span>
                      <button onClick={(e)=>{ const rect=e.currentTarget.getBoundingClientRect(); setMenuAnchor(rect); setMenuFor(node.id === menuFor ? null : node.id); }} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Row menu">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                      </button>
                    </div>
                    {(menuFor === node.id && menuAnchor) && (
                      <PortalMenu anchorRect={menuAnchor} onClose={()=>setMenuFor(null)}>
                        <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPreviewNode(node); setPreviewOpen(true); }}>Preview</button>
                        <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleDownload(node).catch(err=>alert(String(err?.message||err))); }}>Download</button>
                      </PortalMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile list */}
        <div className="md:hidden">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-500">{loading? 'Loading…' : 'No shared documents'}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleRows.map(node => (
                <li key={node.id} className="px-4 py-3">
                  <div className="flex items-start">
                    <div className="flex-1 min-w-0">
                      <button onClick={()=>{ setPreviewNode(node); setPreviewOpen(true); }} className="block w-full text-left truncate font-medium text-slate-800 hover:underline">{node.name}</button>
                      <div className="mt-0.5 text-xs text-slate-500">{toISO(node.dateUploaded) || '—'}</div>
                    </div>
                    <div className="ml-2">
                      <button onClick={(e)=>{ const rect=e.currentTarget.getBoundingClientRect(); setMenuAnchor(rect); setMenuFor(node.id === menuFor ? null : node.id); }} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Row menu">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                      </button>
                    </div>
                  </div>
                  {(menuFor === node.id && menuAnchor) && (
                    <PortalMenu anchorRect={menuAnchor} onClose={()=>setMenuFor(null)}>
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPreviewNode(node); setPreviewOpen(true); }}>Preview</button>
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleDownload(node).catch(err=>alert(String(err?.message||err))); }}>Download</button>
                    </PortalMenu>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Preview modal */}
      <PreviewModal
        open={previewOpen}
        onClose={()=>{ setPreviewOpen(false); setPreviewNode(null); }}
        file={previewNode}
        fetchBlob={(node)=>fetchPreviewBlob(node)}
        onDownload={(node)=>handleDownload(node).catch(err=>alert(String(err?.message||err)))}
      />
    </div>
  );
}
