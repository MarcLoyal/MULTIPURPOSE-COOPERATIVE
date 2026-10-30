import { useEffect, useState } from "react";
import { api } from "../api/client";
import { CashFlowRow, StatementOfCashFlows } from "../lib/types";
import { formatCurrency } from "../lib/format";

function CashFlowSection({ title, rows, net }: { title: string; rows: CashFlowRow[]; net: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-slate-500" colSpan={2}>
                No activity in this period.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2 text-right">
                  {r.amount < 0 ? `(${formatCurrency(Math.abs(r.amount))})` : formatCurrency(r.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="px-4 py-2">Net cash {net >= 0 ? "provided by" : "used in"} {title.toLowerCase()}</td>
            <td className="px-4 py-2 text-right">
              {net < 0 ? `(${formatCurrency(Math.abs(net))})` : formatCurrency(net)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function CashFlowStatementPage() {
  const [data, setData] = useState<StatementOfCashFlows | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    api.get<StatementOfCashFlows>(`/accounting/cash-flow-statement${qs ? `?${qs}` : ""}`).then(setData);
  }

  useEffect(load, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Statement of Cash Flows</h1>
      <p className="text-sm text-slate-500 mb-4">
        Direct method. Lending and deposit-taking are this cooperative's core business, so loan and deposit cash
        movements are classified as operating activities, not investing or financing.
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
          {!data.balanced && (
            <div className="bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-xl p-4">
              This statement doesn't tie out — net change from activities doesn't match the actual change in cash.
              That points to a ledger entry this classification doesn't recognize; check for an "Unclassified cash
              activity" row below.
            </div>
          )}

          <CashFlowSection title="Operating Activities" rows={data.operatingRows} net={data.netOperating} />
          <CashFlowSection title="Investing Activities" rows={data.investingRows} net={data.netInvesting} />
          <CashFlowSection title="Financing Activities" rows={data.financingRows} net={data.netFinancing} />

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-slate-700 font-medium">Net increase (decrease) in cash and cash equivalents</p>
              <p className={`font-semibold ${data.totalNetChange >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {data.totalNetChange < 0
                  ? `(${formatCurrency(Math.abs(data.totalNetChange))})`
                  : formatCurrency(data.totalNetChange)}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <p>Cash and cash equivalents, beginning of period</p>
              <p>{formatCurrency(data.cashBeginning)}</p>
            </div>
            <div className="flex items-center justify-between text-slate-900 font-semibold border-t border-slate-100 pt-2">
              <p>Cash and cash equivalents, end of period</p>
              <p>{formatCurrency(data.cashEnding)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
