import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { ReceiptSetting } from "../lib/types";
import { useAuth } from "../context/AuthContext";

export function ReceiptSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "manager" || user?.role === "accountant" || user?.role === "admin";
  const [setting, setSetting] = useState<ReceiptSetting | null>(null);
  const [documentLabel, setDocumentLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<ReceiptSetting>("/settings/receipt-label").then((s) => {
      setSetting(s);
      setDocumentLabel(s.documentLabel);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.put("/settings/receipt-label", { documentLabel });
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
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Receipt Label — Settings</h1>
      <p className="text-sm text-slate-500 mb-4">
        The document title printed on every receipt issued for a loan repayment, deposit, or share capital
        payment.
      </p>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4 mb-6">
        <p className="font-medium mb-1">Not yet confirmed</p>
        <p>
          Defaults to "Payment Receipt," not "Official Receipt" — that term carries specific BIR
          Computerized Accounting System (CAS) / Authority to Print (ATP) implications under the EOPT Act that
          this cooperative hasn't confirmed with its accountant yet. Change this only once that's resolved. See
          the README's open questions.
        </p>
      </div>

      {!setting ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 max-w-md space-y-4">
          <label className="block text-sm text-slate-600">
            Document Label
            <input
              type="text"
              disabled={!canEdit}
              value={documentLabel}
              onChange={(e) => setDocumentLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">Saved. This only affects receipts issued from now on.</p>}

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
