// frontend/src/pages/Documents.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";

/**
 * Two backends:
 *  - File manager (your existing tree for personal files)
 *  - Documents (admin-shared docs)
 */
const API_FILES = "/api/files";
const API_DOCS  = "/api/documents";

/* ---- Helpers ---- */
function cx(...xs){return xs.filter(Boolean).join(" ");}
function toISO(d){ if(!d) return ""; const dt=d instanceof Date?d:new Date(d); return Number.isNaN(dt.getTime())? "" : dt.toLocaleDateString(); }
function getStoredToken() {
  if (typeof window === "undefined") return null;
  const lsKeys = ["token","access_token","accessToken","jwt","jwt_token"];
  for (const k of lsKeys) { const v = localStorage.getItem(k); if (v && v !== "undefined" && v !== "null") return v.replace(/^Bearer\s+/i, ""); }
  const cookie = document.cookie || ""; const cookieKeys = ["access_token","accessToken","jwt","jwt_token"];
  for (const ck of cookieKeys) { const m = cookie.match(new RegExp(`(?:^|; )${ck}=([^;]+)`)); if (m && m[1]) return decodeURIComponent(m[1]).replace(/^Bearer\s+/i, ""); }
  return null;
}
function normalizeNodes(nodes = []) {
  const arr = Array.isArray(nodes) ? nodes : [];
  return arr.map(n => ({
    id: n?.id, name: typeof n?.name === "string" ? n.name : String(n?.name ?? ""),
    type: n?.type || "file",
    dateUploaded: n?.dateUploaded ?? n?.created_at ?? n?.createdAt ?? null,
    children: Array.isArray(n?.children) ? normalizeNodes(n.children) : [],
    hasLoadedChildren: Array.isArray(n?.children) ? true : false,
    parent_id: n?.parent_id ?? n?.parentId ?? null,
  }));
}
function flatten(nodes, expanded, depth = 0) {
  const out = []; const arr = Array.isArray(nodes) ? nodes : [];
  for (const n of arr) {
    const node = { ...n, depth }; out.push(node);
    if (node.type === "folder" && expanded.has(node.id) && Array.isArray(node.children)) {
      out.push(...flatten(node.children, expanded, depth + 1));
    }
  } return out;
}
function FileIcon({ type }){
  if(type === 'folder'){
    return <svg className="h-5 w-5 text-sky-700" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4z"/></svg>;
  }
  return <svg className="h-5 w-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function leadingNumber(name){
  if (!name) return NaN; const m = String(name).trim().match(/^(-?\d+(\.\d+)?)/); return m ? parseFloat(m[0]) : NaN;
}
function ext(name=""){
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : "";
}
const IMG_EXT = new Set(["png","jpg","jpeg","gif","webp","bmp","svg"]);
const TXT_EXT = new Set(["txt","csv","log","json","md","ts","js","py","xml","yaml","yml"]);
function isImageName(n){ return IMG_EXT.has(ext(n)); }
function isPDFName(n){ return ext(n) === "pdf"; }
function isTextName(n){ return TXT_EXT.has(ext(n)); }

/* ---------- Portal menu with smart positioning ---------- */
function PortalMenu({ anchorRect, onClose, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  useEffect(() => {
    function place() {
      const mr = menuRef.current?.getBoundingClientRect?.();
      const vw = window.innerWidth, vh = window.innerHeight;
      const pad = 8;
      let left = anchorRect.left;
      let top = anchorRect.bottom + 6;
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
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.removeEventListener("mousedown", h); };
  }, [anchorRect, onClose]);
  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
      className="w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
      onMouseDown={(e)=>e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

/* ---------- Simple folder chooser modal (for Move/Copy) ---------- */
function FolderPicker({ visible, tree, scope, onLoadChildren, onCancel, onConfirm }) {
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (!visible) { setExpanded(new Set()); setSelected(null); } }, [visible]);

  async function toggle(n){
    if (n.type !== "folder") return;
    if (!n.hasLoadedChildren) {
      await onLoadChildren(scope, n.id);
    }
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(n.id) ? next.delete(n.id) : next.add(n.id);
      return next;
    });
  }

  function renderNode(n, depth=0){
    if (n.type !== "folder") return null;
    return (
      <div key={`pick-${n.id}`} className="select-none">
        <div
          className={cx("flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-50", selected===n.id && "bg-sky-50 ring-1 ring-sky-200")}
          style={{ paddingLeft: depth * 14 }}
          onClick={() => setSelected(n.id)}
        >
          <button onClick={(e)=>{e.stopPropagation(); toggle(n);}} className="text-slate-500 hover:text-slate-700">
            {expanded.has(n.id) ? "▾" : "▸"}
          </button>
          <FileIcon type="folder" />
          <span className="text-sm">{n.name}</span>
        </div>
        {expanded.has(n.id) && Array.isArray(n.children) && n.children.map(c => renderNode(c, depth+1))}
      </div>
    );
  }

  if (!visible) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/30 flex items-center justify-center" onMouseDown={onCancel}>
      <div className="w-[520px] max-h-[70vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="text-lg font-semibold mb-2">Choose destination folder</div>
        <div className="text-xs text-slate-500 mb-3">Pick a folder or leave unselected to use <span className="font-medium">Root</span>.</div>
        <div className="border rounded-lg p-2 mb-4">
          {/* Root option */}
          <div
            className={cx("flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-50", selected===null && "bg-sky-50 ring-1 ring-sky-200")}
            onClick={()=>setSelected(null)}
          >
            <FileIcon type="folder" />
            <span className="text-sm font-medium">Root</span>
          </div>
          {/* Tree */}
          {tree.map(n => renderNode(n, 0))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>
          <button onClick={()=>onConfirm(selected)} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm">Confirm</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------- Preview Modal ---------- */
function PreviewModal({ open, onClose, file, scope, fetchBlob, onDownload }) {
  const [url, setUrl] = useState(null);
  const [mime, setMime] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    let createdUrl = null;

    (async () => {
      try{
        setLoading(true); setErr("");
        const blob = await fetchBlob(file);
        if (cancelled) return;

        const t = blob?.type || "";
        setMime(t);
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      }catch(e){
        if (!cancelled) setErr(String(e?.message || e));
      }finally{
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setUrl(null);
    };
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
                <div className="p-6 text-center text-slate-700">
                  Preview is not supported for this file type. Use <span className="font-medium">Download</span> to open it locally.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * INVESTOR DOCS VIEW
 * - scope 'direct'  → uses /api/files (your current system)
 * - scope 'shared'  → uses /api/documents (admin-shared to this investor)
 */
export default function Documnest(){
  const [scope, setScope] = useState('direct'); // 'direct' | 'shared'
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('az');

  const [expanded, setExpanded] = useState(new Set());
  const [menuFor, setMenuFor] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [treeDirect, setTreeDirect] = useState([]);
  const [treeShared, setTreeShared] = useState([]);
  const [authError, setAuthError] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const [currentFolder, setCurrentFolder] = useState({ id: null, name: "Root", path: [{ id:null, name:"Root" }] });

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNode, setPreviewNode] = useState(null);

  const token = getStoredToken();
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  // ---------------- Files API (personal files) ----------------
  async function filesJSON(path, opts = {}){
    const res = await fetch(`${API_FILES}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}), ...authHeaders } });
    if(res.status === 401){ setAuthError("You’re not signed in or your session expired. Please log in again."); throw new Error("Unauthorized"); }
    if(!res.ok){ let msg = `Request failed (${res.status})`; try { const j = await res.json(); msg = j?.message || j || msg; } catch {} throw new Error(msg); }
    const ct = res.headers.get("content-type") || ""; return ct.includes("application/json") ? res.json() : res.text();
  }
  async function filesBlob(path){
    const res = await fetch(`${API_FILES}${path}`, { headers: { ...authHeaders } });
    if(res.status === 401){ setAuthError("You’re not signed in or your session expired. Please log in again."); throw new Error("Unauthorized"); }
    if(!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.blob();
  }

  // ---------------- Documents API (admin-shared) ----------------
  async function docsJSON(path, opts = {}){
    const res = await fetch(`${API_DOCS}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}), ...authHeaders } });
    if(res.status === 401){ setAuthError("You’re not signed in or your session expired. Please log in again."); throw new Error("Unauthorized"); }
    if(!res.ok){ let msg = `Request failed (${res.status})`; try { const j = await res.json(); msg = j?.error || j?.message || msg; } catch {} throw new Error(msg); }
    return res.json();
  }
  async function docsBlob(path){
    const res = await fetch(`${API_DOCS}${path}`, { headers: { ...authHeaders } });
    if(res.status === 401){ setAuthError("You’re not signed in or your session expired. Please log in again."); throw new Error("Unauthorized"); }
    if(!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.blob();
  }

  // ----- Loaders -----
  async function loadTree(which){
    if (which === 'direct') {
      const raw = await filesJSON(`/tree?scope=direct`);
      const data = normalizeNodes(raw || []);
      setTreeDirect(data);
    } else {
      const j = await docsJSON("");
      const docs = Array.isArray(j.documents) ? j.documents : [];
      const nodes = docs.map(d => ({
        id: `doc:${d.id}`,
        name: d.title || d.original_name || `Document ${d.id}`,
        type: "file",
        parent_id: null,
        dateUploaded: d.uploaded_at,
        __doc: d
      }));
      setTreeShared(nodes);
    }
  }
  async function loadChildren(whichScope, parentId){
    if (whichScope === 'direct') {
      const raw = await filesJSON(`/children?scope=direct&parent_id=${parentId}`);
      return normalizeNodes(raw || []);
    }
    return [];
  }

  useEffect(()=>{
    (async ()=>{
      try{
        setLoading(true); setAuthError("");
        await Promise.all([loadTree('direct'), loadTree('shared')]);
      }catch(e){ console.warn(e); }
      finally{ setLoading(false); }
    })();
  }, []);

  const tree = scope==='direct' ? treeDirect : treeShared;
  const setTree = scope==='direct' ? setTreeDirect : setTreeShared;

  function updateNodeChildren(id, children){
    function recur(list){
      return list.map(n => {
        if(n.id === id){ return { ...n, children, hasLoadedChildren: true }; }
        if(Array.isArray(n.children) && n.children.length){ return { ...n, children: recur(n.children) }; }
        return n;
      });
    }
    setTree(prev => recur(prev));
  }

  async function ensureLoaded(node){
    if(node.type !== 'folder') return;
    if(!node.hasLoadedChildren){
      const kids = await loadChildren(scope, node.id);
      updateNodeChildren(node.id, kids);
    }
  }

  function toggleFolder(id){
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // --------- Personal files actions ----------
  async function handleCreateFolder(parentId, name){
    const payload = { name, parent_id: parentId ?? null, scope: "direct" };
    await filesJSON(`/folder`, { method: "POST", body: JSON.stringify(payload) });
    if(parentId){ const kids = await loadChildren('direct', parentId); updateNodeChildren(parentId, kids); setExpanded(prev => new Set(prev).add(parentId)); }
    else { await loadTree('direct'); }
  }
  async function handleUpload(fileList, parentId){
    const form = new FormData();
    form.append("scope", "direct");
    if(parentId != null) form.append("parent_id", String(parentId));
    for(const f of Array.from(fileList)) form.append("files", f);
    const res = await fetch(`${API_FILES}/upload`, { method:"POST", headers:{ ...authHeaders }, body: form });
    if(!res.ok){ let msg = `Upload failed (${res.status})`; try { const j = await res.json(); msg = j?.message || msg; } catch {} throw new Error(msg); }
    if(parentId){ const kids = await loadChildren('direct', parentId); updateNodeChildren(parentId, kids); setExpanded(prev => new Set(prev).add(parentId)); }
    else { await loadTree('direct'); }
  }
  async function handleDownload(node){
    if (scope === 'shared') {
      const docId = node.__doc?.id ?? String(node.id).replace(/^doc:/,'');
      const blob = await docsBlob(`/download/${docId}`);
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = node.name || `document-${docId}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      return;
    }
    const blob = await filesBlob(`/download/${node.id}`);
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = node.type === 'file' ? node.name : `${node.name}.zip`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  async function handleRename(node){
    if (scope === 'shared') return;
    const newName = window.prompt("New name", node.name);
    if(!newName || newName.trim() === "" || newName === node.name) return;
    await filesJSON(`/rename`, { method:"POST", body: JSON.stringify({ id: node.id, name: newName }) });
    const pid = node.parent_id || null;
    if(pid){ const kids = await loadChildren('direct', pid); updateNodeChildren(pid, kids); }
    else { await loadTree('direct'); }
  }
  async function handleDelete(node){
    if (scope === 'shared') return;
    if(!window.confirm(`Delete "${node.name}"? This cannot be undone.`)) return;
    const res = await fetch(`${API_FILES}/node/${node.id}`, { method:"DELETE", headers:{ ...authHeaders } });
    if(!res.ok) throw new Error(`Delete failed (${res.status})`);
    const pid = node.parent_id || null;
    if(pid){ const kids = await loadChildren('direct', pid); updateNodeChildren(pid, kids); }
    else { await loadTree('direct'); }
  }
  async function handleMove(node, targetParentId){
    if (scope === 'shared') return;
    await filesJSON(`/move`, { method:"POST", body: JSON.stringify({ id: node.id, target_parent_id: targetParentId, scope: "direct" }) });
    const fromPid = node.parent_id || null;
    if(fromPid){ const kids = await loadChildren('direct', fromPid); updateNodeChildren(fromPid, kids); } else { await loadTree('direct'); }
    if(targetParentId){ const kids2 = await loadChildren('direct', targetParentId); updateNodeChildren(targetParentId, kids2); }
  }
  async function handleCopy(node, targetParentId){
    if (scope === 'shared') return;
    await filesJSON(`/copy`, { method:"POST", body: JSON.stringify({ id: node.id, target_parent_id: targetParentId, scope: "direct" }) });
    if(targetParentId){ const kids2 = await loadChildren('direct', targetParentId); updateNodeChildren(targetParentId, kids2); }
    else { await loadTree('direct'); }
  }

  // Preview fetchers
  async function fetchPreviewBlob(node){
    if (scope === 'shared') {
      const docId = node.__doc?.id ?? String(node.id).replace(/^doc:/,'');
      return docsBlob(`/download/${docId}`);
    }
    return filesBlob(`/download/${node.id}`);
  }

  // —— UI helpers
  function onPickedRoot(e){
    if(e.target.files?.length){
      handleUpload(e.target.files, currentFolder.id).catch(err => alert(String(err?.message || err)));
      e.target.value='';
    }
  }

  // Enter folder
  async function enterFolder(node){
    await ensureLoaded(node);
    setCurrentFolder(prev => ({ id: node.id, name: node.name, path: [...prev.path, { id: node.id, name: node.name }] }));
    setExpanded(prev => new Set(prev).add(node.id));
  }
  async function goToCrumb(crumb){
    if(crumb.id === null){ setCurrentFolder({ id: null, name: "Root", path: [{ id:null, name:"Root" }] }); return; }
    const n = findNodeById(tree, crumb.id); if(n) await ensureLoaded(n);
    setCurrentFolder(prev => ({ id: crumb.id, name: crumb.name, path: prev.path.slice(0, prev.path.findIndex(p => p.id === crumb.id) + 1) }));
    setExpanded(prev => new Set(prev).add(crumb.id));
  }
  function findNodeById(list, id){
    for(const n of list){ if(n.id === id) return n; if(n.children?.length){ const x = findNodeById(n.children, id); if(x) return x; } } return null;
  }

  // Sorting & scoping
  const visibleRows = useMemo(()=>{
    if (scope === 'shared') {
      const list = Array.isArray(treeShared) ? treeShared : [];
      const q = query.trim().toLowerCase();
      let filtered = q ? list.filter(r => (r.name||"").toLowerCase().includes(q)) : list;

      const compareNameAsc = (a,b) => (a.name||"").localeCompare(b.name||"");
      const compareNameDesc = (a,b) => -compareNameAsc(a,b);
      const toTime = (x) => { const d = x?.dateUploaded ? new Date(x.dateUploaded) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : -Infinity; };
      const compareDateAsc = (a,b) => toTime(a) - toTime(b) || compareNameAsc(a,b);
      const compareDateDesc = (a,b) => -compareDateAsc(a,b);
      const cmpMap = { az: compareNameAsc, za: compareNameDesc, dateAsc: compareDateAsc, dateDesc: compareDateDesc };
      filtered.sort(cmpMap[sortMode] || compareNameAsc);
      return filtered;
    }

    const list = flatten(treeDirect, expanded, 0);
    const getName = (n) => typeof n?.name === "string" ? n.name : String(n?.name ?? "");
    const q = query.trim().toLowerCase();
    let filtered = q ? list.filter(r => getName(r).toLowerCase().includes(q)) : list;

    const compareNameAsc = (a,b) => getName(a).localeCompare(getName(b));
    const compareNameDesc = (a,b) => -compareNameAsc(a,b);
    const compareNumAsc = (a,b) => {
      const na = leadingNumber(getName(a)); const nb = leadingNumber(getName(b));
      if (Number.isNaN(na) && Number.isNaN(nb)) return compareNameAsc(a,b);
      if (Number.isNaN(na)) return 1; if (Number.isNaN(nb)) return -1;
      return na - nb || compareNameAsc(a,b);
    };
    const compareNumDesc = (a,b) => -compareNumAsc(a,b);
    const toTime = (x) => { const d = x?.dateUploaded ? new Date(x.dateUploaded) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : -Infinity; };
    const compareDateAsc = (a,b) => toTime(a) - toTime(b) || compareNameAsc(a,b);
    const compareDateDesc = (a,b) => -compareDateAsc(a,b);
    const cmpMap = { az: compareNameAsc, za: compareNameDesc, numAsc: compareNumAsc, numDesc: compareNumDesc, dateAsc: compareDateAsc, dateDesc: compareDateDesc };
    filtered.sort(cmpMap[sortMode] || compareNameAsc);

    if(currentFolder.id !== null){ filtered = filtered.filter(r => r.parent_id === currentFolder.id); }
    else { filtered = filtered.filter(r => r.parent_id == null); }

    return filtered;
  }, [scope, treeDirect, treeShared, expanded, query, sortMode, currentFolder]);

  const counts = useMemo(()=>({
    direct: Array.isArray(treeDirect) ? treeDirect.length : 0,
    shared: Array.isArray(treeShared) ? treeShared.length : 0
  }),[treeDirect, treeShared]);

  useEffect(()=>{ setCurrentFolder({ id: null, name: "Root", path: [{ id:null, name:"Root" }] }); setMenuFor(null); }, [scope]);

  // ===========================================================
  // Render
  // ===========================================================
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={()=>setScope('direct')} className={cx('rounded-xl border px-4 py-2 text-sm font-medium', scope==='direct' ? 'border-sky-300 bg-white text-slate-900 shadow-sm' : 'border-slate-300 bg-white/70 text-slate-600 hover:bg-white')}>
          My Files <span className={cx('ml-2 rounded-full px-2 text-xs', scope==='direct'?'bg-sky-50 text-sky-700 ring-1 ring-sky-200':'bg-slate-100 text-slate-600')}>{counts.direct}</span>
        </button>
        <button onClick={()=>setScope('shared')} className={cx('rounded-xl border px-4 py-2 text-sm font-medium', scope==='shared' ? 'border-sky-300 bg-white text-slate-900 shadow-sm' : 'border-slate-300 bg-white/70 text-slate-600 hover:bg-white')}>
          Shared Files <span className={cx('ml-2 rounded-full px-2 text-xs', scope==='shared'?'bg-sky-50 text-sky-700 ring-1 ring-sky-200':'bg-slate-100 text-slate-600')}>{counts.shared}</span>
        </button>
      </div>

      {/* Breadcrumb + Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center flex-wrap gap-1 text-sm">
            {currentFolder.path.map((c, i) => (
              <span key={`${c.id ?? 'root'}-${i}`} className="flex items-center">
                {i>0 && <span className="mx-1 text-slate-400">/</span>}
                <button onClick={()=>goToCrumb(c)} className={cx("px-1 rounded hover:bg-slate-100", i === currentFolder.path.length-1 ? "font-semibold text-slate-800" : "text-slate-600")}>
                  {c.name}
                </button>
              </span>
            ))}
          </div>

          {/* Search + Sort + Actions */}
          <div className="grid w-full grid-cols-1 gap-2 md:w-auto md:auto-cols-max md:grid-flow-col md:items-center">
            <input
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Sort:</label>
              <select value={sortMode} onChange={(e)=>setSortMode(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {scope==='shared' ? (
                  <>
                    <option value="az">A → Z (Name)</option>
                    <option value="za">Z → A (Name)</option>
                    <option value="dateAsc">Date ↑ (Old → New)</option>
                    <option value="dateDesc">Date ↓ (New → Old)</option>
                  </>
                ) : (
                  <>
                    <option value="az">A → Z (Name)</option>
                    <option value="za">Z → A (Name)</option>
                    <option value="numAsc">1 → 9 (Leading Number)</option>
                    <option value="numDesc">9 → 1 (Leading Number)</option>
                    <option value="dateAsc">Date ↑ (Old → New)</option>
                    <option value="dateDesc">Date ↓ (New → Old)</option>
                  </>
                )}
              </select>
            </div>

            {/* Creation / upload controls (hidden on shared) */}
            {scope === 'direct' && (
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <button
                  onClick={()=>{ const name = window.prompt('New folder name'); if(!name) return; handleCreateFolder(currentFolder.id, name).catch(err=>alert(String(err?.message||err))); }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  New Folder
                </button>
                <button
                  onClick={()=>document.getElementById("file-picker-root").click()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Upload
                </button>
                <input id="file-picker-root" type="file" multiple className="hidden" onChange={onPickedRoot}/>
              </div>
            )}
          </div>
        </div>

        {/* ===================== Responsive content ===================== */}
        {/* Desktop/tablet table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-[65%] px-4 py-3">Name</th>
                <th className="w-[25%] px-4 py-3">{scope==='shared' ? 'Shared / Uploaded' : 'Date Uploaded'}</th>
                <th className="w-[10%] px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleRows.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-500">{loading? 'Loading…' : 'Nothing to display'}</td></tr>
              )}
              {visibleRows.map(node => (
                <tr key={node.id} className="hover:bg-slate-50/60 cursor-default" onDoubleClick={() => node.type==='folder' ? enterFolder(node) : null}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {node.type==='folder' ? (
                        <button onClick={async ()=>{ await ensureLoaded(node); toggleFolder(node.id); }} className="mr-1 text-slate-500 hover:text-slate-700" aria-label="Toggle folder">
                          {expanded.has(node.id) ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          )}
                        </button>
                      ) : <span className="w-4"/>}
                      <div style={{ paddingLeft: `${node.depth * 16 || 0}px` }} className="flex items-center gap-2">
                        <FileIcon type={node.type} />
                        {node.type === 'folder' ? (
                          <button onClick={() => enterFolder(node)} className="truncate font-medium text-slate-800 hover:underline" title={`Open ${node.name}`}>{node.name}</button>
                        ) : (
                          <button
                            onClick={()=>{ setPreviewNode(node); setPreviewOpen(true); }}
                            className="truncate font-medium text-slate-800 hover:underline text-left"
                            title="Preview"
                          >
                            {node.name}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{toISO(node.dateUploaded) || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e)=>{ e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenuAnchor(rect); setMenuFor(node.id === menuFor ? null : node.id); }}
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Row menu"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                    {(menuFor === node.id && menuAnchor) && (
                      <PortalMenu anchorRect={menuAnchor} onClose={()=>setMenuFor(null)}>
                        {scope==='shared' ? (
                          <>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPreviewNode(node); setPreviewOpen(true); }}>Preview</button>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleDownload(node).catch(err=>alert(String(err?.message||err))); }}>Download</button>
                          </>
                        ) : (
                          <>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPreviewNode(node); setPreviewOpen(true); }}>Preview</button>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleRename(node).catch(err=>alert(String(err?.message||err))); }}>Rename</button>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleDownload(node).catch(err=>alert(String(err?.message||err))); }}>Download</button>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPendingAction({ type:'copy', node }); setPickerVisible(true); }}>Copy…</button>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPendingAction({ type:'move', node }); setPickerVisible(true); }}>Move to…</button>
                            <hr className="my-1"/>
                            <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50" onClick={()=>{ setMenuFor(null); handleDelete(node).catch(err=>alert(String(err?.message||err))); }}>Delete</button>
                          </>
                        )}
                      </PortalMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-500">{loading? 'Loading…' : 'Nothing to display'}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleRows.map(node => (
                <li key={node.id} className="px-4 py-3">
                  <div className="flex items-start">
                    <div className="mt-1 mr-3"><FileIcon type={node.type} /></div>
                    <div className="flex-1 min-w-0">
                      {node.type === 'folder' ? (
                        <button onClick={() => enterFolder(node)} className="block w-full text-left truncate font-medium text-slate-800 hover:underline">{node.name}</button>
                      ) : (
                        <button onClick={()=>{ setPreviewNode(node); setPreviewOpen(true); }} className="block w-full text-left truncate font-medium text-slate-800 hover:underline">
                          {node.name}
                        </button>
                      )}
                      <div className="mt-0.5 text-xs text-slate-500">{toISO(node.dateUploaded) || '—'}</div>
                    </div>
                    <div className="ml-2">
                      <button
                        onClick={(e)=>{ e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenuAnchor(rect); setMenuFor(node.id === menuFor ? null : node.id); }}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Row menu"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                      </button>
                    </div>
                  </div>
                  {(menuFor === node.id && menuAnchor) && (
                    <PortalMenu anchorRect={menuAnchor} onClose={()=>setMenuFor(null)}>
                      {scope==='shared' ? (
                        <>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPreviewNode(node); setPreviewOpen(true); }}>Preview</button>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleDownload(node).catch(err=>alert(String(err?.message||err))); }}>Download</button>
                        </>
                      ) : (
                        <>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPreviewNode(node); setPreviewOpen(true); }}>Preview</button>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleRename(node).catch(err=>alert(String(err?.message||err))); }}>Rename</button>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); handleDownload(node).catch(err=>alert(String(err?.message||err))); }}>Download</button>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPendingAction({ type:'copy', node }); setPickerVisible(true); }}>Copy…</button>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{ setMenuFor(null); setPendingAction({ type:'move', node }); setPickerVisible(true); }}>Move to…</button>
                          <hr className="my-1"/>
                          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50" onClick={()=>{ setMenuFor(null); handleDelete(node).catch(err=>alert(String(err?.message||err))); }}>Delete</button>
                        </>
                      )}
                    </PortalMenu>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dropzone (only for My Files) */}
        {scope === 'direct' && (
          <div
            onDragOver={(e)=>{e.preventDefault(); setIsDragging(true);}}
            onDragLeave={()=>setIsDragging(false)}
            onDrop={(e)=>{e.preventDefault(); setIsDragging(false); if(e.dataTransfer?.files?.length){ handleUpload(e.dataTransfer.files, currentFolder.id).catch(err=>alert(String(err?.message||err))); }}}
            className={cx('m-4 rounded-xl border-2 border-dashed p-6 text-center sm:p-10', isDragging ? 'border-sky-300 bg-sky-50' : 'border-slate-300 text-slate-600')}
          >
            <div className="mx-auto mb-3 flex h-12 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700 sm:h-16 sm:w-14">ZIP</div>
            <div className="space-x-1 text-sm"><span>Drop files here or</span><button onClick={()=>document.getElementById("file-picker-root").click()} className="text-sky-700 underline underline-offset-2">browse</button></div>
            <div className="mt-3 text-xs text-slate-500">Files will upload to: <span className="font-medium">{currentFolder.path.map(p=>p.name).join(" / ")}</span></div>
          </div>
        )}
      </div>

      {/* Folder picker modal (for copy/move) */}
      <FolderPicker
        visible={pickerVisible}
        tree={tree}
        scope={scope}
        onLoadChildren={async (s, id)=>{ const kids = await loadChildren(s, id); updateNodeChildren(id, kids); return kids; }}
        onCancel={()=>{ setPickerVisible(false); setPendingAction(null); }}
        onConfirm={async (destId)=> {
          const act = pendingAction?.type; const node = pendingAction?.node;
          setPickerVisible(false); setPendingAction(null);
          if(!node || !act) return;
          try{
            if(act === 'move') await handleMove(node, destId);
            else await handleCopy(node, destId);
          }catch(err){ alert(String(err?.message||err)); }
        }}
      />

      {/* Preview modal */}
      <PreviewModal
        open={previewOpen}
        onClose={()=>{ setPreviewOpen(false); setPreviewNode(null); }}
        file={previewNode}
        scope={scope}
        fetchBlob={fetchPreviewBlob}
        onDownload={(node)=>handleDownload(node).catch(err=>alert(String(err?.message||err)))}
      />
    </div>
  );
}
