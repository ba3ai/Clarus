// frontend/src/pages/Investors.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import api from "../../services/api";

/* Toast (no deps) */
const ToastCtx = createContext(null);
function ToasterProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(1);
  const push = useCallback((type, message) => {
    const id = idRef.current++;
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  const t = useMemo(() => ({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  }), [push]);
  return (
    <ToastCtx.Provider value={t}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[320px] flex-col gap-2">
        {toasts.map((x) => (
          <div key={x.id}
            className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow ${
              x.type==="success"?"border-emerald-200 bg-emerald-50 text-emerald-900":
              x.type==="error"?"border-red-200 bg-red-50 text-red-900":
              "border-gray-200 bg-white text-gray-900"}`}>
            {x.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

function Investors() {
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const TYPE_OPTIONS = ["All", "IRA", "ROTH IRA", "Retirement", "Depends"];
  const [typeFilter, setTypeFilter] = useState("All");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("invite"); // invite | edit
  const [editingInvestorId, setEditingInvestorId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    investor_type: "IRA",
    depends_on_id: null, // single-select
  });

  const resetForm = () => {
    setMode("invite");
    setEditingInvestorId(null);
    setForm({ name: "", email: "", investor_type: "IRA", depends_on_id: null });
  };

  const fmtMoney = useMemo(() =>
    new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}),[]);
  const fmtDateTime = (dt) => {
    if (!dt) return "—";
    try { const d=new Date(dt); return Number.isNaN(d.getTime())?dt:d.toLocaleString(); }
    catch { return dt; }
  };

  // Load accepted invitations (+ current balance comes from API)
  const loadAccepted = useCallback(async () => {
    let alive = true;
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/api/invitations", {
        params: { status: "accepted" }, headers:{Accept:"application/json"},
      });
      if (!alive) return;
      const list = Array.isArray(data) ? data :
                   Array.isArray(data?.items) ? data.items :
                   Array.isArray(data?.data) ? data.data : [];
      const normalized = list
        .filter((it) => (it.status || "accepted").toLowerCase()==="accepted")
        .map((it) => {
          const inv = it.investor || {};
          return {
            id: it.id ?? it.invitation_id ?? inv.id ?? crypto.randomUUID(),
            investor_id: inv.id ?? null,
            name: inv.name || it.name || "",
            email: inv.email || it.email || "",
            company_name: inv.company_name || "—",
            contact_phone: inv.contact_phone || "—",
            investor_type: inv.investor_type || "—",
            parent_investor_id: inv.parent_investor_id ?? null,
            created_at: it.created_at || null,
            used_at: it.used_at || null,
            current_balance: it.current_balance ?? it.ending_balance ?? it.balance ?? null,
            balance_source: it.balance_source || null,
            balance_as_of: it.balance_as_of || null,
          };
        });
      setRows(normalized);
      setSource("/api/invitations?status=accepted");
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load accepted investors.");
      toast.error("Failed to load accepted investors.");
    } finally { setLoading(false); }
    return () => { alive = false; };
  }, [toast]);

  useEffect(() => { loadAccepted(); }, [loadAccepted]);

  const nameById = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { if (r.investor_id) m.set(Number(r.investor_id), r.name || r.email); });
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = !s || r.name.toLowerCase().includes(s)
        || r.email.toLowerCase().includes(s) || r.company_name.toLowerCase().includes(s);
      const matchesType = typeFilter==="All"
        || (r.investor_type || "").toLowerCase()===typeFilter.toLowerCase();
      return matchesSearch && matchesType;
    });
  }, [rows, q, typeFilter]);

  // Build single-select options from existing investors (exclude self in edit)
  const singleOptions = useMemo(() => {
    const currentId = Number(editingInvestorId || 0);
    return rows
      .map((r) => ({ value:Number(r.investor_id || r.id), label:r.name || r.email || `Investor ${r.id}` }))
      .filter((o) => Number.isFinite(o.value) && (!currentId || o.value !== currentId));
  }, [rows, editingInvestorId]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // INVITE — now also sends depends_on_id (if Depends)
  const sendInvite = async () => {
    await api.post("/admin/invite", {
      email: form.email.trim(),
      name: form.name.trim(),
      user_type: "investor",
      investor_type: form.investor_type,
      // harmless if backend ignores; useful if you wire it to accept/attach later
      ...(form.investor_type === "Depends" && form.depends_on_id
        ? { depends_on_id: form.depends_on_id }
        : {}),
    }, { headers: { "Content-Type": "application/json" } });
  };

  // EDIT — still updates and enforces single dependent on backend
  const updateInvestor = async (investorId) => {
    await api.put(`/api/investors/${investorId}`, {
      name: form.name.trim(),
      email: form.email.trim(),
      investor_type: form.investor_type,
      depends_on_ids:
        form.investor_type === "Depends" && form.depends_on_id ? [form.depends_on_id] : [],
    }, { headers: { "Content-Type": "application/json" } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Please provide both Name and Email."); return;
    }
    // NEW: require a dependent when type === Depends
    if (form.investor_type === "Depends") {
      if (singleOptions.length === 0) {
        toast.error("No existing investors to select as a dependent. Create one first.");
        return;
      }
      if (!form.depends_on_id) {
        toast.error("Please select one dependent investor."); return;
      }
    }
    setSaving(true);
    try {
      if (mode === "invite") {
        await sendInvite();
        toast.success(`Invitation sent to ${form.email}.`);
      } else if (mode === "edit" && editingInvestorId) {
        await updateInvestor(editingInvestorId);
        toast.success("Investor updated.");
      }
      await loadAccepted();
      resetForm(); setOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.msg || err?.response?.data?.error || err?.message || "Action failed.");
    } finally { setSaving(false); }
  };

  const onEdit = (row) => {
    setMode("edit");
    setEditingInvestorId(row.investor_id || row.id);
    setForm({
      name: row.name || "",
      email: row.email || "",
      investor_type: row.investor_type || "IRA",
      depends_on_id: null,
    });
    setOpen(true);
  };

  const onDelete = async (row) => {
    const id = row.investor_id || row.id;
    if (!id) { toast.error("Missing investor id."); return; }
    if (!confirm(`Delete investor "${row.name || row.email}"?`)) return;
    try { await api.delete(`/api/investors/${id}`); await loadAccepted(); toast.success("Investor deleted."); }
    catch (err) { toast.error(err?.response?.data?.error || err?.message || "Delete failed."); }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Investors (Invitation Accepted)</h2>
        <div className="flex items-center gap-3">
          <select className="rounded-lg border px-3 py-2 text-sm" value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)} title="Filter by type">
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            type="button"
            onClick={() => { resetForm(); setMode("invite"); setOpen(true); }}
            className="rounded-xl border bg-black px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 active:opacity-80">
            + Add Investor
          </button>
        </div>
      </div>

      <div className="mb-2 text-sm text-gray-500">{source ? `Source: ${source}` : ""}</div>

      <div className="mb-4 flex gap-3">
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, company, or email…" className="w-full max-w-sm rounded-lg border px-3 py-2 outline-none focus:ring"/>
      </div>

      {loading && <div className="rounded-lg border p-6 text-gray-600">Loading…</div>}
      {!loading && error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Investor</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Parent</th>
                <th className="px-4 py-3 font-medium">Invited On</th>
                <th className="px-4 py-3 font-medium">Accepted On</th>
                <th className="px-4 py-3 font-medium">Current Balance</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const money = r.current_balance==null ? "—" : fmtMoney.format(Number(r.current_balance));
                const parentName = r.parent_investor_id && nameById.get(Number(r.parent_investor_id))
                  ? nameById.get(Number(r.parent_investor_id))
                  : r.parent_investor_id ? `#${r.parent_investor_id}` : "—";
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{r.name || "—"}</td>
                    <td className="px-4 py-3">{r.company_name || "—"}</td>
                    <td className="px-4 py-3">{r.email || "—"}</td>
                    <td className="px-4 py-3">{r.contact_phone || "—"}</td>
                    <td className="px-4 py-3">{r.investor_type || "—"}</td>
                    <td className="px-4 py-3">{parentName}</td>
                    <td className="px-4 py-3">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-3">{fmtDateTime(r.used_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span>{money}</span>
                        {r.balance_as_of && <span className="text-xs text-gray-500">as of {fmtDateTime(r.balance_as_of)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onEdit(r)}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50" title="Edit">Edit</button>
                        <button type="button" onClick={() => onDelete(r)}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50" title="Delete">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length===0 && (
                <tr><td className="px-4 py-6 text-gray-600" colSpan={10}>No investors found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => (!saving ? setOpen(false) : null)} />
          <div className="relative z-[61] w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{mode==="edit"?"Edit Investor":"Invite Investor"}</h3>
              <button onClick={() => (!saving ? setOpen(false) : null)}
                className="rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100" title="Close" type="button">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <input name="name" type="text" value={form.name} onChange={onChange}
                  placeholder="Investor full name" className="w-full rounded-lg border px-3 py-2 outline-none focus:ring" required />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input name="email" type="email" value={form.email} onChange={onChange}
                  placeholder="email@example.com" className="w-full rounded-lg border px-3 py-2 outline-none focus:ring" required />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Investor Type</label>
                <select name="investor_type" value={form.investor_type} onChange={onChange}
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:ring">
                  <option value="IRA">IRA</option>
                  <option value="ROTH IRA">ROTH IRA</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Depends">Depends</option>
                </select>
              </div>

              {/* NEW: also show picker in INVITE mode (if there are investors) */}
              {form.investor_type === "Depends" && (
                singleOptions.length > 0 ? (
                  <SingleSelectDropdown
                    label="Dependent investor (required)"
                    options={singleOptions}
                    value={form.depends_on_id}
                    onChange={(id) => setForm((f) => ({ ...f, depends_on_id: id }))}
                  />
                ) : (
                  <p className="text-xs text-red-600">
                    No existing investors found. Create at least one investor first to set as dependent.
                  </p>
                )
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => (!saving ? setOpen(false) : null)}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50" disabled={saving}>Cancel</button>
                <button type="submit"
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-60"
                  disabled={saving}>
                  {saving ? (mode==="edit"?"Saving…":"Sending…") : (mode==="edit"?"Update":"Send Invite")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SingleSelectDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    function onDoc(e){ if (!boxRef.current) return; if (!boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const selected = options.find((o) => o.value === value) || null;
  const buttonText = selected ? selected.label : "Select an investor…";
  return (
    <div className="relative" ref={boxRef}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <button type="button" className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm outline-none focus:ring"
        onClick={() => setOpen((v) => !v)}>
        <span className="truncate">{buttonText}</span>
        <svg className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.585l3.71-3.354a.75.75 0 111.02 1.1l-4.22 3.81a.75.75 0 01-1.02 0l-4.22-3.81a.75.75 0 01-.02-1.06z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow">
          <div className="max-h-60 overflow-auto py-1">
            {options.map((o) => (
              <label key={o.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => { onChange(o.value); setOpen(false); }}>
                <input type="radio" name="single-select" checked={value === o.value} onChange={() => {}} className="h-4 w-4" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">No investors found.</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2 text-xs">
            {value !== null && (
              <button type="button" onClick={() => onChange(null)} className="rounded border px-2 py-1 hover:bg-gray-50">Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Wrap page with toaster */
export default function InvestorsPage() {
  return (
    <ToasterProvider>
      <Investors />
    </ToasterProvider>
  );
}
