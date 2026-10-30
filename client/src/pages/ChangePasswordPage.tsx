import { FormEvent, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { user, refreshUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={forced ? "min-h-screen flex items-center justify-center bg-slate-100" : ""}>
      <div className={forced ? "w-full max-w-sm bg-white rounded-xl shadow p-8" : "bg-white border border-slate-200 rounded-xl p-5 max-w-sm"}>
        <h1 className="text-lg font-semibold text-slate-900">Change Password</h1>
        {forced ? (
          <p className="text-sm text-slate-500 mb-6">
            This login was just created or reset for you. Set your own password before continuing to the member
            portal, {user?.name}.
          </p>
        ) : (
          <p className="text-sm text-slate-500 mb-6">Change the password for your own login.</p>
        )}

        {saved && !forced && <p className="text-sm text-emerald-600 mb-4">Password changed.</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-slate-900 text-white py-3 text-base font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Change Password"}
          </button>
        </form>

        {forced && (
          <button onClick={logout} className="mt-4 text-xs text-slate-400 underline hover:text-slate-600">
            Sign out instead
          </button>
        )}
      </div>
    </div>
  );
}
