// frontend/components/QuickBooks.jsx
import React, { useState, useEffect, useMemo } from "react";
import api from "../../services/api";

const Badge = ({ children, tone = "slate" }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-${tone}-100 text-${tone}-800`}
  >
    {children}
  </span>
);

const Stat = ({ label, value, sub }) => (
  <div className="flex-1 rounded-2xl bg-white shadow-sm border p-4">
    <div className="text-sm text-gray-500">{label}</div>
    <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
    {sub ? <div className="text-xs text-gray-400 mt-1">{sub}</div> : null}
  </div>
);

const MonthInput = ({ label, value, onChange, min, max }) => (
  <label className="flex items-center gap-2 text-sm">
    <span className="text-slate-600">{label}</span>
    <input
      type="month"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1 text-sm"
    />
  </label>
);

const QuickBooksDashboard = () => {
  // Legacy fields (kept for compatibility)
  const [quickbooksApi, setQuickbooksApi] = useState("");
  const [description, setDescription] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // Connection state
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [realmId, setRealmId] = useState(null);
  const [environment, setEnvironment] = useState(null); // sandbox | production

  // Customers (sanity check)
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState("");

  // Sync range + state
  const today = useMemo(() => new Date(), []);
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [today]);

  const [fromMonth, setFromMonth] = useState(defaultFrom);
  const [toMonth, setToMonth] = useState(defaultTo);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState("");

  // Derived stats
  const customerCount = customers?.length || 0;
  const totalBalances = useMemo(() => {
    try {
      return customers.reduce((acc, c) => acc + (Number(c.Balance) || 0), 0);
    } catch {
      return 0;
    }
  }, [customers]);

  useEffect(() => {
    checkConnection();
    fetchExistingApi();
  }, []);

  const checkConnection = async () => {
    try {
      const res = await api.get("/api/qbo/customers");
      setConnected(true);
      const q = res?.data?.QueryResponse;
      const list = q?.Customer || [];
      setCustomers(list);
      setRealmId(res?.data?.realmId || null);
      setEnvironment(res?.data?.environment || null);
    } catch {
      setConnected(false);
      setCustomers([]);
      setRealmId(null);
      setEnvironment(null);
    }
  };

  // ---- Legacy admin save (kept) ----
  const fetchExistingApi = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/quickbooks-api");
      if (res.data?.api) {
        const entry = {
          id: Date.now(),
          apiKey: res.data.api,
          description: "Fetched from DB",
          timestamp: new Date().toLocaleString(),
        };
        setHistory([entry]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!quickbooksApi.trim()) {
      alert("Please enter the QuickBooks API");
      return;
    }
    try {
      await api.post("/api/admin/quickbooks-api", { api: quickbooksApi, description });
      const newEntry = {
        id: Date.now(),
        apiKey: quickbooksApi,
        description,
        timestamp: new Date().toLocaleString(),
      };
      setHistory([newEntry, ...history]);
      setQuickbooksApi("");
      setDescription("");
      alert("QuickBooks API saved successfully!");
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Save failed.");
    }
  };

  // ---- Connect / Disconnect ----
  const handleConnect = async () => {
    try {
      setConnecting(true);
      const res = await api.get("/api/qbo/connect");
      const { url } = res.data || {};
      if (url) {
        window.location.href = url;
      } else {
        alert("Failed to start QuickBooks connect.");
        setConnecting(false);
      }
    } catch (e) {
      alert("Please sign in first, then try connecting.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connected) return;
    const ok = window.confirm("Disconnect QuickBooks for this workspace?");
    if (!ok) return;
    try {
      setDisconnecting(true);
      await api.post("/api/qbo/disconnect", { realmId });
      setConnected(false);
      setRealmId(null);
      setEnvironment(null);
      setCustomers([]);
      setCustomerError("");
    } catch (e) {
      console.error(e);
      alert("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  // ---- Test customers fetch ----
  const handleFetchCustomers = async () => {
    setLoadingCustomers(true);
    setCustomerError("");
    try {
      const res = await api.get("/api/qbo/customers");
      const data = res.data;
      if (data?.Fault) {
        setCustomerError(data.Fault?.Error?.[0]?.Message || "Failed to fetch customers");
        setCustomers([]);
      } else {
        const list = data?.QueryResponse?.Customer || [];
        setCustomers(list);
        setRealmId(data?.realmId || realmId);
        setEnvironment(data?.environment || environment);
      }
    } catch {
      setCustomerError("Not connected or insufficient permissions.");
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // ---- NEW: Full sync (all entities -> qbo_entities) ----
  const handleFullSync = async () => {
    if (!connected) {
      alert("Connect QuickBooks first.");
      return;
    }
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      // If you want all-time, you can omit from/to and let the backend default.
      // Here we pass a window based on the month pickers for transaction-heavy entities.
      const body = {
        from: fromMonth ? `${fromMonth}-01` : undefined,
        to:   toMonth   ? `${toMonth}-28`   : undefined,
        // entities: [...] // Optional: send a subset; omit to fetch all supported types
      };
      const res = await api.post("/api/qbo/full-sync", body);
      setSyncResult(res.data || { ok: true });
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Full sync failed.";
      setSyncError(String(msg));
    } finally {
      setSyncing(false);
    }
  };

  // ---- Optional: monthly rollups (kept for legacy button) ----
  const handleMonthlyRollup = async () => {
    if (!connected) {
      alert("Connect QuickBooks first.");
      return;
    }
    if (!fromMonth || !toMonth) {
      alert("Select a valid From/To month range.");
      return;
    }
    if (fromMonth > toMonth) {
      alert("From month cannot be after To month.");
      return;
    }
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      const res = await api.post("/api/qbo/periods/sync", { from: fromMonth, to: toMonth });
      setSyncResult(res.data || { ok: true });
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Sync failed.";
      setSyncError(String(msg));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-8">
      {/* Header / KPIs */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">QuickBooks Online</h1>
            <p className="text-slate-500 text-sm mt-1">
              Connect your QBO company and sync your data to the database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={connected ? "emerald" : "rose"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
            {environment ? <Badge tone="blue">{environment}</Badge> : null}
            {realmId ? <Badge tone="violet">Realm: {realmId}</Badge> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Customers" value={customerCount} sub={connected ? "from QBO" : "—"} />
          <Stat
            label="Total Balance"
            value={totalBalances.toFixed(2)}
            sub={connected ? "across customers" : "—"}
          />
          <Stat label="Status" value={connected ? "Linked" : "Awaiting link"} sub={connected ? "ready to sync" : "click connect"} />
        </div>
      </div>

      {/* Connect / Disconnect Card */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" className="text-slate-700">
                <path
                  fill="currentColor"
                  d="M7 6v6a5 5 0 1 0 10 0V6h2V4h-4v8a3 3 0 1 1-6 0V4H5v2h2z"
                />
              </svg>
              <span className="font-semibold text-slate-800">QuickBooks connection</span>
            </div>
            {connected ? <span className="text-xs text-emerald-600">You’re connected</span> : null}
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">
              We use Intuit’s secure OAuth flow. Click connect, approve access, and you’ll return here automatically.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {!connected ? (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 shadow transition"
                >
                  {connecting ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                          opacity="0.25"
                        />
                        <path
                          d="M22 12a10 10 0 0 1-10 10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                      </svg>
                      Connecting…
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M10 3H5a2 2 0 0 0-2 2v5h2V5h5V3zm4 0h5a2 2 0 0 1 2 2v5h-2V5h-5V3zM3 14v5a2 2 0 0 0 2 2h5v-2H5v-5H3zm18 0v5a2 2 0 0 1-2 2h-5v-2h5v-5h2z"
                        />
                      </svg>
                      Connect to QuickBooks
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 shadow transition"
                  title="Revoke the connection and remove stored tokens"
                >
                  {disconnecting ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                          opacity="0.25"
                        />
                        <path
                          d="M22 12a10 10 0 0 1-10 10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                      </svg>
                      Disconnecting…
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M18 7l-1.41-1.41L12 10.17 7.41 5.59 6 7l4.59 4.59L6 16.17 7.41 17.6 12 13l4.59 4.59L18 16.17l-4.59-4.58L18 7z"
                        />
                      </svg>
                      Disconnect
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleFetchCustomers}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-800 px-4 py-2 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12 6v6l4 2-.5 1L11 13V6h1z" />
                </svg>
                Test fetch customers
              </button>

              {!connected ? (
                <span className="text-xs text-slate-500">Tip: You’ll be redirected to Intuit and then back here.</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Optional: admin note box */}
        <div className="bg-white rounded-2xl shadow-sm border">
          <div className="px-6 py-4 border-b font-semibold text-slate-800">(Optional) Admin API Notes</div>
          <div className="p-6 space-y-3">
            <label className="block text-sm font-medium text-slate-700">QuickBooks API</label>
            <input
              type="text"
              value={quickbooksApi}
              onChange={(e) => setQuickbooksApi(e.target.value)}
              placeholder="Enter QuickBooks API"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a note"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <button
              onClick={handleSave}
              className="w-full rounded-xl bg-slate-900 hover:bg-black text-white py-2 text-sm transition"
            >
              Save note
            </button>
          </div>
        </div>
      </div>

      {/* NEW: Data sync actions */}
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Sync data to DB</h2>
          <div className="flex items-center gap-4">
            <MonthInput label="From" value={fromMonth} onChange={setFromMonth} max={toMonth || undefined} />
            <MonthInput label="To" value={toMonth} onChange={setToMonth} min={fromMonth || undefined} />

            {/* Primary: Full sync of ALL entities into qbo_entities */}
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm transition disabled:opacity-60"
              onClick={handleFullSync}
              disabled={!connected || syncing}
              title={connected ? "Dump all QBO entities into qbo_entities" : "Connect QuickBooks first"}
            >
              {syncing ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
                  </svg>
                  Full syncing…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M5 13h14v-2H5v2z" />
                  </svg>
                  Full sync (all entities)
                </>
              )}
            </button>

            {/* Secondary: optional monthly rollups */}
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2 text-sm transition disabled:opacity-60"
              onClick={handleMonthlyRollup}
              disabled={!connected || syncing}
              title="Optional: write one roll-up row per month to qbo_period_metrics"
            >
              Monthly rollup
            </button>
          </div>
        </div>

        {syncError && <p className="text-rose-600 text-sm mb-2">{syncError}</p>}
        {syncResult ? (
          <div className="rounded border bg-slate-50 p-3 text-xs overflow-x-auto">
            <pre className="whitespace-pre-wrap">{JSON.stringify(syncResult, null, 2)}</pre>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            <strong>Full sync</strong> will store all supported QuickBooks entities into{" "}
            <code>qbo_entities</code> and record a summary in <code>qbo_sync_logs</code>. Use the month
            pickers to hint a date window for transaction types (Invoices, Bills, Payments, etc.). The
            “Monthly rollup” button (optional) writes one row per month into{" "}
            <code>qbo_period_metrics</code>.
          </p>
        )}
      </div>

      {/* History */}
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">History</h2>
          {loading ? <span className="text-xs text-slate-500">Loading…</span> : null}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">API</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, index) => (
                  <tr key={entry.id} className="border-t hover:bg-slate-50">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2">{entry.apiKey}</td>
                    <td className="p-2">{entry.description}</td>
                    <td className="p-2">{entry.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customers */}
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">QuickBooks Customers</h2>
        </div>

        {loadingCustomers ? (
          <p className="text-slate-500 text-sm">Loading customers…</p>
        ) : customerError ? (
          <p className="text-rose-600 text-sm">{customerError}</p>
        ) : customers.length === 0 ? (
          <p className="text-slate-500 text-sm">No customers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Display Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Balance</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((cust, i) => (
                  <tr key={i} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">{cust.DisplayName}</td>
                    <td className="px-3 py-2">{cust.PrimaryEmailAddr?.Address || "-"}</td>
                    <td className="px-3 py-2">{cust.PrimaryPhone?.FreeFormNumber || "-"}</td>
                    <td className="px-3 py-2">{cust.Balance ?? "0.00"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickBooksDashboard;
