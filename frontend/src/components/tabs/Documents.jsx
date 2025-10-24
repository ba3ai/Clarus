import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";

// File-type icons
import {
  TbFileTypePdf,
  TbFileTypeCsv,
  TbFileTypeXls,
  TbFileTypeDoc,
  TbFileTypePpt,
  TbFileTypeTxt,
  TbFileZip,
} from "react-icons/tb";
import {
  AiFillFileImage,
  AiOutlineFile,
  AiOutlineCloudUpload,
} from "react-icons/ai";
import { VscFileCode } from "react-icons/vsc";
import {
  IoClose,
  IoCheckmarkCircle,
} from "react-icons/io5";

const API_BASE = import.meta?.env?.VITE_API_BASE || "";

/* -------------------------------------------------------------------------- */
/* Auth helper: read JWT from storage/cookie                                   */
/* -------------------------------------------------------------------------- */
function getStoredToken() {
  if (typeof window === "undefined") return null;
  const lsKeys = ["accessToken", "access_token", "token", "jwt", "jwt_token"];
  for (const k of lsKeys) {
    const v = localStorage.getItem(k);
    if (v && v !== "undefined" && v !== "null")
      return v.replace(/^Bearer\s+/i, "");
  }
  const cookie = document.cookie || "";
  const cookieKeys = ["accessToken", "access_token", "jwt", "jwt_token"];
  for (const ck of cookieKeys) {
    const m = cookie.match(new RegExp(`(?:^|; )${ck}=([^;]+)`));
    if (m && m[1]) return decodeURIComponent(m[1]).replace(/^Bearer\s+/i, "");
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Portal menu utilities                                                       */
/* -------------------------------------------------------------------------- */
function useOutsideClose(ref, onClose) {
  useEffect(() => {
    function h(e) {
      if (!ref.current || ref.current.contains(e.target)) return;
      onClose?.();
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, ref]);
}

function PortalMenu({ anchorRect, children, onClose }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRect) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const pad = 8, mw = 220, mh = 240;
    let left = Math.min(Math.max(pad, anchorRect.left), vw - mw - pad);
    if (anchorRect.left + mw > vw - pad) left = vw - mw - pad;
    let top = anchorRect.bottom + 6;
    if (top + mh + pad > vh) top = Math.max(pad, anchorRect.top - mh - 6);
    setPos({ top, left });
  }, [anchorRect]);

  if (!anchorRect) return null;
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      <div
        ref={ref}
        style={{ position: "fixed", top: pos.top, left: pos.left, width: 220 }}
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
function getExt(name = "") {
  const n = (name || "").toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}
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
    case "xls":
    case "xlsx": return "xls";
    case "csv": return "csv";
    case "doc":
    case "docx": return "doc";
    case "ppt":
    case "pptx": return "ppt";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg": return "image";
    case "zip":
    case "rar":
    case "7z": return "zip";
    case "json": return "json";
    case "txt":
    case "log":
    case "md": return "txt";
    case "js":
    case "ts":
    case "tsx":
    case "py":
    case "java":
    case "go":
    case "rb":
    case "php":
    case "c":
    case "cpp":
    case "cs": return "code";
    default: return "file";
  }
}

function FileIcon({ ext, mime, size = 22, className = "" }) {
  const kind = pickKind(ext, mime);
  const common = { size, className: `shrink-0 ${className}` };
  switch (kind) {
    case "pdf":   return <TbFileTypePdf {...common} className={`text-red-600 ${common.className}`} />;
    case "xls":   return <TbFileTypeXls {...common} className={`text-emerald-600 ${common.className}`} />;
    case "csv":   return <TbFileTypeCsv {...common} className={`text-teal-600 ${common.className}`} />;
    case "doc":   return <TbFileTypeDoc {...common} className={`text-blue-600 ${common.className}`} />;
    case "ppt":   return <TbFileTypePpt {...common} className={`text-orange-600 ${common.className}`} />;
    case "json":  return <TbFileTypeTxt {...common} className={`text-cyan-600 ${common.className}`} />; // label style
    case "txt":   return <TbFileTypeTxt {...common} className={`text-slate-600 ${common.className}`} />;
    case "zip":   return <TbFileZip {...common} className={`text-amber-600 ${common.className}`} />;
    case "image": return <AiFillFileImage {...common} className={`text-fuchsia-600 ${common.className}`} />;
    case "code":  return <VscFileCode {...common} className={`text-indigo-600 ${common.className}`} />;
    default:      return <AiOutlineFile {...common} className={`text-slate-700 ${common.className}`} />;
  }
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */
export default function Documents() {
  const [docs, setDocs] = useState([]);

  // Upload UX state
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const previewUrl = useMemo(
    () => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  // Share UX state
  const [shareDoc, setShareDoc] = useState(null);
  const [shareRole, setShareRole] = useState(null);
  const [shareOptions, setShareOptions] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  // Viewer (preview) state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerText, setViewerText] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // 3-dot menu
  const [menuDoc, setMenuDoc] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const token = getStoredToken();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const bytes = (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(2) + " MB" : n >= 1e3 ? (n / 1e3).toFixed(1) + " KB" : (n || 0) + " B";

  useEffect(() => { refreshDocs(); }, []);

  // paste-to-upload
  useEffect(() => {
    function onPaste(e) {
      const f = Array.from(e.clipboardData?.files || [])[0];
      if (f) setFile(f);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function refreshDocs() {
    const r = await fetch(`${API_BASE}/api/documents`, {
      credentials: "include",
      headers: { ...authHeaders },
    });
    if (r.status === 401) {
      setDocs([]);
      setMsg("Not authorized. Please sign in again.");
      return;
    }
    const j = await r.json();
    if (j.ok) setDocs(j.documents || []);
  }

  function onBrowse(e) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  }
  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false); }

  function resetSelected() {
    setFile(null);
    setTitle("");
    setProgress(0);
    setMsg("");
  }

  const ACCEPT = ".pdf,.csv,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.rar,.7z,.json,.txt,.md";

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return setMsg("Pick a file first.");
    if (file.size > 50 * 1024 * 1024) {
      setMsg("File too large. Max 50 MB.");
      return;
    }
    setBusy(true); setMsg(""); setProgress(8);
    const tick = setInterval(() => setProgress((p) => Math.min(94, p + Math.random() * 8)), 120);

    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);

    try {
      const r = await fetch(`${API_BASE}/api/documents/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
        headers: { ...authHeaders },
      });
      const j = await r.json();
      clearInterval(tick);

      if (!r.ok || !j.ok) {
        setBusy(false); setProgress(0); setMsg(j.error || "Upload failed");
        return;
      }

      setProgress(100); setMsg("Uploaded successfully.");
      setTimeout(() => { setBusy(false); resetSelected(); refreshDocs(); }, 450);
    } catch {
      clearInterval(tick);
      setBusy(false); setProgress(0); setMsg("Upload failed");
    }
  }

  /* ----------------------- Share flow (role → list → share) ---------------- */
  async function openSharePicker(doc, role) {
    setShareDoc(doc);
    setShareRole(role);
    setSelectedUserIds([]);

    const r = await fetch(
      `${API_BASE}/api/documents/share-options?role=${encodeURIComponent(role)}`,
      { credentials: "include", headers: { ...authHeaders } }
    );
    const j = await r.json();
    if (!r.ok || !j.ok) {
      setShareOptions([]); alert(j.error || "Failed to load options"); return;
    }
    setShareOptions(j.options || []);
  }
  function toggleUser(id) {
    setSelectedUserIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  async function confirmShare() {
    if (!shareDoc || !selectedUserIds.length) return;
    const r = await fetch(`${API_BASE}/api/documents/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      credentials: "include",
      body: JSON.stringify({ document_id: shareDoc.id, investor_ids: selectedUserIds }),
    });
    const j = await r.json();
    if (!j.ok) { alert(j.error || "Share failed"); return; }
    setShareDoc(null); setShareRole(null); setShareOptions([]); setSelectedUserIds([]); refreshDocs();
  }
  async function revoke(documentId, userId) {
    const r = await fetch(`${API_BASE}/api/documents/share`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders },
      credentials: "include",
      body: JSON.stringify({ document_id: documentId, investor_id: userId }),
    });
    const j = await r.json();
    if (!j.ok) return alert(j.error || "Revoke failed");
    refreshDocs();
  }

  /* ------------------------------ View / Delete ---------------------------- */
  async function openViewer(doc) {
    setViewerOpen(true);
    setViewerDoc(doc);
    setViewerUrl(null);
    setViewerText(null);
    setViewerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/documents/view/${doc.id}`, {
        headers: { ...authHeaders },
        credentials: "include",
      });
      if (!res.ok) throw new Error("View failed");
      // Decide how to show
      if ((doc.mime_type || "").startsWith("text/") || ["csv","json","txt","md"].includes(getExt(doc.original_name))) {
        const text = await res.text();
        setViewerText(text);
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setViewerUrl(url);
      }
    } catch {
      setViewerText(null);
      setViewerUrl(null);
      alert("Could not open preview. Try Download.");
    } finally {
      setViewerLoading(false);
    }
  }
  function closeViewer() {
    setViewerOpen(false);
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setViewerText(null);
    setViewerDoc(null);
  }

  async function deleteDoc(doc) {
    if (!window.confirm(`Delete “${doc.title || doc.original_name}”? This cannot be undone.`)) return;
    const r = await fetch(`${API_BASE}/api/documents/${doc.id}`, {
      method: "DELETE",
      headers: { ...authHeaders },
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) {
      alert(j.error || "Delete failed");
      return;
    }
    refreshDocs();
  }

  /* --------------------------------- UI ----------------------------------- */
  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="bg-white border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b">
          <h3 className="text-base font-semibold text-gray-800">Upload</h3>
        </div>

        {/* Pretty drag/drop uploader */}
        <form className="p-4 grid md:grid-cols-2 gap-6" onSubmit={handleUpload}>
          <div>
            <label className="block text-sm font-medium mb-2">Your file</label>

            {/* Drop area */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={[
                "relative rounded-2xl border-2 border-dashed px-5 py-6 transition-all",
                dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              {!file ? (
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center">
                    <AiOutlineCloudUpload className="text-slate-500" size={28} />
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Drag &amp; drop</span> your file here,
                    or{" "}
                    <label className="text-emerald-700 cursor-pointer hover:underline">
                      browse
                      <input type="file" accept={ACCEPT} onChange={onBrowse} className="sr-only" />
                    </label>
                  </div>
                  <div className="text-xs text-slate-500">
                    Accepted: PDF, XLS/XLSX, CSV, DOC/DOCX, PPT/PPTX, Images, ZIP, JSON, TXT (max 50&nbsp;MB)
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {/* Preview or icon */}
                  {previewUrl ? (
                    <img src={previewUrl} alt="preview" className="w-16 h-16 rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-50 flex items-center justify-center ring-1 ring-slate-200">
                      <FileIcon ext={getExt(file.name)} mime={file.type} size={28} />
                    </div>
                  )}

                  {/* Meta */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{file.name}</div>
                    <div className="text-xs text-slate-500">
                      {bytes(file.size)} • {file.type || "Unknown type"}
                    </div>

                    {/* Progress */}
                    {busy ? (
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    ) : null}
                  </div>

                  {/* Clear button */}
                  <button
                    type="button"
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-500"
                    onClick={resetSelected}
                    title="Clear"
                  >
                    <IoClose size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Title */}
            <label className="block text-sm font-medium mt-4 mb-1">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border rounded-lg p-2 w-full placeholder:text-slate-400"
              placeholder="K-1 2024 – John Doe"
            />

            {/* Status line */}
            {msg && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <IoCheckmarkCircle className="text-emerald-600" />
                <span>{msg}</span>
              </div>
            )}
          </div>

          {/* Actions panel */}
          <div className="flex flex-col justify-between">
            <div className="text-sm text-gray-600">
              Tip: You can also <span className="font-medium">paste</span> a file (Ctrl/Cmd&nbsp;+&nbsp;V) directly into this page.
            </div>

            <div className="mt-4 md:mt-0 flex items-center gap-3 md:justify-end">
              <label className="hidden md:block">
                <input type="file" accept={ACCEPT} onChange={onBrowse} className="sr-only" />
                <span className="inline-flex items-center px-3 py-2 rounded-lg border hover:bg-slate-50 cursor-pointer">
                  Choose file…
                </span>
              </label>

              <button
                disabled={!file || busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50"
              >
                <AiOutlineCloudUpload size={18} />
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
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
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <FileIcon ext={ext} mime={d.mime_type} />
                          <button
                            type="button"
                            className="text-left truncate max-w-[26ch] hover:underline"
                            title="View"
                            onClick={() => openViewer(d)}
                          >
                            {d.title}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <FileIcon ext={ext} mime={d.mime_type} />
                          <span className="truncate max-w-[32ch]" title={d.original_name}>
                            {d.original_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2">{bytes(d.size_bytes)}</td>
                      <td className="px-2 py-2">{new Date(d.uploaded_at).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {d.shares?.length ? (
                            d.shares.map((s) => (
                              <span
                                key={s.investor_user_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800"
                              >
                                User {s.investor_user_id}
                                <button
                                  title="Revoke"
                                  onClick={() => revoke(d.id, s.investor_user_id)}
                                  className="ml-1 text-blue-900 hover:text-red-600"
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => openViewer(d)}
                          >
                            View
                          </button>

                          <a
                            className="text-blue-600 hover:underline"
                            href={`${API_BASE}/api/documents/download/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download
                          </a>

                          <button
                            className="text-red-600 hover:underline"
                            onClick={() => deleteDoc(d)}
                            title="Delete"
                          >
                            Delete
                          </button>

                          {/* 3-dot menu */}
                          <button
                            className="inline-flex items-center justify-center rounded-md p-2 hover:bg-gray-100"
                            title="More"
                            onClick={(e) => {
                              setMenuDoc(d);
                              setMenuAnchor(e.currentTarget.getBoundingClientRect());
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="1.5" />
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="12" cy="19" r="1.5" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-gray-500 text-sm">No documents yet.</div>
          )}
        </div>
      </div>

      {/* Share menu (portal) */}
      {menuDoc && menuAnchor && (
        <PortalMenu
          anchorRect={menuAnchor}
          onClose={() => { setMenuDoc(null); setMenuAnchor(null); }}
        >
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
            <div className="border rounded-lg">
              <div className="max-h-[320px] overflow-auto divide-y">
                {shareOptions.length ? shareOptions.map((o) => (
                  <label key={o.user_id} className="flex items-center gap-3 px-3 py-2">
                    <input type="checkbox"
                           checked={selectedUserIds.includes(o.user_id)}
                           onChange={() => toggleUser(o.user_id)} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{o.label}</div>
                      {o.email && <div className="text-xs text-gray-500">{o.email}</div>}
                    </div>
                  </label>
                )) : (
                  <div className="px-3 py-8 text-center text-sm text-gray-500">
                    No users found for this role.
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border border-gray-300"
                      onClick={() => { setShareDoc(null); setShareRole(null); setShareOptions([]); setSelectedUserIds([]); }}>
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
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center"
             onMouseDown={closeViewer}>
          <div className="bg-white w-[92vw] max-w-5xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden"
               onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold text-gray-800 truncate">
                {viewerDoc?.title || viewerDoc?.original_name}
              </div>
              <div className="flex items-center gap-3">
                {viewerDoc && (
                  <a className="text-blue-600 hover:underline"
                     href={`${API_BASE}/api/documents/download/${viewerDoc.id}`} target="_blank" rel="noreferrer">
                    Download
                  </a>
                )}
                <button className="p-2 rounded hover:bg-slate-100" onClick={closeViewer} aria-label="Close">
                  <IoClose size={18} />
                </button>
              </div>
            </div>

            <div className="p-0 bg-slate-50 h-[75vh] overflow-hidden">
              {viewerLoading && (
                <div className="h-full grid place-items-center text-sm text-slate-600">Loading preview…</div>
              )}
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
