import { useEffect, useState } from "react";
import { api } from "../api/client";
import { DividendEstimate, LoanLimit, Member, ShareCapitalTransaction } from "../lib/types";
import { Badge } from "../components/Badge";
import { formatCurrency, formatDate } from "../lib/format";

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold mt-1 text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export function PortalPage() {
  const [me, setMe] = useState<Member | null>(null);
  const [loanLimit, setLoanLimit] = useState<LoanLimit | null>(null);
  const [estimate, setEstimate] = useState<DividendEstimate | null>(null);
  const [dividends, setDividends] = useState<ShareCapitalTransaction[] | null>(null);

  useEffect(() => {
    api.get<Member>("/portal/me").then(setMe);
    api.get<LoanLimit>("/portal/loan-limit").then(setLoanLimit);
    api.get<DividendEstimate>("/portal/dividend-estimate").then(setEstimate);
    api.get<ShareCapitalTransaction[]>("/portal/dividend-history").then(setDividends);
  }, []);

  if (!me) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{me.fullName}</h1>
        <p className="text-sm text-slate-500">
          {me.memberNumber} · <Badge value={me.status} />
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          label="Share Capital Balance"
          value={me.shareCapitalAccount ? formatCurrency(me.shareCapitalAccount.balance) : formatCurrency(0)}
        />
        {loanLimit && (
          <Card
            label="Loanable Amount"
            value={formatCurrency(loanLimit.loanableAmount)}
            sub="Placeholder rule — not yet confirmed by board policy"
          />
        )}
        <Card
          label="Active Loans"
          value={String((me.loanAccounts ?? []).filter((l) => ["active", "past_due"].includes(l.status)).length)}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-900 mb-1">Estimated Dividend — This Fiscal Year</h2>
        {!estimate ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !estimate.available ? (
          <p className="text-sm text-slate-500">{estimate.reason}</p>
        ) : (
          <div>
            <p className="text-2xl font-semibold text-slate-900">{formatCurrency(estimate.estimatedTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Interest on share capital: {formatCurrency(estimate.estimatedShareCapitalInterest)} · Patronage
              refund: {formatCurrency(estimate.estimatedPatronageRefund)}
            </p>
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-3 mt-3">
              <p className="font-medium mb-1">This is only an estimate, not a promise</p>
              <p>{estimate.assumptions}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <h2 className="font-medium text-slate-900 px-5 pt-4 pb-2">Loans</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Principal</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(me.loanAccounts ?? []).length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={3}>
                  No loans yet.
                </td>
              </tr>
            ) : (
              me.loanAccounts!.map((loan) => (
                <tr key={loan.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{loan.loanProduct}</td>
                  <td className="px-4 py-2">{formatCurrency(loan.principalAmount)}</td>
                  <td className="px-4 py-2">
                    <Badge value={loan.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <h2 className="font-medium text-slate-900 px-5 pt-4 pb-2">Deposits</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(me.depositAccounts ?? []).length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={3}>
                  No deposit accounts yet.
                </td>
              </tr>
            ) : (
              me.depositAccounts!.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{d.depositProduct?.name ?? "—"}</td>
                  <td className="px-4 py-2">{formatCurrency(d.balance)}</td>
                  <td className="px-4 py-2">
                    <Badge value={d.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <h2 className="font-medium text-slate-900 px-5 pt-4 pb-2">Dividend History</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {!dividends || dividends.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={2}>
                  {dividends === null ? "Loading…" : "No dividends distributed yet."}
                </td>
              </tr>
            ) : (
              dividends.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{formatDate(d.createdAt)}</td>
                  <td className="px-4 py-2">{formatCurrency(d.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
