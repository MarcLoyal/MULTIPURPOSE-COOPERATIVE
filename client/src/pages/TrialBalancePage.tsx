import { useEffect, useState } from "react";
import { api } from "../api/client";
import { TrialBalanceRow } from "../lib/types";
import { formatCurrency } from "../lib/format";

type TrialBalanceResponse = {
  rows: TrialBalanceRow[];
  totals: { totalDebit: number; totalCredit: number };
  balanced: boolean;
};

export function TrialBalancePage() {
  const [data, setData] = useState<TrialBalanceResponse | null>(null);

  useEffect(() => {
    api.get<TrialBalanceResponse>("/accounting/trial-balance").then(setData);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Trial Balance</h1>
      <p className="text-sm text-slate-500 mb-4">Sum of debits vs. credits per account.</p>

      {!data ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div
            className={`mb-4 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              data.balanced ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}
          >
            {data.balanced ? "Balanced" : "Out of balance"}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2 text-right">Total Debit</th>
                  <th className="px-4 py-2 text-right">Total Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.accountCode} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {r.accountCode} — {r.accountLabel}
                    </td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.totalDebit)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.totalCredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(data.totals.totalDebit)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(data.totals.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
