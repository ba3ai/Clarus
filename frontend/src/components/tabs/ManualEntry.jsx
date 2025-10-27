// src/components/tabs/ManualEntry.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

export default function ManualEntry() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    // Personal Information
    first_name: "",
    last_name: "",
    birthdate: "",
    citizenship: "",
    email: "",
    phone: "",
    ssn: "",

    // Residential Address
    address1: "",
    address2: "",
    country: "",
    city: "",
    state: "",
    zip: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const initials = useMemo(() => {
    const f = (form.first_name || "").trim()[0] || "";
    const l = (form.last_name || "").trim()[0] || "";
    return (f + l || "A").toUpperCase();
  }, [form.first_name, form.last_name]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const required = [
    "first_name",
    "last_name",
    "birthdate",
    "citizenship",
    "email",
    "phone",
    "ssn",
    "address1",
    "country",
    "city",
    "state",
    "zip",
  ];

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");

    // validate required
    for (const key of required) {
      if (!String(form[key] || "").trim()) {
        const label = key.replace("_", " ");
        setErr(`${label} is required`);
        return;
      }
    }

    // get token (required for owner_id via backend)
    const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    if (!token) {
      setErr("Your session has expired. Please log in again.");
      navigate("/login");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/manual/manual_entry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // <-- important
        },
        body: JSON.stringify(form),
      });

      // handle 401/403 -> login
      if (res.status === 401 || res.status === 403) {
        setErr("Your session has expired. Please log in again.");
        navigate("/login");
        return;
      }

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.msg || `Submit failed (${res.status})`);

      setOk("Manual entry saved successfully.");
      setForm({
        first_name: "",
        last_name: "",
        birthdate: "",
        citizenship: "",
        email: "",
        phone: "",
        ssn: "",
        address1: "",
        address2: "",
        country: "",
        city: "",
        state: "",
        zip: "",
      });
      setTimeout(() => setOk(""), 2500);
    } catch (e) {
      setErr(e.message || "Unable to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
              {/* Avatar initials */}
              <div className="h-24 w-24 rounded-full bg-teal-500 text-white grid place-items-center text-3xl font-semibold">
                {initials}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="First Name" name="first_name" value={form.first_name} onChange={onChange} required />
                <Field label="Last Name" name="last_name" value={form.last_name} onChange={onChange} required />
                <Field label="Birthdate" name="birthdate" value={form.birthdate} onChange={onChange} placeholder="MM/DD/YYYY" required />
                <Field label="Citizenship" name="citizenship" value={form.citizenship} onChange={onChange} placeholder="United States" required />
                <Field label="Email" name="email" type="email" value={form.email} onChange={onChange} required />
                <Field label="Phone" name="phone" value={form.phone} onChange={onChange} required />
                <Field label="SSN / Tax ID" name="ssn" value={form.ssn} onChange={onChange} required />
                <div className="text-xs text-gray-500 self-end">
                  SSN / Tax ID is an encrypted attribute
                </div>
              </div>
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
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white font-medium px-6 py-3 shadow hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save Manual Entry"}
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
        {label}
        {required && <span className="text-red-500">*</span>}
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
