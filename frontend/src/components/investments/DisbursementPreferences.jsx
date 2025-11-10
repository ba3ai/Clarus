import React, { useEffect, useState } from "react";

/**
 * Disbursement Preferences
 * - Segment-style radio group: Wire transfer / Check / Other
 * - "Other Details" textarea
 * - Edit / Save / Cancel UX consistent with other cards
 *
 * NOTE: Swap the fetch() URLs to your real backend endpoints when ready.
 * Suggested endpoints:
 *   GET  /investor/disbursement-preferences
 *   POST /investor/disbursement-preferences
 */

const METHODS = [
  { id: "wire",  label: "Wire transfer" },
  { id: "check", label: "Check" },
  { id: "other", label: "Other" },
];

export default function DisbursementPreferences() {
  const [edit, setEdit] = useState(false);
  const [method, setMethod] = useState("other"); // default matches screenshot
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  // Load saved value (optional)
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    (async () => {
      try {
        const res = await fetch("/investor/disbursement-preferences", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.method) setMethod(json.method);
          if (json?.details) setDetails(json.details);
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch("/investor/disbursement-preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ method, details }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEdit(false);
    } catch {
      alert("Unable to save disbursement preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">
            How do you want to receive disbursements?
          </h2>

          {!edit ? (
            <button
              onClick={() => setEdit(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Edit disbursement preferences"
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
                onClick={() => setEdit(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Method segmented control */}
        <div className="px-6 py-5">
          <div className="flex gap-3">
            {METHODS.map((m) => {
              const active = method === m.id;
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-slate-800 ${
                    active ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50"
                  } ${!edit ? "opacity-70" : "hover:bg-slate-100"}`}
                >
                  <input
                    type="radio"
                    name="disbursement-method"
                    className="h-4 w-4"
                    checked={active}
                    onChange={() => edit && setMethod(m.id)}
                    disabled={!edit}
                  />
                  {m.label}
                </label>
              );
            })}
          </div>

          {/* Other details */}
          <div className="mt-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Other Details
            </label>
            <textarea
              className="w-full min-h-[140px] rounded-lg border border-slate-300 bg-slate-50 p-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder=""
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={!edit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
