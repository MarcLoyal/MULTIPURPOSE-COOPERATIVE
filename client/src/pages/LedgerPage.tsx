import { useEffect, useState } from "react";
import { api } from "../api/client";
import { LedgerEntry } from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";

export function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountCode, setAccountCode] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (accountCode) params.set("accountCode", accountCode);
    const qs = params.toString();
    api.get<LedgerEntry[]>(`/accounting/ledger${qs ? `?${qs}` : ""}`).then(setEntries);
  }

  useEffect(load, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">General Ledger</h1>
      <p className="text-sm text-slate-500 mb-4">Read-only. Every row is system-generated from a posted transaction.</p>

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
        <input
          placeholder="Account code (e.g. 1000)"
          value={accountCode}
          onChange={(e) => setAccountCode(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
          Filter
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Memo</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No ledger entries match this filter.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{formatDate(e.entryDate)}</td>
                  <td className="px-4 py-2">
                    {e.accountCode} — {e.accountLabel}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{e.memo ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{Number(e.debit) > 0 ? formatCurrency(e.debit) : ""}</td>
                  <td className="px-4 py-2 text-right">{Number(e.credit) > 0 ? formatCurrency(e.credit) : ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
