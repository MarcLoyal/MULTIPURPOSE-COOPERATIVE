import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { MemberStatement } from "../lib/types";
import { Badge } from "../components/Badge";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum } from "../lib/format";

type Row = { id: string; date: string; type: string; amount: number; balanceAfter?: number };

/**
 * One row set, two renderings: cards on screen (phone-first — a 4-column
 * table is cramped at phone width), an actual <table> for print (a
 * financial statement someone prints or saves as PDF reads better as a
 * table, and print output isn't viewed on a phone screen anyway). Only
 * one of the two is ever visible at a time — "hidden"/"print:hidden" and
 * "hidden print:block" are each other's exact opposite, never both shown.
 */
function TransactionRows({ rows, emptyText }: { rows: Row[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <>
      <div className="space-y-2 print:hidden">
        {rows.map((t) => (
          <div key={t.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{humanizeEnum(t.type)}</p>
              <p className="text-xs text-slate-500">{formatDate(t.date)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium text-slate-900">{formatCurrency(t.amount)}</p>
              {t.balanceAfter !== undefined && (
                <p className="text-xs text-slate-500">Balance: {formatCurrency(t.balanceAfter)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <table className="w-full text-sm hidden print:block">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="px-3 py-1.5">Date</th>
            <th className="px-3 py-1.5">Type</th>
            <th className="px-3 py-1.5 text-right">Amount</th>
            {rows[0]?.balanceAfter !== undefined && <th className="px-3 py-1.5 text-right">Balance After</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-slate-100">
              <td className="px-3 py-1.5">{formatDate(t.date)}</td>
              <td className="px-3 py-1.5">{humanizeEnum(t.type)}</td>
              <td className="px-3 py-1.5 text-right">{formatCurrency(t.amount)}</td>
              {t.balanceAfter !== undefined && <td className="px-3 py-1.5 text-right">{formatCurrency(t.balanceAfter)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Printable/downloadable statement of account. Reused on two routes:
 * /members/:id/statement (staff, any member) and /portal/statement
 * (member, always their own — the portal API never takes an id at
 * all, see portal.routes.ts). The :id param is what tells this
 * component which one it's on.
 */
export function MemberStatementPage() {
  const { id } = useParams<{ id: string }>();
  const [statement, setStatement] = useState<MemberStatement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = id ? `/members/${id}/statement` : `/portal/statement`;
    api
      .get<MemberStatement>(path)
      .then(setStatement)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load statement"));
  }, [id]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center px-4">
        <p className="text-rose-600 mb-3">{error}</p>
        <Link to={id ? `/members/${id}` : "/portal"} className="text-sm text-slate-500 hover:underline">
          ← Back
        </Link>
      </div>
    );
  }

  if (!statement) return <p className="text-slate-500 mt-12 text-center">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-10 print:py-0">
      {/* Only the staff route has a parent page to go "back" to in-app;
          the portal route is reached via the bottom nav, not a back
          link, so this row is staff-only — the Print button stays for
          everyone. */}
      <div className="flex justify-between items-center mb-6 px-1 print:hidden">
        {id ? (
          <Link to={`/members/${id}`} className="text-sm text-slate-500 hover:underline py-2">
            ← Back
          </Link>
        ) : (
          <span />
        )}
        <button
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 text-white text-sm px-4 py-2.5 hover:bg-slate-800"
        >
          Print
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 print:border-0 print:rounded-none print:p-0 space-y-8">
        <div className="text-center border-b border-slate-200 pb-6">
          <p className="font-semibold text-lg text-slate-900">Multipurpose Cooperative</p>
          <p className="text-sm text-slate-500">Statement of Account</p>
          <p className="text-xs text-slate-400 mt-1">Generated {formatDateTime(statement.generatedAt)}</p>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">Member</dt>
          <dd className="text-right font-medium">{statement.member.fullName}</dd>
          <dt className="text-slate-500">Member No.</dt>
          <dd className="text-right font-medium">{statement.member.memberNumber}</dd>
          <dt className="text-slate-500">Status</dt>
          <dd className="text-right">
            <Badge value={statement.member.status} />
          </dd>
          <dt className="text-slate-500">Date Joined</dt>
          <dd className="text-right font-medium">{formatDate(statement.member.dateJoined)}</dd>
        </dl>

        <section>
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="font-semibold text-slate-900">Share Capital</h2>
            <p className="text-sm font-medium">
              Balance: {statement.shareCapital ? formatCurrency(statement.shareCapital.balance) : formatCurrency(0)}
            </p>
          </div>
          <TransactionRows
            rows={(statement.shareCapital?.transactions ?? []).map((t) => ({
              id: t.id,
              date: t.createdAt,
              type: t.type,
              amount: t.amount,
            }))}
            emptyText="No share capital transactions."
          />
        </section>

        <section>
          <h2 className="font-semibold text-slate-900 mb-2">Loans</h2>
          {statement.loans.length === 0 ? (
            <p className="text-sm text-slate-500">No loans.</p>
          ) : (
            <div className="space-y-5">
              {statement.loans.map((loan) => (
                <div key={loan.id}>
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-sm font-medium">
                      {loan.loanProduct} — {formatCurrency(loan.principalAmount)}
                    </p>
                    <Badge value={loan.status} />
                  </div>
                  <TransactionRows
                    rows={loan.transactions.map((t) => ({
                      id: t.id,
                      date: t.createdAt,
                      type: t.type,
                      amount: t.amount,
                      balanceAfter: t.balanceAfter,
                    }))}
                    emptyText="No transactions."
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-slate-900 mb-2">Deposits</h2>
          {statement.deposits.length === 0 ? (
            <p className="text-sm text-slate-500">No deposit accounts.</p>
          ) : (
            <div className="space-y-5">
              {statement.deposits.map((account) => (
                <div key={account.id}>
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-sm font-medium">
                      {account.productName} — {formatCurrency(account.balance)}
                    </p>
                    <Badge value={account.status} />
                  </div>
                  <TransactionRows
                    rows={account.transactions.map((t) => ({
                      id: t.id,
                      date: t.createdAt,
                      type: t.type,
                      amount: t.amount,
                      balanceAfter: t.balanceAfter,
                    }))}
                    emptyText="No transactions."
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
