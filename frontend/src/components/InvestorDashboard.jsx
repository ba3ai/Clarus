// src/pages/InvestorDashboard.jsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

import InvestorOverview from "./tabs/InvestorOverview";
import Portfolio from "./investments/Portfolio";
import Statemensts from "./investments/Statements";
import Documents from "./investments/Documents";
import PersonalInformation from "./investments/PersonalInformation";
import Accreditation from "./investments/Accreditation";
import Contacts from "./investments/Contacts";

import { AuthContext } from "../context/AuthContext";

/* -------------------------------------------------------------------------- */
/* Icon set – each SVG is sized with width/height="1em" so it scales with text */
/* -------------------------------------------------------------------------- */
const baseIconProps = { width: "1em", height: "1em", fill: "none", "aria-hidden": true };

const Icon = {
  menu: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  overview: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path
        d="M3 12l9-7 9 7v7a2 2 0 01-2 2h-4a2 2 0 01-2-2v-3H9v3a2 2 0 01-2 2H3v-9z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  ),
  portfolio: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M3 7h18v10H3z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  statements: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  documents: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h8l6-6V5a2 2 0 00-2-2h-4z" stroke="currentColor" strokeWidth="2" />
      <path d="M14 3v6h6" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  person: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 20a6 6 0 0112 0" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  badge: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.6L12 16l-4.9 2.3.9-5.6-4-3.9 5.5-.8L12 3z" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  contacts: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M2 21a6 6 0 0112 0" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="7" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  logout: () => (
    <svg viewBox="0 0 24 24" {...baseIconProps}>
      <path d="M15 17l5-5-5-5M20 12H9" stroke="currentColor" strokeWidth="2" />
      <path d="M4 4h6a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16v2a2 2 0 01-2 2H4" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

/* ------------------------------- UI helpers ------------------------------- */
const itemBase =
  "w-full text-left px-3 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 flex items-center gap-2 text-sm leading-5";
const itemIdle = "hover:bg-sky-50 text-slate-700";
const itemActive = "bg-sky-100 text-sky-700";

/* -------------------------------- Component ------------------------------- */
const InvestorDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Drawer state (visible on all devices, but only auto-closes on small screens)
  const [open, setOpen] = useState(true);

  // Persist selected tab
  const initialTab =
    typeof window !== "undefined"
      ? localStorage.getItem("investor.selectedTab") || "overview"
      : "overview";
  const [selected, setSelected] = useState(initialTab);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      logout();
      navigate("/login");
      return;
    }
    try {
      const decoded = jwtDecode(token);
      if (decoded.user_type !== "investor") {
        logout();
        navigate("/login");
        return;
      }
    } catch {
      setAuthError("Session expired. Please log in again.");
      logout();
      navigate("/login");
      return;
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  useEffect(() => {
    localStorage.setItem("investor.selectedTab", selected);
  }, [selected]);

  const navGroups = useMemo(
    () => [
      {
        title: "DASHBOARD",
        items: [{ id: "overview", label: "Overview", icon: Icon.overview }],
      },
      {
        title: "INVESTMENTS",
        items: [
          { id: "portfolio", label: "Portfolio", icon: Icon.portfolio },
          { id: "statements", label: "Statements", icon: Icon.statements },
          { id: "documents", label: "Documents", icon: Icon.documents },
        ],
      },
      {
        title: "PROFILE",
        items: [
          { id: "personalinformation", label: "Personal Information", icon: Icon.person },
          { id: "accreditation", label: "Accreditation", icon: Icon.badge },
          { id: "contacts", label: "Contacts", icon: Icon.contacts },
        ],
      },
      {
        title: "ACCOUNT",
        items: [{ id: "logout", label: "Logout", icon: Icon.logout }],
      },
    ],
    []
  );

  const changeTab = (id) => {
    if (id === "logout") {
      logout();
      navigate("/login");
      return;
    }
    setSelected(id);

    // Auto-close drawer ONLY on small screens
    if (window?.matchMedia && window.matchMedia("(max-width: 1023px)").matches) {
      setOpen(false);
    }
  };

  if (loading) return <p className="p-6">Loading dashboard...</p>;
  if (authError) return <p className="p-6 text-rose-600">{authError}</p>;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top bar */}
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
        {/* Overlay (only for small screens when open) */}
        {open && (
          <div
            className="fixed inset-0 bg-black/25 z-30 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
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
                    const Ico = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          className={`${itemBase} ${Active ? itemActive : itemIdle}`}
                          onClick={() => changeTab(item.id)}
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

        {/* Main content – full width usage */}
        <main className="flex-1 px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          <div className="w-full">
            {selected === "overview" && <InvestorOverview />}

            {selected === "portfolio" && <Portfolio />}
            {selected === "statements" && <Statemensts />}
            {selected === "documents" && <Documents />}

            {selected === "personalinformation" && <PersonalInformation />}
            {selected === "accreditation" && <Accreditation />}
            {selected === "contacts" && <Contacts />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default InvestorDashboard;
