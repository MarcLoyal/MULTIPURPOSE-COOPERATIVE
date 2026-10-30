import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError, setToken } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Status = "checking" | "available" | "unavailable";

export function SetupPage() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<Status>("checking");
  const [form, setForm] = useState({
    setupCode: "",
    cooperativeName: "",
    cooperativeAddress: "",
    cdaRegistrationNumber: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    adminPasswordConfirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get<{ setupAvailable: boolean }>("/setup/status")
      .then((res) => setStatus(res.setupAvailable ? "available" : "unavailable"))
      .catch(() => setStatus("unavailable"));
  }, []);

  if (status === "checking") {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">Loading…</div>;
  }
  // Setup is either already done (even with the code, this page is
  // permanently disabled once a first admin exists) or SETUP_CODE isn't
  // configured for this environment (every submission would just fail
  // closed) — either way, there's nothing to show here. Send them to the
  // normal login, which is exactly how this page should behave when it's
  // "completely disabled."
  if (status === "unavailable") return <Navigate to="/login" replace />;
  if (done) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.adminPassword !== form.adminPasswordConfirm) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ token: string }>("/setup", {
        setupCode: form.setupCode,
        cooperative: {
          name: form.cooperativeName,
          address: form.cooperativeAddress,
          cdaRegistrationNumber: form.cdaRegistrationNumber,
        },
        admin: {
          name: form.adminName,
          email: form.adminEmail,
          password: form.adminPassword,
        },
      });
      setToken(res.token);
      await refreshUser();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  }

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
    };
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 py-10">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8">
        <h1 className="text-lg font-semibold text-slate-900">Set up your cooperative</h1>
        <p className="text-sm text-slate-500 mb-6">
          This runs once. It creates your cooperative's record and its first admin account — everything else
          (other staff logins) is created afterward from Staff User Management.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Setup code</label>
            <input
              required
              type="password"
              {...field("setupCode")}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">Given to you privately — not your future login password.</p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Cooperative details</p>
            <div className="space-y-3">
              <input
                required
                placeholder="Cooperative name"
                {...field("cooperativeName")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Address"
                {...field("cooperativeAddress")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="CDA registration number"
                {...field("cdaRegistrationNumber")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Your admin account</p>
            <div className="space-y-3">
              <input
                required
                placeholder="Full name"
                {...field("adminName")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                placeholder="Email"
                {...field("adminEmail")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                type="password"
                minLength={8}
                placeholder="Password (min 8 characters)"
                {...field("adminPassword")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                type="password"
                minLength={8}
                placeholder="Confirm password"
                {...field("adminPasswordConfirm")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 text-white py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Create cooperative and admin account"}
          </button>
        </form>
      </div>
    </div>
  );
}
