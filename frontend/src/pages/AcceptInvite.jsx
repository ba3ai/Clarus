// src/pages/AcceptInvite.jsx — merged (XSRF/api + Emergency Contact)
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../services/api"; // Axios instance configured with withCredentials + XSRF

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [form, setForm] = useState({
    // Personal info
    first_name: "",
    last_name: "",
    birthdate: "",
    citizenship: "",
    email: "",
    phone: "",
    ssn: "",
    emergency_contact: "", // ← NEW

    // Residential address
    address1: "",
    address2: "",
    country: "",
    city: "",
    state: "",
    zip: "",

    // Account
    password: "",
  });

  // Initials for avatar circle (optional)
  const initials = useMemo(() => {
    const f = (form.first_name || "").trim()[0] || "";
    const l = (form.last_name || "").trim()[0] || "";
    return (f + l || "A").toUpperCase();
  }, [form.first_name, form.last_name]);

  // Load invite details (cookie/XSRF via Axios api)
  useEffect(() => {
    if (!token) {
      setErr("Invite token missing.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/admin/invite/${token}`);
        // Split name from invite into first/last
        const name = (data?.name || "").trim();
        let first_name = "", last_name = "";
        if (name) {
          const parts = name.split(" ");
          if (parts.length === 1) first_name = parts[0];
          else { last_name = parts.pop(); first_name = parts.join(" "); }
        }
        setForm((f) => ({ ...f, first_name, last_name, email: data?.email || "" }));
        setErr("");
      } catch (e) {
        const msg =
          e?.response?.data?.msg ||
          e?.response?.data?.error ||
          e?.message ||
          "Invalid or expired link.";
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // Keep required list the same; treat Emergency Contact as OPTIONAL at invite step.
  const required = [
    "first_name","last_name","birthdate","citizenship",
    "email","phone","ssn","address1","country","city","state","zip","password"
  ];

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setOk("");

    for (const k of required) {
      if (!String(form[k] || "").trim()) {
        const label = k.replace(/_/g, " ");
        setErr(`${label} is required`);
        return;
      }
    }

    try {
      // Cookie-based/XSRF-protected submit
      const { data } = await api.post(`/admin/invite/${token}`, form);
      setOk(data?.msg || "Account created. Redirecting to login…");
      setTimeout(() => navigate("/login"), 900);
    } catch (e) {
      const msg =
        e?.response?.data?.msg ||
        e?.response?.data?.error ||
        e?.message ||
        "Something went wrong.";
      setErr(msg);
    }
  };

  if (loading) return <div className="p-6 text-gray-600">Loading invitation…</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <form onSubmit={submit} className="space-y-10">
        {/* Personal Information */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start justify-between p-6 border-b">
            <h2 className="text-xl font-semibold">Personal Information</h2>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-[96px_1fr] gap-6 items-start">
              {/* Avatar initials (static for accept step) */}
              <div className="h-24 w-24 rounded-full bg-teal-500 text-white grid place-items-center text-3xl font-semibold">
                {initials}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="First Name" name="first_name" value={form.first_name} onChange={onChange} required />
                <Field label="Last Name" name="last_name" value={form.last_name} onChange={onChange} required />
                <Field label="Birthdate" name="birthdate" value={form.birthdate} onChange={onChange} required placeholder="MM/DD/YYYY" />
                <Field label="Citizenship" name="citizenship" value={form.citizenship} onChange={onChange} required placeholder="United States" />
                <Field label="Email" name="email" type="email" value={form.email} onChange={onChange} required />
                <Field label="Phone" name="phone" value={form.phone} onChange={onChange} required />
                <Field label="SSN / Tax ID" name="ssn" value={form.ssn} onChange={onChange} required />

                {/* NEW: Emergency Contact (optional) — right after SSN */}
                <Field
                  label="Emergency Contact (Phone Number)"
                  name="emergency_contact"
                  value={form.emergency_contact}
                  onChange={onChange}
                  placeholder="+1 555 0100"
                />

                <div className="text-xs text-gray-500 self-end md:col-span-1">
                  SSN / Tax ID is an encrypted attribute
                </div>
              </div>
            </div>

            {/* Password row */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Password" name="password" type="password" value={form.password} onChange={onChange} required />
            </div>
          </div>
        </section>

        {/* Residential Address */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="p-6 border-b">
            <h3 className="text-xl font-semibold">Residential Address</h3>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Field label="Street Address 1" name="address1" value={form.address1} onChange={onChange} required />
            </div>
            <div className="md:col-span-2">
              <Field label="Street Address 2 (Optional)" name="address2" value={form.address2} onChange={onChange} />
            </div>
            <Field label="Country" name="country" value={form.country} onChange={onChange} required />
            <Field label="City" name="city" value={form.city} onChange={onChange} required />
            <Field label="State / Province" name="state" value={form.state} onChange={onChange} required />
            <Field label="Zip / Postal Code" name="zip" value={form.zip} onChange={onChange} required />
          </div>
        </section>

        {/* Alerts */}
        {err && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3">
            {err}
          </div>
        )}
        {ok && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3">
            {ok}
          </div>
        )}

        {/* Submit */}
        <div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white font-medium px-6 py-3 shadow hover:brightness-110 active:scale-[0.99]"
          >
            Create Account
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, required, type = "text", placeholder = "" }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border px-3 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 border-gray-300"
      />
    </div>
  );
}
