import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { DividendDistributionSetting } from "../lib/types";
import { useAuth } from "../context/AuthContext";

export function DividendSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "manager" || user?.role === "accountant" || user?.role === "admin";
  const [setting, setSetting] = useState<DividendDistributionSetting | null>(null);
  const [shareCapitalInterestPercent, setShareCapitalInterestPercent] = useState("");
  const [patronageRefundPercent, setPatronageRefundPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<DividendDistributionSetting>("/settings/dividend-rates").then((s) => {
      setSetting(s);
      setShareCapitalInterestPercent(s.shareCapitalInterestPercent);
      setPatronageRefundPercent(s.patronageRefundPercent);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.put("/settings/dividend-rates", {
        shareCapitalInterestPercent: Number(shareCapitalInterestPercent),
        patronageRefundPercent: Number(patronageRefundPercent),
      });
      setSaved(true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const total = (Number(shareCapitalInterestPercent) || 0) + (Number(patronageRefundPercent) || 0);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Dividend / Patronage Refund — Settings</h1>
      <p className="text-sm text-slate-500 mb-4">
        The split applied to a closed fiscal year's unallocated remainder (after the four statutory funds) when
        distributing to members, on the Fiscal Years page.
      </p>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4 mb-6">
        <p className="font-medium mb-1">Not yet confirmed</p>
        <p>
          Both rates default to 0% — distributing at these defaults does nothing. Set real percentages only after
          your board decides the split per your bylaws.
        </p>
      </div>

      {!setting ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 max-w-md space-y-4">
          <label className="block text-sm text-slate-600">
            Interest on Share Capital %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              disabled={!canEdit}
              value={shareCapitalInterestPercent}
              onChange={(e) => setShareCapitalInterestPercent(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Patronage Refund %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              disabled={!canEdit}
              value={patronageRefundPercent}
              onChange={(e) => setPatronageRefundPercent(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <p className={`text-sm ${total > 100 ? "text-rose-600" : "text-slate-500"}`}>
            Total: {total}% {total > 100 && "— the two together can't exceed 100%"}
          </p>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">Saved.</p>}

          {canEdit && (
            <button
              type="submit"
              disabled={saving || total > 100}
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
