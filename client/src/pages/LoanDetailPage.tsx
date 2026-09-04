import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { LoanAccount } from "../lib/types";
import { Badge } from "../components/Badge";
import { ActivityLog } from "../components/ActivityLog";
import { formatCurrency, formatDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const TABS = ["Overview", "Repayment Schedule", "Activity Log"] as const;

export function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [loan, setLoan] = useState<LoanAccount | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [repaymentAmount, setRepaymentAmount] = useState("");

  function load() {
    if (!id) return;
    api.get<LoanAccount>(`/loans/${id}`).then(setLoan);
  }

  useEffect(load, [id]);

  async function act(action: string, body?: unknown) {
    if (!id) return;
    setError(null);
    try {
      await api.post(`/loans/${id}/${action}`, body);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    await act("review", { reviewNotes });
    setReviewNotes("");
  }

  async function submitRepayment(e: FormEvent) {
    e.preventDefault();
    await act("repayments", { amount: Number(repaymentAmount) });
    setRepaymentAmount("");
  }

  if (!loan) return <p className="text-slate-500">Loading…</p>;

  const role = user?.role;

  return (
    <div>
      <Link to="/loans" className="text-sm text-slate-500 hover:underline">
        ← Back to Loans
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {loan.loanProduct} — {loan.member?.fullName}
          </h1>
          <p className="text-sm text-slate-500">
            Principal {formatCurrency(loan.principalAmount)} · {loan.termMonths} months ·{" "}
            {(Number(loan.interestRate) * 100).toFixed(2)}%/mo flat
          </p>
        </div>
        <Badge value={loan.status} />
      </div>

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-6">
        {loan.status === "applied" && role === "credit_officer" && (
          <form onSubmit={submitReview} className="flex gap-2 items-center">
            <input
              required
              placeholder="Evaluation notes"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
              Move to Under Review
            </button>
          </form>
        )}
        {loan.status === "under_review" && (role === "manager" || role === "admin") && (
          <>
            <button
              onClick={() => act("approve")}
              className="rounded-md bg-emerald-600 text-white text-sm px-4 py-2 hover:bg-emerald-700"
            >
              Approve Loan
            </button>
            <button
              onClick={() => act("reject")}
              className="rounded-md bg-rose-600 text-white text-sm px-4 py-2 hover:bg-rose-700"
            >
              Reject
            </button>
          </>
        )}
        {loan.status === "approved" && (role === "cashier" || role === "admin") && (
          <button
            onClick={() => act("release")}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            Release Loan
          </button>
        )}
      </div>

      <div className="border-b border-slate-200 mb-4">
        <nav className="flex gap-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-1 py-2 text-sm border-b-2 ${
                tab === t ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === "Overview" && (
        <div className="space-y-4">
          {loan.aging && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Outstanding Balance</p>
                <p className="text-lg font-semibold">{formatCurrency(loan.aging.outstandingBalance)}</p>
              </div>
              <div>
                <p className="text-slate-500">Next Due Date</p>
                <p className="text-lg font-semibold">{formatDate(loan.aging.nextDueDate)}</p>
              </div>
              <div>
                <p className="text-slate-500">Days Past Due</p>
                <p className={`text-lg font-semibold ${loan.aging.daysPastDue > 0 ? "text-rose-600" : ""}`}>
                  {loan.aging.daysPastDue}
                </p>
              </div>
            </div>
          )}

          {["active", "past_due"].includes(loan.status) && (role === "cashier" || role === "admin") && (
            <form onSubmit={submitRepayment} className="bg-white border border-slate-200 rounded-xl p-5 flex gap-2 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Record repayment</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
                Submit Repayment
              </button>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Balance After</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {(loan.transactions ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={4}>
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  loan.transactions!.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 capitalize">{t.type}</td>
                      <td className="px-4 py-2">{formatCurrency(t.amount)}</td>
                      <td className="px-4 py-2">{formatCurrency(t.balanceAfter)}</td>
                      <td className="px-4 py-2">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Repayment Schedule" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {!loan.schedule ? (
            <p className="px-4 py-4 text-sm text-slate-500">Schedule is generated once the loan is released.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Due Date</th>
                  <th className="px-4 py-2">Principal</th>
                  <th className="px-4 py-2">Interest</th>
                  <th className="px-4 py-2">Total Due</th>
                </tr>
              </thead>
              <tbody>
                {loan.schedule.map((i) => (
                  <tr key={i.installmentNumber} className="border-t border-slate-100">
                    <td className="px-4 py-2">{i.installmentNumber}</td>
                    <td className="px-4 py-2">{formatDate(i.dueDate)}</td>
                    <td className="px-4 py-2">{formatCurrency(i.principalDue)}</td>
                    <td className="px-4 py-2">{formatCurrency(i.interestDue)}</td>
                    <td className="px-4 py-2">{formatCurrency(i.totalDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Activity Log" && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <ActivityLog entityType="LoanAccount" entityId={loan.id} />
        </div>
      )}
    </div>
  );
}
