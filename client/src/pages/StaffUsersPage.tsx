import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { StaffRole, StaffUser } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { formatDate, humanizeEnum } from "../lib/format";

const STAFF_ROLES: StaffRole[] = ["cashier", "credit_officer", "manager", "accountant", "admin"];

export function StaffUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cashier" as StaffRole });
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);

  function load() {
    api
      .get<StaffUser[]>("/users")
      .then(setUsers)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load staff users"));
  }

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  if (user && user.role !== "admin") {
    return <p className="text-slate-500">Staff User Management is admin only.</p>;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    try {
      await api.post("/users", form);
      setShowForm(false);
      setForm({ name: "", email: "", password: "", role: "cashier" });
      setNotice("Staff account created. Share the email and password with them directly — there is no email delivery.");
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create staff account");
    }
  }

  async function toggleStatus(target: StaffUser) {
    setRowError(null);
    setNotice(null);
    try {
      await api.patch(`/users/${target.id}`, { status: target.status === "active" ? "disabled" : "active" });
      load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to update account");
    }
  }

  async function handleResetPassword(e: FormEvent, target: StaffUser) {
    e.preventDefault();
    setRowError(null);
    setNotice(null);
    try {
      await api.patch(`/users/${target.id}`, { password: resetPassword });
      setResetTargetId(null);
      setResetPassword("");
      setNotice("Password reset. Share the new password with them directly.");
      load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to reset password");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Staff User Management</h1>
          <p className="text-sm text-slate-500">
            Create staff logins, deactivate or reactivate them, and reset passwords. Admin only.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setFormError(null);
          }}
          className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
        >
          {showForm ? "Cancel" : "New Staff User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="password"
              minLength={8}
              placeholder="Temporary password (min 8 characters)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanizeEnum(r)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400">
            They'll be required to change this password the first time they log in.
          </p>
          {formError && <p className="text-sm text-rose-600">{formError}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Create Staff User
          </button>
        </form>
      )}

      {notice && <p className="text-sm text-emerald-600 mb-3">{notice}</p>}
      {rowError && <p className="text-sm text-rose-600 mb-3">{rowError}</p>}
      {loadError && <p className="text-sm text-rose-600 mb-3">{loadError}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  No staff users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2 font-medium">
                      {u.name}
                      {isSelf && <span className="text-xs text-slate-400 ml-1">(you)</span>}
                    </td>
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">{humanizeEnum(u.role)}</td>
                    <td className="px-4 py-2">
                      <span className={u.status === "active" ? "text-emerald-700" : "text-slate-400"}>
                        {u.status === "active" ? "Active" : "Disabled"}
                      </span>
                      {u.mustChangePassword && (
                        <span className="block text-xs text-amber-600">Must change password</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1 items-start">
                        <button
                          onClick={() => toggleStatus(u)}
                          disabled={isSelf && u.status === "active"}
                          title={isSelf && u.status === "active" ? "You can't deactivate your own account" : undefined}
                          className="text-xs font-medium hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                        >
                          {u.status === "active" ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          onClick={() => {
                            setResetTargetId(resetTargetId === u.id ? null : u.id);
                            setResetPassword("");
                            setRowError(null);
                          }}
                          className="text-xs font-medium hover:underline"
                        >
                          Reset Password
                        </button>
                        {resetTargetId === u.id && (
                          <form
                            onSubmit={(e) => handleResetPassword(e, u)}
                            className="flex gap-1 mt-1"
                          >
                            <input
                              required
                              type="password"
                              minLength={8}
                              autoFocus
                              placeholder="New password"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs w-36"
                            />
                            <button
                              type="submit"
                              className="rounded-md bg-slate-900 text-white text-xs px-2 py-1 hover:bg-slate-800"
                            >
                              Set
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
