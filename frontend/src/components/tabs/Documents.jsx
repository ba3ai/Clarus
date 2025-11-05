import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  TbFileTypePdf, TbFileTypeCsv, TbFileTypeXls, TbFileTypeDoc, TbFileTypePpt, TbFileTypeTxt, TbFileZip,
} from "react-icons/tb";
import { AiFillFileImage, AiOutlineFile, AiOutlineCloudUpload } from "react-icons/ai";
import { VscFileCode } from "react-icons/vsc";
import { IoClose, IoCheckmarkCircle } from "react-icons/io5";

import api, { uploadFile } from "../../services/api";

/* -------------------------------------------------------------------------- */
/* Portal menu utilities                                                       */
/* -------------------------------------------------------------------------- */
function useOutsideClose(ref, onClose) {
  useEffect(() => {
    function h(e) { if (!ref.current || ref.current.contains(e.target)) return; onClose?.(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, ref]);
}

/** Floating menu that tracks scroll/resize and clamps to edges */
function PortalMenu({ anchorRect, children, onClose, width = 260 }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRect) return;

    const pad = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;

    let left = scrollX + anchorRect.left;
    let top  = scrollY + anchorRect.bottom + 6;

    const maxLeft = scrollX + vw - width - pad;
    const minLeft = scrollX + pad;
    left = Math.min(Math.max(minLeft, left), maxLeft);

    setPos({ top, left });

    const reposition = () => {
      const el = ref.current;
      if (!el) return;
      const mh = el.offsetHeight || 320;
      let finalTop = top;
      const maxTop = scrollY + vh - mh - pad;
      if (finalTop > maxTop) {
        const above = scrollY + anchorRect.top - mh - 6;
        finalTop = Math.max(scrollY + pad, Math.min(above, maxTop));
      }
      setPos((p) => (p.top === finalTop && p.left === left ? p : { top: finalTop, left }));
    };

    const id = requestAnimationFrame(reposition);
    const onWin = () => requestAnimationFrame(reposition);
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, { passive: true });

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin);
    };
  }, [anchorRect, width]);

  if (!anchorRect) return null;

  return ReactDOM.createPortal(
    <div style={{ position: "absolute", inset: 0, zIndex: 10000, pointerEvents: "none" }}>
      <div
        ref={ref}
        style={{ position: "absolute", top: pos.top, left: pos.left, width, pointerEvents: "auto" }}
        className="rounded-md border border-slate-200 bg-white p-1 shadow-xl"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/* File-type detection + icons                                                 */
/* -------------------------------------------------------------------------- */
function getExt(name = "") { const m = (name || "").toLowerCase().match(/\.([a-z0-9]+)$/i); return m ? m[1] : ""; }
function pickKind(ext, mime) {
  if (!ext && mime) {
    if (mime.includes("pdf")) return "pdf";
    if (mime.includes("excel") || mime.includes("spreadsheet")) return "xls";
    if (mime.includes("word")) return "doc";
    if (mime.includes("powerpoint")) return "ppt";
    if (mime.startsWith("image/")) return "image";
    if (mime.includes("json")) return "json";
    if (mime.includes("zip") || mime.includes("compressed")) return "zip";
    if (mime.startsWith("text/")) return "txt";
  }
  switch (ext) {
    case "pdf": return "pdf";
    case "xls": case "xlsx": return "xls";
    case "csv": return "csv";
    case "doc": case "docx": return "doc";
    case "ppt": case "pptx": return "ppt";
    case "png": case "jpg": case "jpeg": case "gif": case "webp": case "svg": return "image";
    case "zip": case "rar": case "7z": return "zip";
    case "json": return "json";
    case "txt": case "log": case "md": return "txt";
    case "js": case "ts": case "tsx": case "py": case "java": case "go": case "rb": case "php": case "c": case "cpp": case "cs": return "code";
    default: return "file";
  }
}
function FileIcon({ ext, mime, size = 22, className = "" }) {
  const kind = pickKind(ext, mime);
  const common = { size, className: `shrink-0 ${className}` };
  switch (kind) {
    case "pdf": return <TbFileTypePdf {...common} className={`text-red-600 ${common.className}`} />;
    case "xls": return <TbFileTypeXls {...common} className={`text-emerald-600 ${common.className}`} />;
    case "csv": return <TbFileTypeCsv {...common} className={`text-teal-600 ${common.className}`} />;
    case "doc": return <TbFileTypeDoc {...common} className={`text-blue-600 ${common.className}`} />;
    case "ppt": return <TbFileTypePpt {...common} className={`text-orange-600 ${common.className}`} />;
    case "json": return <TbFileTypeTxt {...common} className={`text-cyan-600 ${common.className}`} />;
    case "txt": return <TbFileTypeTxt {...common} className={`text-slate-600 ${common.className}`} />;
    case "zip": return <TbFileZip {...common} className={`text-amber-600 ${common.className}`} />;
    case "image": return <AiFillFileImage {...common} className={`text-fuchsia-600 ${common.className}`} />;
    case "code": return <VscFileCode {...common} className={`text-indigo-600 ${common.className}`} />;
    default: return <AiOutlineFile {...common} className={`text-slate-700 ${common.className}`} />;
  }
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */
export default function Documents() {
  const [docs, setDocs] = useState([]);

  // MULTI upload list: { id, file, title, progress, status }
  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Previews for images
  const previews = useMemo(() => {
    const m = new Map();
    items.forEach((it) => {
      if (it.file && it.file.type?.startsWith?.("image/")) {
        m.set(it.id, URL.createObjectURL(it.file));
      }
    });
    return m;
  }, [items]);
  useEffect(() => () => { previews.forEach((url) => URL.revokeObjectURL(url)); }, [previews]);

  // Share UX
  const [shareDoc, setShareDoc] = useState(null);
  const [shareRole, setShareRole] = useState(null);
  const [shareOptions, setShareOptions] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [shareQuery, setShareQuery] = useState("");

  const filteredShareOptions = useMemo(() => {
    const q = shareQuery.trim().toLowerCase();
    if (!q) return shareOptions;
    return shareOptions.filter(o =>
      (o.label || "").toLowerCase().includes(q) ||
      (o.email || "").toLowerCase().includes(q)
    );
  }, [shareOptions, shareQuery]);
  const allSelected =
    filteredShareOptions.length > 0 &&
    filteredShareOptions.every(o => selectedUserIds.includes(o.user_id));

  // Shared-with dropdown menu
  const [sharesMenuDoc, setSharesMenuDoc] = useState(null);
  const [sharesMenuAnchor, setSharesMenuAnchor] = useState(null);

  // Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerText, setViewerText] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // 3-dot menu
  const [menuDoc, setMenuDoc] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const bytes = (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(2) + " MB" : n >= 1e3 ? (n / 1e3).toFixed(1) + " KB" : (n || 0) + " B";

  useEffect(() => { refreshDocs(); }, []);

  // Paste-to-upload
  useEffect(() => {
    function onPaste(e) {
      const file = Array.from(e.clipboardData?.files || [])[0];
      if (file) addFiles([file]);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function refreshDocs() {
    try {
      const { data } = await api.get("/api/documents");
      if (data?.ok) setDocs(data.documents || []);
    } catch (e) {
      setDocs([]);
      setMsg("Not authorized. Please sign in again.");
    }
  }

  /* ------------------------------ Upload helpers --------------------------- */
  const ACCEPT = ".pdf,.csv,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.rar,.7z,.json,.txt,.md";
  const MAX_SIZE = 50 * 1024 * 1024;
  const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const baseTitle = (f) => (f?.name ? f.name.replace(/\.[^.]+$/, "") : "Untitled");

  function addFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const valid = [];
    const errors = [];
    arr.forEach((f) => {
      if (f.size > MAX_SIZE) errors.push(`${f.name} is too large (max 50MB).`);
      else valid.push({ id: genId(), file: f, title: baseTitle(f), progress: 0, status: "idle" });
    });
    setItems((prev) => [...prev, ...valid]);
    if (errors.length) setMsg(errors.join(" "));
  }

  function onBrowse(e) { addFiles(e.target.files); e.target.value = ""; }
  function onDrop(e) { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files); }
  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false); }

  function removeItem(id) { setItems((prev) => prev.filter((it) => it.id !== id)); }
  function clearAll() { setItems([]); setMsg(""); }

  async function handleUpload(e) {
    e.preventDefault();
    if (!items.length) { setMsg("Pick files first."); return; }
    setBusy(true); setMsg("");

    for (let i = 0; i < items.length; i++) {
      const id = items[i].id;
      await uploadOne(id);
    }
    setBusy(false);
    setItems((prev) => prev.filter((it) => it.status !== "done"));
    refreshDocs();
  }

  async function uploadOne(id) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: "uploading", progress: 8 } : it));
    const tickId = setInterval(() => {
      setItems((prev) => prev.map((it) => {
        if (it.id !== id || it.status !== "uploading") return it;
        return { ...it, progress: Math.min(94, it.progress + Math.random() * 8) };
      }));
    }, 120);

    const it = items.find((x) => x.id === id);
    try {
      const { data } = await uploadFile("/api/documents/upload", it.file, it.title ? { title: it.title } : {});
      clearInterval(tickId);
      if (!data?.ok) {
        const err = data?.error || "Upload failed";
        setItems((prev) => prev.map((x) => x.id === id ? { ...x, status: "error", progress: 0, error: err } : x));
        setMsg(err);
        return;
      }
      setItems((prev) => prev.map((x) => x.id === id ? { ...x, status: "done", progress: 100 } : x));
    } catch (err) {
      clearInterval(tickId);
      const m = err?.response?.data?.error || err?.message || "Upload failed";
      setItems((prev) => prev.map((x) => x.id === id ? { ...x, status: "error", progress: 0, error: m } : x));
      setMsg(m);
    }
  }

  /* ----------------------- Share flow (role → list → share) ---------------- */
  async function openSharePicker(doc, role) {
    setShareDoc(doc); setShareRole(role); setSelectedUserIds([]); setShareQuery("");
    try {
      const { data } = await api.get("/api/documents/share-options", { params: { role } });
      if (!data?.ok) throw new Error(data?.error || "Failed to load options");
      setShareOptions(data.options || []);
    } catch (err) {
      setShareOptions([]); alert(err?.message || "Failed to load options");
    }
  }
  function toggleUser(id) {
    setSelectedUserIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    if (allSelected) {
      setSelectedUserIds(prev => prev.filter(id => !filteredShareOptions.some(o => o.user_id === id)));
    } else {
      const visibleIds = filteredShareOptions.map(o => o.user_id);
      setSelectedUserIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  }
  async function confirmShare() {
    if (!shareDoc || !selectedUserIds.length) return;
    try {
      const { data } = await api.post("/api/documents/share", {
        document_id: shareDoc.id, investor_ids: selectedUserIds,
      });
      if (!data?.ok) throw new Error(data?.error || "Share failed");
      setShareDoc(null); setShareRole(null); setShareOptions([]); setSelectedUserIds([]); setShareQuery("");
      refreshDocs();
    } catch (err) { alert(err?.message || "Share failed"); }
  }
  async function revoke(documentId, userId) {
    try {
      const { data } = await api.delete("/api/documents/share", {
        data: { document_id: documentId, investor_id: userId },
      });
      if (!data?.ok) throw new Error(data?.error || "Revoke failed");
      refreshDocs();
    } catch (err) { alert(err?.message || "Revoke failed"); }
  }

  /* ------------------------------ View / Delete ---------------------------- */
  async function openViewer(doc) {
    setViewerOpen(true); setViewerDoc(doc); setViewerUrl(null); setViewerText(null); setViewerLoading(true);
    try {
      const res = await api.get(`/api/documents/view/${doc.id}`, { responseType: "blob" });
      const mime = res.headers["content-type"] || doc.mime_type || "application/octet-stream";
      if (mime.startsWith("text/") || ["csv","json","txt","md"].includes(getExt(doc.original_name))) {
        const text = await res.data.text();
        setViewerText(text);
      } else {
        const url = URL.createObjectURL(res.data);
        setViewerUrl(url);
      }
    } catch {
      setViewerText(null); setViewerUrl(null); alert("Could not open preview. Try Download.");
    } finally { setViewerLoading(false); }
  }
  function closeViewer() { setViewerOpen(false); if (viewerUrl) URL.revokeObjectURL(viewerUrl); setViewerUrl(null); setViewerText(null); setViewerDoc(null); }

  async function deleteDoc(doc) {
    if (!window.confirm(`Delete “${doc.title || doc.original_name}”? This cannot be undone.`)) return;
    try {
      const { data } = await api.delete(`/api/documents/${doc.id}`);
      if (!data?.ok) throw new Error(data?.error || "Delete failed");
      refreshDocs();
    } catch (err) { alert(err?.message || "Delete failed"); }
  }

  /* --------------------------------- UI ----------------------------------- */
  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="bg-white border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Upload</h3>
          <div className="text-sm text-gray-600">
            Tip: You can also <span className="font-medium">paste</span> a file (Ctrl/Cmd&nbsp;+&nbsp;V) directly into this page.
          </div>
        </div>

        {/* Full-width drag/drop with buttons BELOW */}
        <form className="p-4" onSubmit={handleUpload}>
          <label className="block text-sm font-medium mb-2">Your files</label>

          <div
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            className={[
              "relative rounded-2xl border-2 border-dashed px-5 py-6 transition-all w-full",
              dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300",
            ].join(" ")}
          >
            {items.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center">
                  <AiOutlineCloudUpload className="text-slate-500" size={28} />
                </div>
                <div className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Drag &amp; drop</span> files here, or{" "}
                  <label className="text-emerald-700 cursor-pointer hover:underline">
                    browse
                    <input type="file" accept={ACCEPT} multiple onChange={onBrowse} className="sr-only" />
                  </label>
                </div>
                <div className="text-xs text-slate-500">
                  Accepted: PDF, XLS/XLSX, CSV, DOC/DOCX, PPT/PPTX, Images, ZIP, JSON, TXT (max 50&nbsp;MB each)
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => {
                  const ext = getExt(it.file?.name);
                  const previewUrl = previews.get(it.id);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-2 rounded-lg ring-1 ring-slate-200">
                      {previewUrl ? (
                        <img src={previewUrl} alt="preview" className="w-12 h-12 rounded-md object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-slate-50 flex items-center justify-center">
                          <FileIcon ext={ext} mime={it.file?.type} size={22} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-slate-800 truncate" title={it.file?.name}>
                            {it.file?.name}
                          </div>
                          <div className="text-xs text-slate-500 shrink-0">{bytes(it.file?.size)}</div>
                        </div>
                        <div className="mt-1">
                          <input
                            className="w-full border rounded-md px-2 py-1 text-sm"
                            value={it.title}
                            onChange={(e) =>
                              setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, title: e.target.value } : x))
                            }
                            placeholder="Title (optional)"
                          />
                        </div>
                        {(it.status === "uploading" || it.status === "done") && (
                          <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${it.progress}%` }} />
                          </div>
                        )}
                        {it.status === "error" && (
                          <div className="mt-1 text-xs text-red-600">{it.error || "Upload failed"}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="p-2 rounded-md hover:bg-slate-100 text-slate-500"
                        onClick={() => removeItem(it.id)}
                        title="Remove"
                        disabled={it.status === "uploading"}
                      >
                        <IoClose size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Buttons row BELOW the drop area */}
          <div className="mt-4 flex flex-wrap items-center gap-3 justify-end">
            <label>
              <input type="file" accept={ACCEPT} multiple onChange={onBrowse} className="sr-only" />
              <span className="inline-flex items-center px-3 py-2 rounded-lg border hover:bg-slate-50 cursor-pointer">
                Choose files…
              </span>
            </label>

            <button
              type="button"
              className="inline-flex items-center px-3 py-2 rounded-lg border"
              onClick={clearAll}
              disabled={!items.length || busy}
            >
              Clear
            </button>

            <button
              type="submit"
              disabled={!items.length || busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50"
            >
              <AiOutlineCloudUpload size={18} />
              {busy ? "Uploading…" : `Upload ${items.length} file${items.length > 1 ? "s" : ""}`}
            </button>
          </div>

          {/* Status line */}
          {msg && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <IoCheckmarkCircle className="text-emerald-600" />
              <span>{msg}</span>
            </div>
          )}
        </form>
      </div>

      {/* Documents table */}
      <div className="bg-white border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b">
          <h3 className="text-base font-semibold text-gray-800">Documents</h3>
        </div>
        <div className="p-4 overflow-auto">
          {docs.length ? (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-2">Title</th>
                  <th className="text-left px-2 py-2">Original</th>
                  <th className="text-left px-2 py-2">Size</th>
                  <th className="text-left px-2 py-2">Uploaded</th>
                  <th className="text-left px-2 py-2">Shared With</th>
                  <th className="text-right px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const ext = getExt(d.original_name);
                  const labels = (d.shares || []).map(s => s.label || `User ${s.investor_user_id}`);
                  const buttonText =
                    labels.length === 0 ? "—"
                    : labels.length <= 2 ? labels.join(", ")
                    : `${labels.slice(0,2).join(", ")} +${labels.length - 2}`;
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <FileIcon ext={ext} mime={d.mime_type} />
                          <button type="button" className="text-left truncate max-w-[26ch] hover:underline"
                                  title="View" onClick={() => openViewer(d)}>
                            {d.title}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <FileIcon ext={ext} mime={d.mime_type} />
                          <span className="truncate max-w-[32ch]" title={d.original_name}>{d.original_name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">{bytes(d.size_bytes)}</td>
                      <td className="px-2 py-2">{new Date(d.uploaded_at).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        {labels.length ? (
                          <>
                            <button
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-slate-50"
                              onClick={(e) => {
                                setSharesMenuDoc(d);
                                setSharesMenuAnchor(e.currentTarget.getBoundingClientRect());
                              }}
                              title={labels.join(", ")}
                            >
                              <span className="truncate max-w-[26ch]">{buttonText}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" className="opacity-60"><path d="M7 10l5 5 5-5z" /></svg>
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button className="text-blue-600 hover:underline" onClick={() => openViewer(d)}>View</button>
                          <a className="text-blue-600 hover:underline"
                             href={`/api/documents/download/${d.id}`} target="_blank" rel="noopener noreferrer">
                            Download
                          </a>
                          <button className="text-red-600 hover:underline" onClick={() => deleteDoc(d)} title="Delete">
                            Delete
                          </button>
                          <button className="inline-flex items-center justify-center rounded-md p-2 hover:bg-gray-100"
                                  title="More"
                                  onClick={(e) => { setMenuDoc(d); setMenuAnchor(e.currentTarget.getBoundingClientRect()); }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="text-gray-500 text-sm">No documents yet.</div>}
        </div>
      </div>

      {/* Share menu (portal) */}
      {menuDoc && menuAnchor && (
        <PortalMenu anchorRect={menuAnchor} onClose={() => { setMenuDoc(null); setMenuAnchor(null); }}>
          <div className="px-3 py-2 text-sm text-slate-600">Share</div>
          <div className="my-1 border-t" />
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => { openSharePicker(menuDoc, "admin"); setMenuDoc(null); setMenuAnchor(null); }}>
            ↳ Share with Admin
          </button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => { openSharePicker(menuDoc, "group_admin"); setMenuDoc(null); setMenuAnchor(null); }}>
            ↳ Share with Group Admin
          </button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => { openSharePicker(menuDoc, "investor"); setMenuDoc(null); setMenuAnchor(null); }}>
            ↳ Share with Investor
          </button>
        </PortalMenu>
      )}

      {/* “Shared With” dropdown */}
      {sharesMenuDoc && sharesMenuAnchor && (
        <PortalMenu
          anchorRect={sharesMenuAnchor}
          onClose={() => { setSharesMenuDoc(null); setSharesMenuAnchor(null); }}
          width={280}
        >
          <div className="px-3 py-2 text-sm text-slate-600">Shared With</div>
          <div className="my-1 border-t" />
          <div className="max-h-[260px] overflow-auto">
            {(sharesMenuDoc.shares || []).map((s) => (
              <div key={s.investor_user_id} className="flex items-center justify-between px-3 py-2">
                <div className="truncate pr-2">
                  <div className="text-sm font-medium truncate">{s.label || `User ${s.investor_user_id}`}</div>
                  {s.email ? <div className="text-xs text-gray-500 truncate">{s.email}</div> : null}
                </div>
                <button
                  className="text-red-600 hover:underline text-sm"
                  onClick={() => { revoke(sharesMenuDoc.id, s.investor_user_id); setSharesMenuDoc(null); setSharesMenuAnchor(null); }}
                  title="Revoke access"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </PortalMenu>
      )}

      {/* Share modal */}
      {shareDoc && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30"
             onMouseDown={() => { setShareDoc(null); setShareRole(null); }}>
          <div className="w-[560px] max-h-[75vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
               onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-3">
              <div className="text-lg font-semibold">Share “{shareDoc.title || shareDoc.original_name}”</div>
              <div className="text-sm text-gray-500">Role: <span className="font-medium">{shareRole}</span></div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span>Select all</span>
                </label>
                <div className="text-xs text-gray-500">
                  {selectedUserIds.length} selected · {filteredShareOptions.length} shown
                </div>
              </div>

              {/* Search box */}
              <div className="px-3 py-2 border-b flex items-center gap-2">
                <input
                  value={shareQuery}
                  onChange={(e) => setShareQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {shareQuery && (
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:underline"
                    onClick={() => setShareQuery("")}
                    title="Clear"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="max-h-[320px] overflow-auto divide-y">
                {filteredShareOptions.length ? filteredShareOptions.map((o) => (
                  <label key={o.user_id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(o.user_id)}
                      onChange={() => toggleUser(o.user_id)}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{o.label}</div>
                      {o.email && <div className="text-xs text-gray-500">{o.email}</div>}
                    </div>
                  </label>
                )) : (
                  <div className="px-3 py-8 text-center text-sm text-gray-500">
                    No matches for “{shareQuery}”.
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border border-gray-300"
                      onClick={() => { setShareDoc(null); setShareRole(null); setShareOptions([]); setSelectedUserIds([]); setShareQuery(""); }}>
                Cancel
              </button>
              <button className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
                      disabled={!selectedUserIds.length} onClick={confirmShare}>
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewer modal */}
      {viewerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center" onMouseDown={closeViewer}>
          <div className="bg-white w-[92vw] max-w-5xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden"
               onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold text-gray-800 truncate">{viewerDoc?.title || viewerDoc?.original_name}</div>
              <div className="flex items-center gap-3">
                {viewerDoc && (
                  <a className="text-blue-600 hover:underline"
                     href={`/api/documents/download/${viewerDoc.id}`} target="_blank" rel="noreferrer">
                    Download
                  </a>
                )}
                <button className="p-2 rounded hover:bg-slate-100" onClick={closeViewer} aria-label="Close">
                  <IoClose size={18} />
                </button>
              </div>
            </div>
            <div className="p-0 bg-slate-50 h-[75vh] overflow-hidden">
              {viewerLoading && <div className="h-full grid place-items-center text-sm text-slate-600">Loading preview…</div>}
              {!viewerLoading && viewerUrl && (viewerDoc?.mime_type || "").includes("pdf") && (
                <iframe title="PDF" src={viewerUrl} className="w-full h-full" />
              )}
              {!viewerLoading && viewerUrl && (viewerDoc && viewerDoc.mime_type && viewerDoc.mime_type.startsWith("image/")) && (
                <img src={viewerUrl} alt="preview" className="max-h-full max-w-full object-contain mx-auto" />
              )}
              {!viewerLoading && viewerText && (
                <pre className="h-full overflow-auto p-4 whitespace-pre-wrap text-[13px] leading-5">{viewerText}</pre>
              )}
              {!viewerLoading && !viewerUrl && !viewerText && (
                <div className="h-full grid place-items-center text-sm text-slate-600">
                  No preview available. Use Download instead.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
