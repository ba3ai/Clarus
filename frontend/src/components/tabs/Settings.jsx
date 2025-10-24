// frontend/src/components/tabs/Settings.jsx
import React, { useEffect, useState } from 'react';

const API_BASE = "/api/settings";

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");

  const fetchLogo = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/logo`);
      const data = await res.json();
      setLogoUrl(data.url || null);
    } catch (e) {
      console.error(e);
      setMessage("Failed to load current logo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogo(); }, []);

  const onFileChange = (e) => setFile(e.target.files?.[0] || null);

  const onUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setMessage("Choose an image first.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/logo`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogoUrl(data.url);
      setFile(null);
      setMessage("Logo updated.");
    } catch (e) {
      console.error(e);
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRemove = async () => {
    if (!window.confirm("Remove the current logo?")) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/logo`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setLogoUrl(null);
      setMessage("Logo removed.");
    } catch (e) {
      console.error(e);
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">Settings</h2>

      <div className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="text-base font-semibold mb-3">Statement Branding</h3>

        <div className="flex items-start gap-6">
          <div className="w-40 h-40 border rounded-md flex items-center justify-center bg-gray-50">
            {logoUrl ? (
              <img src={logoUrl} alt="Current logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-gray-400 text-sm">No Logo</span>
            )}
          </div>

          <form onSubmit={onUpload} className="flex-1 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upload New Logo</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp, image/svg+xml"
                onChange={onFileChange}
                className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              <p className="text-xs text-gray-500 mt-1">Recommended: transparent PNG, at least 200×200 px.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save Logo"}
              </button>

              <button
                type="button"
                disabled={loading || !logoUrl}
                onClick={onRemove}
                className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Remove
              </button>

              <button
                type="button"
                onClick={fetchLogo}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Refresh
              </button>
            </div>

            {message && <p className="text-sm text-gray-700">{message}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
