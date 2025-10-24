import React, { useEffect, useState } from "react";

/**
 * Accreditation tab
 * - Shows current accreditation status banner
 * - Radio-group to pick an accreditation criterion
 * - Edit/Save/Cancel UX (same look & feel as your other cards)
 *
 * NOTE: Replace the fetch() URL with your real API when ready.
 */
const options = [
  { id: "inv_5m", label: "I have at least $5M in investments" },
  { id: "assets_2_5m", label: "I have between $2.2M and $5M in assets" },
  { id: "assets_1_2_2m", label: "I have between $1M and $2.2M in assets" },
  { id: "income", label: "I have income of $200k (or $300k jointly with spouse) for the past 2 years and expect the same this year" },
  { id: "license", label: "I am a Series 7, Series 65, or Series 82 holder and my license is active and in good standing" },
  { id: "not_yet", label: "I'm not accredited yet" },
];

function computeAccredited(selectedId) {
  if (!selectedId || selectedId === "not_yet") return false;
  return true;
}

export default function Accreditation() {
  const [edit, setEdit] = useState(false);
  const [selected, setSelected] = useState("not_yet"); // default until fetched
  const [saving, setSaving] = useState(false);
  const accredited = computeAccredited(selected);

  // Load saved value (optional: swap URL to your backend)
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    (async () => {
      try {
        const res = await fetch("/investor/accreditation", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { selection } = await res.json();
          if (selection) setSelected(selection);
        }
      } catch (_) {}
    })();
  }, []);

  async function save() {
    setSaving(true);
    const token = localStorage.getItem("accessToken");
    try {
      const res = await fetch("/investor/accreditation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ selection: selected, accredited }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEdit(false);
    } catch (err) {
      alert("Unable to save accreditation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">Accreditation Status</h2>
          {!edit ? (
            <button
              onClick={() => setEdit(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

        {/* Status Banner */}
        <div className="px-6 pt-5">
          {accredited ? (
            <div className="rounded-lg bg-green-600/95 text-white px-4 py-3 shadow-inner">
              <div className="text-lg font-semibold">Accredited</div>
              <div className="text-sm opacity-90">
                You meet the criteria to be an accredited investor.
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-red-700/95 text-white px-4 py-3 shadow-inner">
              <div className="text-lg font-semibold">Not Accredited</div>
              <div className="text-sm opacity-90">
                You do not meet the criteria to be an accredited investor.
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="px-6 py-5">
          <fieldset className="space-y-3">
            {options.map(opt => (
              <label key={opt.id} className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="accreditation"
                  className="mt-1 h-4 w-4"
                  checked={selected === opt.id}
                  onChange={() => edit && setSelected(opt.id)}
                  disabled={!edit}
                />
                <span className="text-slate-800">{opt.label}</span>
              </label>
            ))}
          </fieldset>

          {!edit && (
            <p className="mt-4 text-xs text-slate-500">
              Edit to update your accreditation. Your selection determines the banner above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
