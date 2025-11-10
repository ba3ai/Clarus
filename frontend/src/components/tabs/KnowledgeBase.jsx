// frontend/src/components/tabs/KnowledgeBase.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CloudUpload,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Files,
  Trash2,
  File as FileIcon,
} from "lucide-react";

export default function KnowledgeBase() {
  const [busy, setBusy] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [items, setItems] = useState([]); // server-backed items [{id,name,size,created}]
  const inputRef = useRef(null);

  const authHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const prettySize = (n) => {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const prettyTime = (t) => {
    if (!t) return "";
    try {
      const d = new Date(t * 1000);
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  const fetchList = async () => {
    try {
      const res = await fetch("/api/kb/list", {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      const j = await res.json();
      if (res.ok) {
        setItems(j.items || []);
      } else {
        console.error(j);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchList(); // load on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/kb/upload", {
            method: "POST",
            body: form,
            credentials: "include",
            headers: { ...authHeaders() },
          });
          const j = await res.json();
          if (!res.ok) {
            console.error(j);
          }
        } catch (err) {
            console.error(err);
        }
      }
      // refresh list after all uploads
      await fetchList();
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e) => handleFiles(Array.from(e.target.files || []));
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setHovering(false);
      const files = Array.from(e.dataTransfer?.files || []);
      handleFiles(files);
    },
    [] // eslint-disable-line
  );

  const onDelete = async (id) => {
    if (!window.confirm("Delete this file from your knowledge base?")) return;
    try {
      const res = await fetch(`/api/kb/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { ...authHeaders() },
      });
      const j = await res.json();
      if (res.ok) {
        setItems(j.items || []);
      } else {
        alert(j.error || "Delete failed");
      }
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-white border rounded-2xl shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload any file. We <span className="font-medium">only</span> keep the embeddings (never the file).
              Your chatbot answers strictly from <span className="font-medium">your</span> indexed content.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                <Files size={14} /> txt • md • csv • xlsx • pdf • docx • pptx • …
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <Shield size={14} /> Per-user isolated index
              </span>
            </div>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border hover:bg-gray-50 text-gray-700"
            title="Upload files"
          >
            <CloudUpload size={16} /> Upload
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setHovering(true);
          }}
          onDragLeave={() => setHovering(false)}
          onDrop={onDrop}
          className={`mt-5 rounded-xl border-2 border-dashed ${
            hovering ? "border-blue-400 bg-blue-50/40" : "border-gray-300 bg-gray-50"
          }`}
        >
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className={`rounded-full p-3 ${hovering ? "bg-blue-100" : "bg-white border"}`}>
              {busy ? <Loader2 className="animate-spin text-blue-600" size={22} /> : <CloudUpload size={22} className="text-blue-600" />}
            </div>
            <p className="mt-3 text-sm text-gray-800">
              Drag & drop files here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-blue-700 font-medium hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-500 mt-1">Multiple files supported. Max recommended 50 MB per file.</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} />
          </div>
        </div>
      </div>

      {/* Activity (server list) */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Activity</h3>
          <button
            onClick={fetchList}
            className="text-xs px-2 py-1 rounded-md border hover:bg-gray-50 text-gray-700"
          >
            Refresh
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No uploads yet. Drop a few files above to start indexing.</div>
        ) : (
          <ul className="divide-y">
            {items.map((m) => (
              <li key={m.id} className="px-5 py-3 flex items-start gap-3">
                <div className="mt-0.5">
                  <CheckCircle2 className="text-emerald-600" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileIcon size={16} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-900 truncate">{m.name}</span>
                    <span className="text-xs text-gray-500">• {prettySize(m.size)}</span>
                    <span className="text-xs text-gray-400">• {prettyTime(m.created)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    ID: <span className="font-mono">{m.id}</span>
                  </div>
                </div>
                <button
                  onClick={() => onDelete(m.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border text-rose-700 hover:bg-rose-50"
                  title="Delete from knowledge base"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-gray-500">
        Tip: After uploading, open the chat and ask naturally. The bot retrieves from your user-scoped FAISS index.
      </p>
    </div>
  );
}
