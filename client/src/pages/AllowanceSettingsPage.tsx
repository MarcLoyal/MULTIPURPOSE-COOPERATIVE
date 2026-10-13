import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { AllowanceRateSetting } from "../lib/types";
import { useAuth } from "../context/AuthContext";

export function AllowanceSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "manager" || user?.role === "accountant" || user?.role === "admin";
  const [rows, setRows] = useState<AllowanceRateSetting[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<AllowanceRateSetting[]>("/settings/allowance-rates").then((data) => {
      setRows(data);
      setDrafts(Object.fromEntries(data.map((r) => [r.bucketLabel, r.ratePercent])));
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const rates = Object.entries(drafts).map(([bucketLabel, ratePercent]) => ({
        bucketLabel,
        ratePercent: Number(ratePercent),
      }));
      await api.put("/settings/allowance-rates", { rates });
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
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Allowance for Probable Losses — Settings</h1>
      <p className="text-sm text-slate-500 mb-4">
        Per-bucket rates used to compute the allowance report (Accounting → Allowance for Losses).
      </p>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4 mb-6">
        <p className="font-medium mb-1">Not yet confirmed</p>
        <p>
          MC 2022-24 names this account (11242) and bases it on Portfolio at Risk, but states no percentage
          schedule. Every rate below defaults to 0% — a report at these defaults computes an allowance of
          zero, and posting at zero does nothing. Set real percentages only after your auditor or the CDA
          extension office confirms them.
        </p>
      </div>

      {!rows ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2">Bucket (days past due)</th>
                  <th className="px-4 py-2 text-right">Rate (%)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{row.bucketLabel}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        disabled={!canEdit}
                        value={drafts[row.bucketLabel] ?? ""}
                        onChange={(e) => setDrafts({ ...drafts, [row.bucketLabel]: e.target.value })}
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm disabled:bg-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
          {saved && <p className="text-sm text-emerald-600 mb-3">Saved.</p>}

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
