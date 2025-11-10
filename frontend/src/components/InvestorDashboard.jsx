// src/pages/InvestorDashboard.jsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import api from "../services/api";

import InvestorOverview from "./tabs/InvestorOverview";
import Portfolio from "./investments/Portfolio";
import Statements from "./investments/Statements";
import Documents from "./investments/Documents";
import PersonalInformation from "./investments/PersonalInformation";
import Accreditation from "./investments/Accreditation";
import Contacts from "./investments/Contacts";

/* Icons */
const baseIconProps = { width: "1em", height: "1em", fill: "none", "aria-hidden": true };
const Icon = {
  menu: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" /></svg>),
  close: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" /></svg>),
  overview: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M3 12l9-7 9 7v7a2 2 0 01-2 2h-4a2 2 0 01-2-2v-3H9v3a2 2 0 01-2 2H3v-9z" stroke="currentColor" strokeWidth="2" /></svg>),
  portfolio: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M3 7h18v10H3z" stroke="currentColor" strokeWidth="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" /></svg>),
  statements: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="2" /><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" /></svg>),
  documents: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h8l6-6V5a2 2 0 00-2-2h-4z" stroke="currentColor" strokeWidth="2" /><path d="M14 3v6h6" stroke="currentColor" strokeWidth="2" /></svg>),
  person: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M6 20a6 6 0 0112 0" stroke="currentColor" strokeWidth="2" /></svg>),
  badge: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.6L12 16l-4.9 2.3.9-5.6-4-3.9 5.5-.8L12 3z" stroke="currentColor" strokeWidth="2" /></svg>),
  contacts: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" /><path d="M2 21a6 6 0 0112 0" stroke="currentColor" strokeWidth="2" /><rect x="14" y="7" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="2" /></svg>),
  group: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" stroke="currentColor" strokeWidth="2"/><path d="M3 21a7 7 0 0114 0M17 7a3 3 0 013-3 3 3 0 013 3M22 21a5 5 0 00-6-4" stroke="currentColor" strokeWidth="2"/></svg>),
  logout: () => (<svg viewBox="0 0 24 24" {...baseIconProps}><path d="M15 17l5-5-5-5M20 12H9" stroke="currentColor" strokeWidth="2" /><path d="M4 4h6a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" /><path d="M12 16v2a2 2 0 01-2 2H4" stroke="currentColor" strokeWidth="2" /></svg>),
};

const itemBase =
  "w-full text-left px-3 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 flex items-center gap-2 text-sm leading-5";
const itemIdle = "hover:bg-sky-50 text-slate-700";
const itemActive = "bg-sky-100 text-sky-700";

export default function InvestorDashboard() {
  const { user, logout } = useContext(AuthContext);
  if (user === undefined) return <p className="p-6">Loading dashboard…</p>;

  const [open, setOpen] = useState(true);

  // Start with Accreditation by default; if accredited we'll switch to stored tab later
  const initialTab =
    (typeof window !== "undefined" && localStorage.getItem("investor.selectedTab")) || "accreditation";
  const [selected, setSelected] = useState(initialTab);

  // Accreditation gate flag
  const [accredited, setAccredited] = useState(null); // null = unknown, true/false = known
  const [accError, setAccError] = useState("");

  // NEW: current investor meta (to know if this is a parent or a dependent)
  const [invMeta, setInvMeta] = useState({
    investor_type: null,
    parent_investor_id: null,
    dependents: [],
  });

  // On mount, check accreditation once
  useEffect(() => {
    let alive = true;
    (async () => {
      setAccError("");
      try {
        const { data } = await api.get(`/api/investor/accreditation`, { headers: { Accept: "application/json" } });
        if (!alive) return;
        const ok = !!(data && data.selection && data.selection !== "not_yet");
        setAccredited(ok);
        if (ok) {
          const last = typeof window !== "undefined" ? localStorage.getItem("investor.selectedTab") : null;
          setSelected(last || "overview");
        } else {
          setSelected("accreditation");
        }
      } catch (e) {
        if (!alive) return;
        setAccredited(false);
        setSelected("accreditation");
        setAccError(
          e?.response?.data?.error ||
            (e?.response ? `Accreditation check failed (${e.response.status})` : "Unable to check accreditation.")
        );
      }
    })();
    return () => { alive = false; };
  }, []);

  // NEW: load investor meta (type/parent/dependents)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/api/investor/me", { headers: { Accept: "application/json" } });
        if (!alive) return;
        setInvMeta({
          investor_type: data?.investor_type ?? null,
          parent_investor_id: data?.parent_investor_id ?? null,
          dependents: Array.isArray(data?.dependents) ? data.dependents : [],
        });
      } catch {
        // no-op: if the endpoint isn’t present yet, we just won’t show the Dependent tab
      }
    })();
    return () => { alive = false; };
  }, []);

  const isDependent = useMemo(() => {
    const t = (invMeta.investor_type || "").toLowerCase();
    return t === "depends" && !!invMeta.parent_investor_id;
  }, [invMeta]);

  const hasDependents = useMemo(() => {
    return Array.isArray(invMeta.dependents) && invMeta.dependents.length > 0;
  }, [invMeta]);

  // Persist chosen tab (but only if accredited or choosing accreditation tab)
  useEffect(() => {
    if (selected === "accreditation" || accredited === true) {
      localStorage.setItem("investor.selectedTab", selected);
    }
  }, [selected, accredited]);

  // Build navigation based on role:
  // - Dependents: only Overview + Portfolio (+ Logout, Accreditation gate still shown but nav hidden)
  // - Parents/regular: full set + new "Dependent" tab (only for parents; not shown to dependents)
  const navGroups = useMemo(() => {
    const DASHBOARD = [{ id: "overview", label: "Overview", icon: Icon.overview }];
    const INVESTMENTS = [
      { id: "portfolio", label: "Portfolio", icon: Icon.portfolio },
      ...(isDependent ? [] : [
        { id: "statements", label: "Statements", icon: Icon.statements },
        { id: "documents", label: "Documents", icon: Icon.documents },
      ]),
    ];
    const PROFILE = isDependent
      ? [] // dependents don't see profile tabs
      : [
          { id: "personalinformation", label: "Personal Information", icon: Icon.person },
          { id: "accreditation", label: "Accreditation", icon: Icon.badge },
          { id: "contacts", label: "Contacts", icon: Icon.contacts },
        ];

    // NEW: Dependent tab visible only for parent/regular investors.
    // We add it as a group "DEPENDENT" so it's easy to spot.
    const DEP_GROUP = (isDependent ? [] : [{ title: "DEPENDENT", items: [{ id: "dependents", label: "Dependent", icon: Icon.group }] }]);

    const BASE = [
      { title: "DASHBOARD", items: DASHBOARD },
      { title: "INVESTMENTS", items: INVESTMENTS },
      ...(PROFILE.length ? [{ title: "PROFILE", items: PROFILE }] : []),
      ...DEP_GROUP,
      { title: "ACCOUNT", items: [{ id: "logout", label: "Logout", icon: Icon.logout }] },
    ];
    return BASE;
  }, [isDependent]);

  // If user is a dependent and lands on a hidden tab, force them back to Overview
  useEffect(() => {
    if (isDependent) {
      const allowed = new Set(["overview", "portfolio", "logout", "accreditation"]);
      if (!allowed.has(selected)) setSelected("overview");
    }
  }, [isDependent, selected]);

  const changeTab = (id) => {
    if (id === "logout") {
      logout();
      return;
    }
    // Existing accreditation gate: until accredited, only allow accreditation + logout
    if (accredited === false && id !== "accreditation") {
      setSelected("accreditation");
      return;
    }
    // Role restriction: dependents only overview/portfolio
    if (isDependent && !["overview", "portfolio"].includes(id)) return;
    setSelected(id);
    if (window?.matchMedia && window.matchMedia("(max-width: 1023px)").matches) {
      setOpen(false);
    }
  };

  // Render helper to disable locked buttons visually
  const isLocked = (id) =>
    (accredited === false && id !== "accreditation" && id !== "logout") ||
    (isDependent && !["overview", "portfolio", "logout"].includes(id));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="flex items-center justify-between gap-3 bg-white border-b px-3 sm:px-4 md:px-6 py-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center p-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <Icon.close /> : <Icon.menu />}
          </button>
          <h1 className="text-base sm:text-lg md:text-2xl font-semibold text-blue-600">
            Investor Panel
          </h1>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {open && (
          <div
            className="fixed inset-0 bg-black/25 z-30 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={[
            "fixed lg:static z-40 lg:z-0 inset-y-0 left-0 w-60 bg-white border-r",
            "transform transition-transform duration-200 ease-in-out",
            open ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
          aria-label="Sidebar navigation"
        >
          <nav className="h-full overflow-y-auto px-3 py-4 space-y-6">
            {navGroups.map((g) => (
              <div key={g.title}>
                <div className="font-semibold text-slate-400 uppercase text-[11px] tracking-wide mb-2">
                  {g.title}
                </div>
                <ul className="space-y-1">
                  {g.items.map((item) => {
                    const Active = selected === item.id;
                    const disabled = isLocked(item.id);
                    const Ico = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          className={`${itemBase} ${Active ? itemActive : itemIdle} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                          onClick={() => (!disabled ? changeTab(item.id) : null)}
                          aria-disabled={disabled ? "true" : "false"}
                          title={disabled ? "Complete Accreditation to unlock" : item.label}
                        >
                          <span className="shrink-0 leading-none inline-flex items-center">
                            <Ico />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          {/* Gate banner */}
          {accredited === false && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
              Please complete your <strong>Accreditation</strong> to access the rest of the dashboard.
            </div>
          )}
          {accError && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
              {accError}
            </div>
          )}

          <div className="w-full">
            {selected === "overview" && <InvestorOverview />}
            {selected === "portfolio" && <Portfolio />}
            {!isDependent && selected === "statements" && <Statements />}
            {!isDependent && selected === "documents" && <Documents />}
            {!isDependent && selected === "personalinformation" && <PersonalInformation />}
            {!isDependent && selected === "contacts" && <Contacts />}
            {selected === "accreditation" && <Accreditation onAccredited={setAccredited} />}

            {/* NEW: Dependents tab (only for parents/regular) */}
            {!isDependent && selected === "dependents" && <DependentsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

/** NEW: Simple Dependents tab that lists the parent’s dependents. */
function DependentsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr("");
      setLoading(true);
      try {
        const { data } = await api.get("/api/investors/dependents", { headers: { Accept: "application/json" } });
        if (!alive) return;
        const list = Array.isArray(data) ? data :
                     Array.isArray(data?.items) ? data.items :
                     Array.isArray(data?.data) ? data.data : [];
        setRows(list);
      } catch (e) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e?.message || "Unable to load dependents.");
      } finally {
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Dependent Accounts</h2>
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
          {err}
        </div>
      )}
      {loading ? (
        <div className="rounded-lg border p-6 text-sm text-slate-600">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-6 text-sm text-slate-600">No dependent accounts found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Investor</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Current Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id || r.investor_id}>
                  <td className="px-4 py-3">{r.name || "—"}</td>
                  <td className="px-4 py-3">{r.email || "—"}</td>
                  <td className="px-4 py-3">{r.investor_type || "Depends"}</td>
                  <td className="px-4 py-3">
                    {"current_balance" in r && r.current_balance != null
                      ? new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: "USD",
                        }).format(Number(r.current_balance))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
