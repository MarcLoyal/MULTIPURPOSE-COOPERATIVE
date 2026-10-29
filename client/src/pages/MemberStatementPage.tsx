import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { MemberStatement } from "../lib/types";
import { Badge } from "../components/Badge";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum } from "../lib/format";

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
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <p className="text-rose-600 mb-3">{error}</p>
        <Link to={id ? `/members/${id}` : "/portal"} className="text-sm text-slate-500 hover:underline">
          ← Back
        </Link>
      </div>
    );
  }

  if (!statement) return <p className="text-slate-500 mt-12 text-center">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto py-10 print:py-0">
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Link to={id ? `/members/${id}` : "/portal"} className="text-sm text-slate-500 hover:underline">
          ← Back
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
        >
          Print
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:rounded-none print:p-0 space-y-8">
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
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Type</th>
                <th className="px-3 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {!statement.shareCapital || statement.shareCapital.transactions.length === 0 ? (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={3}>
                    No share capital transactions.
                  </td>
                </tr>
              ) : (
                statement.shareCapital.transactions.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{formatDate(t.createdAt)}</td>
                    <td className="px-3 py-1.5">{humanizeEnum(t.type)}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(t.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900 mb-2">Loans</h2>
          {statement.loans.length === 0 ? (
            <p className="text-sm text-slate-500">No loans.</p>
          ) : (
            <div className="space-y-4">
              {statement.loans.map((loan) => (
                <div key={loan.id}>
                  <div className="flex justify-between items-baseline mb-1">
                    <p className="text-sm font-medium">
                      {loan.loanProduct} — {formatCurrency(loan.principalAmount)}
                    </p>
                    <Badge value={loan.status} />
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600 text-left">
                      <tr>
                        <th className="px-3 py-1.5">Date</th>
                        <th className="px-3 py-1.5">Type</th>
                        <th className="px-3 py-1.5 text-right">Amount</th>
                        <th className="px-3 py-1.5 text-right">Balance After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loan.transactions.map((t) => (
                        <tr key={t.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">{formatDate(t.createdAt)}</td>
                          <td className="px-3 py-1.5 capitalize">{t.type}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(t.amount)}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(t.balanceAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
            <div className="space-y-4">
              {statement.deposits.map((account) => (
                <div key={account.id}>
                  <div className="flex justify-between items-baseline mb-1">
                    <p className="text-sm font-medium">
                      {account.productName} — {formatCurrency(account.balance)}
                    </p>
                    <Badge value={account.status} />
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600 text-left">
                      <tr>
                        <th className="px-3 py-1.5">Date</th>
                        <th className="px-3 py-1.5">Type</th>
                        <th className="px-3 py-1.5 text-right">Amount</th>
                        <th className="px-3 py-1.5 text-right">Balance After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.transactions.map((t) => (
                        <tr key={t.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">{formatDate(t.createdAt)}</td>
                          <td className="px-3 py-1.5">{humanizeEnum(t.type)}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(t.amount)}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(t.balanceAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
