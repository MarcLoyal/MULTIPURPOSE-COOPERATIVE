import { useEffect, useState } from "react";
import { api } from "../api/client";
import { BalanceSheet, BalanceSheetRow } from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";

function Section({
  title,
  rows,
  total,
  totalLabel,
}: {
  title: string;
  rows: BalanceSheetRow[];
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-slate-500" colSpan={2}>
                None.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.accountCode} className="border-t border-slate-100">
                <td className={`px-4 py-2 ${r.isContra ? "pl-8 text-slate-500" : ""}`}>
                  {r.isContra ? "Less: " : ""}
                  {r.accountCode} — {r.accountLabel}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.isContra ? `(${formatCurrency(r.amount)})` : formatCurrency(r.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="px-4 py-2">{totalLabel}</td>
            <td className="px-4 py-2 text-right">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function BalanceSheetPage() {
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [asOf, setAsOf] = useState("");

  function load() {
    const qs = asOf ? `?asOf=${asOf}` : "";
    api.get<BalanceSheet>(`/accounting/balance-sheet${qs}`).then(setData);
  }

  useEffect(load, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Statement of Financial Condition</h1>
      <p className="text-sm text-slate-500 mb-4">
        Assets, liabilities, and members' equity as of a point in time.
      </p>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
          {asOf ? "View as of date" : "View as of today"}
        </button>
      </div>

      {!data ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">As of {formatDate(data.asOf)}</p>
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                data.balanced ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}
            >
              {data.balanced ? "Balanced" : "Out of balance"}
            </div>
          </div>

          <Section title="Assets" rows={data.assetRows} total={data.totalAssets} totalLabel="Total Assets" />
          <Section
            title="Liabilities"
            rows={data.liabilityRows}
            total={data.totalLiabilities}
            totalLabel="Total Liabilities"
          />

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">Members' Equity</div>
            <table className="w-full text-sm">
              <tbody>
                {data.equityRows.length === 0 && data.unclosedNetSurplus === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={2}>
                      None.
                    </td>
                  </tr>
                ) : (
                  <>
                    {data.equityRows.map((r) => (
                      <tr key={r.accountCode} className="border-t border-slate-100">
                        <td className={`px-4 py-2 ${r.isContra ? "pl-8 text-slate-500" : ""}`}>
                          {r.isContra ? "Less: " : ""}
                          {r.accountCode} — {r.accountLabel}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {r.isContra ? `(${formatCurrency(r.amount)})` : formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                    {data.unclosedNetSurplus !== 0 && (
                      <tr className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-500">
                          Current Period Net Surplus (Unclosed)
                          <span className="block text-xs text-slate-400">
                            Not yet moved to statutory funds / undivided surplus by a fiscal year close.
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(data.unclosedNetSurplus)}</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-4 py-2">Total Members' Equity</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(data.totalEquity)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
            <p className="text-slate-700 font-medium">Total Liabilities + Equity</p>
            <p className="text-xl font-semibold">{formatCurrency(data.totalLiabilities + data.totalEquity)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
