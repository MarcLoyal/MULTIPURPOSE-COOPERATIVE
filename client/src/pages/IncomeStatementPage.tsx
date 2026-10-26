import { useEffect, useState } from "react";
import { api } from "../api/client";
import { IncomeStatement } from "../lib/types";
import { formatCurrency } from "../lib/format";

export function IncomeStatementPage() {
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    api.get<IncomeStatement>(`/accounting/income-statement${qs ? `?${qs}` : ""}`).then(setData);
  }

  useEffect(load, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Income Statement</h1>
      <p className="text-sm text-slate-500 mb-4">
        Revenue and expenses for a period, netting to the surplus (or deficit) statutory fund allocation is based on.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
          Filter
        </button>
      </div>

      {!data ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">Revenue</div>
            <table className="w-full text-sm">
              <tbody>
                {data.revenueRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={2}>
                      No revenue in this period.
                    </td>
                  </tr>
                ) : (
                  data.revenueRows.map((r) => (
                    <tr key={r.accountCode} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        {r.accountCode} — {r.accountLabel}
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-4 py-2">Total Revenue</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(data.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">Expenses</div>
            <table className="w-full text-sm">
              <tbody>
                {data.expenseRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={2}>
                      No expenses in this period.
                    </td>
                  </tr>
                ) : (
                  data.expenseRows.map((r) => (
                    <tr key={r.accountCode} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        {r.accountCode} — {r.accountLabel}
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-4 py-2">Total Expenses</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(data.totalExpense)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
            <p className="text-slate-700 font-medium">{data.netSurplus >= 0 ? "Net Surplus" : "Net Deficit"}</p>
            <p className={`text-xl font-semibold ${data.netSurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatCurrency(Math.abs(data.netSurplus))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
