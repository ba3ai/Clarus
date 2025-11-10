// src/pages/investments/PersonalInformation.jsx — merged (XSRF + avatar + emergency contact)
import React, { useEffect, useMemo, useState } from "react";
import api from "../../services/api"; // Axios instance (withCredentials + XSRF)

export default function PersonalInformation({ onSaved }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    birthdate: "",
    citizenship: "",
    email: "",
    phone: "",
    ssn: "",
    emergency_contact: "", // ← NEW
    address1: "",
    address2: "",
    country: "",
    city: "",
    state: "",
    zip: "",
  });

  const initials = useMemo(() => {
    const f = (form.first_name || "").trim()[0] || "";
    const l = (form.last_name || "").trim()[0] || "";
    return (f + l || "AI").toUpperCase();
  }, [form.first_name, form.last_name]);

  const previewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : ""),
    [avatarFile]
  );
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  // ---------- load current user via cookie session (XSRF) ----------
  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const { data } = await api.get(`/api/auth/me`, { headers: { Accept: "application/json" } });
        const u = data.user || data;
        const p = data.profile || {};
        setForm({
          first_name: u.first_name || p.first_name || "",
          last_name: u.last_name || p.last_name || "",
          birthdate: p.birthdate || "",
          citizenship: p.citizenship || "",
          email: u.email || p.email || "",
          phone: u.phone || p.phone || "",
          ssn: p.ssn || p.ssn_tax_id || "",
          emergency_contact: p.emergency_contact || "", // ← pulls if present
          address1: p.address1 || u.address || "",
          address2: p.address2 || "",
          country: p.country || "",
          city: p.city || "",
          state: p.state || "",
          zip: p.zip || "",
        });
        setAvatarUrl(p.avatar_url || u.avatar_url || "");
        setErr("");
      } catch (e) {
        const msg =
          e?.response?.data?.msg ||
          e?.response?.data?.error ||
          (e?.response ? `Failed to load profile (${e.response.status})` : "Failed to load your profile.");
        setErr(msg);
      } finally {
        setBusy(false);
        setLoaded(true);
      }
    })();
  }, []);

  // ---------- ui handlers ----------
  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const startEdit = () => { setErr(""); setEditing(true); };
  const cancelEdit = () => { setAvatarFile(null); setEditing(false); setErr(""); };
  const onPickAvatar = (e) => { const f = e.target.files?.[0]; if (f) setAvatarFile(f); };
  const removeAvatar = () => { setAvatarFile(null); setAvatarUrl(""); };

  // ---------- submit (JSON first, then optional avatar) ----------
  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    const required = [
      "first_name","last_name","birthdate","citizenship","email","phone","ssn","emergency_contact",
      "address1","country","city","state","zip",
    ];
    for (const k of required) {
      if (!String(form[k] || "").trim()) {
        setErr(`${k.replace(/_/g, " ")} is required`);
        return;
      }
    }

    setBusy(true);
    try {
      // 1) Save JSON profile (cookie auth + CSRF handled by axios instance)
      await api.put(`/api/auth/profile`, form);

      // 2) Optional avatar upload or removal
      if (avatarFile || avatarUrl === "") {
        const fd = new FormData();
        if (avatarFile) fd.append("avatar", avatarFile, avatarFile.name);
        if (avatarUrl === "") fd.append("remove_avatar", "1");

        const { data } = await api.put(`/api/auth/profile/avatar`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (data?.avatar_url !== undefined) setAvatarUrl(data.avatar_url || "");
      }

      setEditing(false);
      onSaved?.(true);
    } catch (e) {
      const msg =
        e?.response?.data?.msg ||
        e?.response?.data?.error ||
        (e?.response ? `Save failed (${e.response.status})` : "Failed to save profile.");
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const Field = ({ label, name, required, type = "text", placeholder = "", disabled = !editing }) => (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={form[name]}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
          disabled ? "text-gray-600 border-gray-200" : "border-gray-300"
        }`}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-10">
      {/* PERSONAL INFORMATION */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Personal Information</h2>
          {!editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-300 text-sky-700 px-3 py-1.5 hover:bg-sky-50 disabled:opacity-60 self-start sm:self-auto"
              disabled={busy || !loaded}
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <button type="button" onClick={cancelEdit} className="rounded-lg border px-3 py-1.5 text-gray-700 hover:bg-gray-50" disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-indigo-600 text-white px-4 py-2 hover:brightness-110 disabled:opacity-60" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[112px_1fr] gap-6 items-start">
            {/* Avatar */}
            <div className="flex flex-col items-start md:items-center gap-3">
              <div className="relative h-24 w-24 rounded-full bg-teal-500 text-white grid place-items-center text-3xl font-semibold overflow-hidden">
                {previewUrl || avatarUrl ? (
                  <img src={previewUrl || avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
                    Change
                  </label>
                  {(previewUrl || avatarUrl) && (
                    <button type="button" onClick={removeAvatar} className="text-rose-600 hover:underline text-sm">
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="First Name" name="first_name" required placeholder="Benjamin" />
              <Field label="Last Name" name="last_name" required placeholder="Jones" />
              <Field label="Birthdate" name="birthdate" required placeholder="11/02/1968" />
              <Field label="Citizenship" name="citizenship" required placeholder="United States" />
              <Field label="Email" name="email" required type="email" placeholder="ben@educounting.com" />
              <Field label="Phone" name="phone" required placeholder="3177015050" />

              {/* SSN + Emergency Contact share a row on md+ */}
              <Field label="SSN / Tax ID" name="ssn" required placeholder="308-92-2338" />
              <Field label="Emergency Contact" name="emergency_contact" required type="tel" placeholder="+1 555 987 6543" />

              <div className="text-xs text-gray-500 self-end md:col-span-1">SSN / Tax ID is an encrypted attribute</div>
            </div>
          </div>
        </div>
      </section>

      {/* RESIDENTIAL ADDRESS */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold">Residential Address</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <Field label="Street Address 1" name="address1" required placeholder="1496 Daylight Dr." />
          </div>
          <div className="md:col-span-2">
            <Field label="Street Address 2 (Optional)" name="address2" placeholder="" />
          </div>
          <Field label="Country" name="country" required placeholder="United States" />
          <Field label="City" name="city" required placeholder="Carmel" />
          <Field label="State / Province" name="state" required placeholder="Indiana" />
          <Field label="Zip / Postal Code" name="zip" required placeholder="46280" />
        </div>
      </section>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3">{err}</div>
      )}
    </form>
  );
}
