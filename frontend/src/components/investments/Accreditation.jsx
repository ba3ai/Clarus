// src/pages/investments/Accreditation.jsx
import React, { useEffect, useState } from "react";
import api from "../../services/api"; // axios instance (withCredentials + XSRF)

const options = [
  { id: "inv_5m", label: "I have at least $5M in investments" },
  { id: "assets_2_5m", label: "I have between $2.2M and $5M in assets" },
  { id: "assets_1_2_2m", label: "I have between $1M and $2.2M in assets" },
  { id: "income", label: "I have income of $200k (or $300k jointly with spouse) for the past 2 years and expect the same this year" },
  { id: "license", label: "I am a Series 7, Series 65, or Series 82 holder and my license is active and in good standing" },
  { id: "not_yet", label: "I'm not accredited yet" },
];

const isAccreditedId = (id) => !!(id && id !== "not_yet");

export default function Accreditation({ onAccredited }) {
  const [edit, setEdit] = useState(false);
  const [selected, setSelected] = useState("not_yet");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Absolute path to match backend blueprint: /api/investor/accreditation
        const { data } = await api.get(`/api/investor/accreditation`, {
          headers: { Accept: "application/json" },
        });
        if (!alive) return;
        if (data && data.selection) {
          setSelected(data.selection);
          // If already accredited, notify parent so it can unlock tabs immediately
          if (isAccreditedId(data.selection)) {
            onAccredited?.(true);
          } else {
            onAccredited?.(false);
          }
        } else {
          // no record yet
          onAccredited?.(false);
        }
      } catch (e) {
        if (!alive) return;
        const msg =
          e?.response?.data?.error ||
          (e?.response ? `Load failed (${e.response.status})` : "Unable to load accreditation.");
        setError(msg);
        // Be conservative: treat as not accredited while failing closed
        onAccredited?.(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [onAccredited]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const accredited = isAccreditedId(selected);
      await api.post(`/api/investor/accreditation`, {
        selection: selected,
        accredited,
      });
      setEdit(false);
      // Inform parent so it can unlock navigation immediately
      onAccredited?.(accredited);
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        (e?.response ? `Save failed (${e.response.status})` : "Unable to save accreditation.");
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const accredited = isAccreditedId(selected);

  return (
    <div className="max-w-4xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">Accreditation Status</h2>
          {!edit ? (
            <button
              onClick={() => setEdit(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={loading}
            >
              Edit
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEdit(false); setError(""); }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {!loading && error && (
          <div className="px-6 pt-4">
            <div className="rounded-lg bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2 text-sm">
              {error}
            </div>
          </div>
        )}

        <div className="px-6 pt-5">
          {loading ? (
            <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
          ) : accredited ? (
            <div className="rounded-lg bg-green-600/95 text-white px-4 py-3 shadow-inner">
              <div className="text-lg font-semibold">Accredited</div>
              <div className="text-sm opacity-90">You meet the criteria to be an accredited investor.</div>
            </div>
          ) : (
            <div className="rounded-lg bg-red-700/95 text-white px-4 py-3 shadow-inner">
              <div className="text-lg font-semibold">Not Accredited</div>
              <div className="text-sm opacity-90">You do not meet the criteria to be an accredited investor.</div>
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          <fieldset className="space-y-3">
            {options.map((opt) => (
              <label key={opt.id} className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="accreditation"
                  className="mt-1 h-4 w-4"
                  checked={selected === opt.id}
                  onChange={() => edit && setSelected(opt.id)}
                  disabled={!edit || loading}
                />
                <span className="text-slate-800">{opt.label}</span>
              </label>
            ))}
          </fieldset>

          {!edit && !loading && (
            <p className="mt-4 text-xs text-slate-500">
              Edit to update your accreditation. Your selection determines the banner above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
