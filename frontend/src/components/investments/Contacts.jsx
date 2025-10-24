import React, { useEffect, useMemo, useState } from "react";

/**
 * Contacts.jsx (wired to backend)
 * - Loads contacts via GET /api/contacts/:investorId
 * - Server-side search (?q=)
 * - Add contact via POST /api/contacts/:investorId
 * - Export CSV of the currently displayed rows
 * - Show/Hide columns menu
 *
 * Auth: sends Authorization: Bearer <token> if found in localStorage.
 * Investor selection:
 *   - URL ?investorId=123  (preferred)
 *   - localStorage.currentInvestorId
 *   - fallback: 1 (dev)
 */

const DEFAULT_COLUMNS = [
  { key: "name", label: "NAME", visible: true },
  { key: "email", label: "EMAIL", visible: true },
  { key: "phone", label: "PHONE", visible: true },
  { key: "notes", label: "NOTES", visible: true },
];

function resolveInvestorId() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("investorId");
    const fromStorage = localStorage.getItem("currentInvestorId");
    return Number(fromQuery || fromStorage || 1);
  } catch {
    return 1;
  }
}

function authHeader() {
  const token = localStorage.getItem("access_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Contacts() {
  const investorId = resolveInvestorId();

  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Debounced server-side load on query change
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/contacts/${investorId}?q=${encodeURIComponent(query)}&page=1&page_size=200`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...authHeader(),
            },
            credentials: "include",
          }
        );
        if (!res.ok) {
          const msg = await safeMessage(res);
          throw new Error(msg || `Failed to load contacts (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setContacts(Array.isArray(data?.data) ? data.data : []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load contacts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [investorId, query]);

  const visibleCols = useMemo(() => columns.filter((c) => c.visible), [columns]);

  function toggleColumn(key) {
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  }

  function exportCSV() {
    const cols = visibleCols;
    const header = cols.map((c) => c.label).join(",");
    const lines = contacts.map((row) =>
      cols
        .map((c) => {
          const val = row[c.key] ?? "";
          const escaped = String(val).replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 py-4">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by anything"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
            />
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 opacity-50"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 21l-4.3-4.3" />
              <circle cx="10" cy="10" r="7" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Export */}
          <button
            onClick={exportCSV}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[.99]"
            title="Export CSV"
          >
            Export
          </button>

          {/* Hide Columns menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((s) => !s)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[.99]"
              title="Show / hide columns"
            >
              Hide columns
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <div className="p-2 text-xs font-semibold text-gray-500">
                  Columns
                </div>
                <div className="max-h-64 overflow-auto p-2">
                  {columns.map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={c.visible}
                        onChange={() => toggleColumn(c.key)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Contact */}
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2B86C5] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-[.99]"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/20">
              +
            </span>
            Add Contact
          </button>
        </div>
      </div>

      {/* Table / Empty state card */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        {/* header row */}
        <div className="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold tracking-wide text-gray-500">
          {visibleCols.map((c) => (
            <div key={c.key} className="col-span-3 first:col-span-3">
              {c.label}
            </div>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center p-8">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex min-h-[220px] items-center justify-center p-8">
            <span className="text-sm text-red-500">{error}</span>
          </div>
        ) : contacts.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {contacts.map((row) => (
              <div
                key={row.id ?? `${row.name}-${row.email}`}
                className="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-4 px-5 py-4 text-sm"
              >
                {visibleCols.map((c) => (
                  <div key={c.key} className="col-span-3 first:col-span-3">
                    {row[c.key] || <span className="text-gray-400">—</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <p className="max-w-2xl text-base font-semibold text-gray-700">
              Please add anyone here you would like copied on correspondence
              such as emails and invoices.
            </p>
            <p className="text-sm text-gray-400">Nothing to display</p>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showModal && (
        <AddContactModal
          investorId={investorId}
          onClose={() => setShowModal(false)}
          onCreated={(created) => {
            // Prepend freshly created contact
            setContacts((prev) => [created, ...prev]);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddContactModal({ investorId, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and Email are required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/contacts/${investorId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const msg = await safeMessage(res);
        throw new Error(msg || `Failed to create contact (${res.status})`);
      }
      const data = await res.json();
      onCreated?.(data?.data || null);
    } catch (e) {
      setError(e.message || "Failed to create contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-50 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add Contact</h3>
          <button
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Field
            label="Name"
            value={form.name}
            onChange={(v) => setForm((s) => ({ ...s, name: v }))}
            placeholder="Jane Cooper"
            required
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm((s) => ({ ...s, email: v }))}
            placeholder="jane@example.com"
            required
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(v) => setForm((s) => ({ ...s, phone: v }))}
            placeholder="+1 555 0123"
          />
          <Field
            label="Notes"
            as="textarea"
            value={form.notes}
            onChange={(v) => setForm((s) => ({ ...s, notes: v }))}
            placeholder="Optional notes…"
          />
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-[#2B86C5] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  as = "input",
  type = "text",
  required = false,
}) {
  const InputTag = as;
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <InputTag
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none ring-0 placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100 ${
          as === "textarea" ? "min-h-[88px]" : ""
        }`}
      />
    </label>
  );
}

/** Safely read JSON error messages from API responses */
async function safeMessage(res) {
  try {
    const t = await res.text();
    const j = JSON.parse(t);
    return j?.error || j?.message || t;
  } catch {
    return null;
  }
}
