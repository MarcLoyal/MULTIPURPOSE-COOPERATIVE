import { useEffect, useState } from "react";
import { api, ApiError, getToken, API_BASE_URL } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatCurrency } from "../lib/format";

type RowOutcome = {
  row: number;
  data: Record<string, unknown> | null;
  errors: string[];
  scheduleDerivedOutstandingPrincipal?: number;
  glOutstandingPrincipal?: number;
  overrideDifference?: number;
  resultingStatus?: string;
};

type SheetResult = { rows: RowOutcome[]; errorCount: number; totalBalance?: number; totalOutstanding?: number };

type Preview = {
  cutoffDate: string;
  alreadyLocked: boolean;
  ledgerEmpty: boolean;
  members: SheetResult;
  shareCapital: SheetResult;
  loans: SheetResult;
  deposits: SheetResult;
  other: SheetResult;
  suspenseBalance: number;
  totalErrorCount: number;
  canConfirm: boolean;
};

type Status = { locked: boolean; ledgerEmpty: boolean; lockedRecord: { cutoffDate: string; createdAt: string } | null };

const SHEETS: { key: keyof Pick<Preview, "members" | "shareCapital" | "loans" | "deposits" | "other">; label: string; template: string }[] = [
  { key: "members", label: "Members", template: "members.csv" },
  { key: "shareCapital", label: "Share Capital Balances", template: "share-capital.csv" },
  { key: "loans", label: "Outstanding Loans", template: "loans.csv" },
  { key: "deposits", label: "Deposit Balances", template: "deposits.csv" },
  { key: "other", label: "Other GL Opening Balances", template: "other.csv" },
];

export function OpeningBalancesImportPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [cutoffDate, setCutoffDate] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acknowledgeNonZero, setAcknowledgeNonZero] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") {
      api
        .get<Status>("/opening-balances/status")
        .then(setStatus)
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load status"));
    }
  }, [user]);

  if (user && user.role !== "admin") {
    return <p className="text-slate-500">Opening Balances Import is admin only.</p>;
  }

  async function downloadTemplate(path: string, filename: string) {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/api/opening-balances/templates/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError("Failed to download template");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function buildRequestBody() {
    const body: Record<string, string> = { cutoffDate };
    const fieldForKey: Record<string, string> = {
      members: "membersCsv",
      shareCapital: "shareCapitalCsv",
      loans: "loansCsv",
      deposits: "depositsCsv",
      other: "otherCsv",
    };
    for (const sheet of SHEETS) {
      const file = files[sheet.key];
      if (file) body[fieldForKey[sheet.key]] = await file.text();
    }
    return body;
  }

  async function handleValidate() {
    setError(null);
    setNotice(null);
    if (!cutoffDate) {
      setError("Pick a cutoff date first.");
      return;
    }
    setBusy(true);
    try {
      const body = await buildRequestBody();
      const result = await api.post<Preview>("/opening-balances/validate", body);
      setPreview(result);
      setAcknowledgeNonZero(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Validation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setError(null);
    setBusy(true);
    try {
      const body = await buildRequestBody();
      await api.post("/opening-balances/commit", { ...body, acknowledgeNonZeroSuspense: acknowledgeNonZero });
      setNotice("Opening balances imported successfully. This can't be run again.");
      setPreview(null);
      setFiles({});
      const refreshed = await api.get<Status>("/opening-balances/status");
      setStatus(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const suspenseIsZero = preview ? Math.abs(preview.suspenseBalance) < 0.01 : true;
  const canConfirm =
    preview != null &&
    !status?.locked &&
    status?.ledgerEmpty !== false &&
    preview.totalErrorCount === 0 &&
    (suspenseIsZero || acknowledgeNonZero);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Opening Balances Import</h1>
        <p className="text-sm text-slate-500 mt-1">
          Bring in the cooperative's existing members, share capital, loans, and deposits as of a cutoff date, so this
          system's books start from the last audited figures. This can only be run once, and only before any normal
          transaction is recorded.
        </p>
      </div>

      {status?.locked && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          Opening balances were already imported
          {status.lockedRecord ? ` as of ${status.lockedRecord.cutoffDate.slice(0, 10)}.` : "."} This can't be run again.
        </div>
      )}
      {!status?.locked && status?.ledgerEmpty === false && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          The ledger already has transactions recorded, so an opening balances import can no longer run on this
          database. You can still use Validate below to check a set of files (it makes no changes), but Confirm will
          be blocked.
        </div>
      )}

      {error && <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{notice}</div>}

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Cutoff date</label>
          <input
            type="date"
            value={cutoffDate}
            onChange={(e) => setCutoffDate(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            disabled={status?.locked}
          />
          <p className="text-xs text-slate-500 mt-1">
            The date these balances are as of — every imported balance and GL entry is dated this day.
          </p>
        </div>

        <div className="space-y-3">
          {SHEETS.map((sheet) => (
            <div key={sheet.key} className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
              <span className="w-56 text-sm font-medium text-slate-700">{sheet.label}</span>
              <button
                type="button"
                className="text-sm text-sky-600 hover:underline"
                onClick={() => downloadTemplate(sheet.template, `${sheet.key}_opening_balances_template.csv`)}
                disabled={status?.locked}
              >
                Download template
              </button>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={status?.locked}
                onChange={(e) => setFiles((prev) => ({ ...prev, [sheet.key]: e.target.files?.[0] ?? null }))}
                className="text-sm"
              />
            </div>
          ))}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleValidate}
            disabled={busy || status?.locked}
            className="bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            Validate
          </button>
        </div>
      </div>

      {preview && (
        <div className="space-y-4">
          <div
            className={`rounded-md border p-4 text-sm ${
              suspenseIsZero ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            <p className="font-semibold">
              Opening Balance Equity (30900): {formatCurrency(preview.suspenseBalance)}
            </p>
            {suspenseIsZero ? (
              <p className="mt-1">Every account entered across the five sheets nets to zero — the opening trial balance is fully entered.</p>
            ) : (
              <>
                <p className="mt-1">
                  This isn't zero, which means the audited opening trial balance wasn't fully entered — add the
                  missing account(s) to the "Other GL opening balances" sheet, or confirm anyway if this is
                  intentional.
                </p>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={acknowledgeNonZero} onChange={(e) => setAcknowledgeNonZero(e.target.checked)} />
                  I understand this won't net to zero and want to import anyway
                </label>
              </>
            )}
            <p className="mt-2 text-xs">
              {preview.totalErrorCount === 0
                ? "No validation errors."
                : `${preview.totalErrorCount} validation error(s) — fix them below before confirming.`}
            </p>
          </div>

          {SHEETS.map((sheet) => {
            const result = preview[sheet.key];
            if (!result || result.rows.length === 0) return null;
            return (
              <details key={sheet.key} className="bg-white border border-slate-200 rounded-lg p-4" open={result.errorCount > 0}>
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                  {sheet.label} — {result.rows.length} row(s)
                  {result.errorCount > 0 ? `, ${result.errorCount} error(s)` : ""}
                  {result.totalBalance !== undefined ? ` — total ${formatCurrency(result.totalBalance)}` : ""}
                  {result.totalOutstanding !== undefined ? ` — total outstanding ${formatCurrency(result.totalOutstanding)}` : ""}
                </summary>
                <table className="w-full text-xs mt-3">
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.row} className={row.errors.length > 0 ? "bg-rose-50" : ""}>
                        <td className="py-1 pr-3 align-top font-mono text-slate-500">row {row.row}</td>
                        <td className="py-1 align-top">
                          {row.errors.length > 0 ? (
                            <ul className="text-rose-700 list-disc pl-4">
                              {row.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-emerald-700">
                              OK
                              {row.overrideDifference !== undefined && row.overrideDifference !== 0
                                ? ` — outstanding_principal override differs from the schedule-derived figure by ${formatCurrency(row.overrideDifference)}`
                                : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            );
          })}

          <div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !canConfirm}
              className="bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
            >
              Confirm Import
            </button>
            {!canConfirm && (
              <p className="text-xs text-slate-500 mt-1">
                Confirm is disabled until there are zero validation errors and the suspense balance is zero (or
                acknowledged), and the ledger is still empty.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
