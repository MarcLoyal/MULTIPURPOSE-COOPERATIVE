import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { AllowanceReport } from "../lib/types";
import { formatCurrency } from "../lib/format";
import { useAuth } from "../context/AuthContext";

export function AllowanceReportPage() {
  const { user } = useAuth();
  const canPost = user?.role === "manager" || user?.role === "accountant" || user?.role === "admin";
  const [report, setReport] = useState<AllowanceReport | null>(null);
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<AllowanceReport>("/accounting/allowance-report").then(setReport);
  }

  useEffect(load, []);

  async function handlePost() {
    setError(null);
    setMessage(null);
    setPosting(true);
    try {
      const result = await api.post<{ posted: boolean; message?: string; totalAllowance: number }>(
        "/accounting/allowance-report/post"
      );
      setMessage(
        result.posted
          ? `Posted ${formatCurrency(result.totalAllowance)} to the ledger.`
          : result.message ?? "Nothing to post."
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-900">Allowance for Probable Losses</h1>
        <Link to="/settings/allowance-rates" className="text-sm text-slate-500 hover:underline">
          Edit rates →
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Computed fresh from current loan balances and the rates in Settings — never cached.
      </p>

      {!report ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2">Loan Product</th>
                  <th className="px-4 py-2 text-right">Outstanding Balance</th>
                  <th className="px-4 py-2">Bucket</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Allowance</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={6}>
                      No active or past-due loans with an outstanding balance.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row) => (
                    <tr key={row.loanId} className="border-t border-slate-100">
                      <td className="px-4 py-2">{row.memberName}</td>
                      <td className="px-4 py-2">{row.loanProduct}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(row.outstandingBalance)}</td>
                      <td className="px-4 py-2">{row.bucket}</td>
                      <td className="px-4 py-2 text-right">{row.ratePercent}%</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(row.allowanceAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-4 py-2" colSpan={5}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(report.totalAllowance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
          {message && <p className="text-sm text-emerald-600 mb-3">{message}</p>}

          {canPost && (
            <div>
              <button
                onClick={handlePost}
                disabled={posting}
                className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
              >
                {posting ? "Posting…" : "Post to Ledger"}
              </button>
              <p className="text-xs text-slate-500 mt-2">
                Posting again adds another entry — there's no period tracking yet, so check the Trial Balance
                first if you're not sure this hasn't already been posted.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
