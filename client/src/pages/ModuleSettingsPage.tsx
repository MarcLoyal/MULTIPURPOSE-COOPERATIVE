import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

const MODULE_LABELS: { key: string; label: string }[] = [
  { key: "shareCapital", label: "Share Capital" },
  { key: "deposits", label: "Deposits" },
  { key: "generalLedger", label: "General Ledger" },
  { key: "trialBalance", label: "Trial Balance" },
  { key: "incomeStatement", label: "Income Statement" },
  { key: "balanceSheet", label: "Statement of Financial Condition" },
  { key: "cashFlowStatement", label: "Statement of Cash Flows" },
  { key: "fiscalYears", label: "Fiscal Years" },
  { key: "allowanceReport", label: "Allowance for Losses" },
  { key: "cdaDataPack", label: "CDA Report Data Pack" },
  { key: "advanced", label: "Advanced (Settings, Staff Users, Opening Balances Import, Audit Log)" },
];

/**
 * Admin-only: turns a module on/off for this deployment (see
 * ModuleSetting's schema comment). Dashboard/Members/Cash/Loans aren't
 * listed — they're always on and were never gated. Flipping a flag
 * here takes effect immediately, no redeploy needed.
 */
export function ModuleSettingsPage() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function load() {
    api
      .get<Record<string, boolean>>("/settings/modules")
      .then(setModules)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load modules"));
  }

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  if (user && user.role !== "admin") {
    return <p className="text-slate-500">Module settings are admin only.</p>;
  }

  async function toggle(key: string, enabled: boolean) {
    setError(null);
    setBusyKey(key);
    try {
      await api.patch(`/settings/modules/${key}`, { enabled });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update module");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Modules</h1>
        <p className="text-sm text-slate-500 mt-1">
          Turn a feature on or off for this cooperative's deployment. Off hides it from the menu for everyone except
          admin, and blocks its pages for every other role.
        </p>
      </div>

      {error && <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {modules === null ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : (
          MODULE_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
              <span className="text-sm text-slate-800">{label}</span>
              <input
                type="checkbox"
                checked={modules[key] ?? true}
                disabled={busyKey === key}
                onChange={(e) => toggle(key, e.target.checked)}
                className="h-5 w-5"
              />
            </label>
          ))
        )}
      </div>
    </div>
  );
}
