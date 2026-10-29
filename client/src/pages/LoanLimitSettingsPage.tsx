import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { LoanLimitSetting } from "../lib/types";
import { useAuth } from "../context/AuthContext";

export function LoanLimitSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "manager" || user?.role === "accountant" || user?.role === "admin";
  const [setting, setSetting] = useState<LoanLimitSetting | null>(null);
  const [shareCapitalMultiplier, setShareCapitalMultiplier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<LoanLimitSetting>("/settings/loan-limit").then((s) => {
      setSetting(s);
      setShareCapitalMultiplier(s.shareCapitalMultiplier);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.put("/settings/loan-limit", {
        shareCapitalMultiplier: Number(shareCapitalMultiplier),
      });
      setSaved(true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Loan Limit — Settings</h1>
      <p className="text-sm text-slate-500 mb-4">
        The rule used to compute a member's loanable amount on the Loans page: their share capital balance times
        this multiplier, minus what they currently owe on active/past-due loans.
      </p>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4 mb-6">
        <p className="font-medium mb-1">Not yet confirmed</p>
        <p>
          This is a placeholder rule (multiple of share capital), not a policy the cooperative's board has approved.
          The computed amount is shown for reference only and never blocks a loan application — update it, or
          replace the rule entirely, once your board decides actual loan limit policy.
        </p>
      </div>

      {!setting ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 max-w-md space-y-4">
          <label className="block text-sm text-slate-600">
            Share Capital Multiplier
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={!canEdit}
              value={shareCapitalMultiplier}
              onChange={(e) => setShareCapitalMultiplier(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
            <span className="block mt-1 text-xs text-slate-400">
              e.g. 3 means a member can borrow up to 3x their share capital, less what they currently owe.
            </span>
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">Saved.</p>}

          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
