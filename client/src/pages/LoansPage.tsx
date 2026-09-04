import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { LoanAccount, Member } from "../lib/types";
import { Badge } from "../components/Badge";
import { useAuth } from "../context/AuthContext";

const CAN_APPLY = ["credit_officer", "admin"];

export function LoansPage() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<LoanAccount[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    memberId: "",
    loanProduct: "Regular Loan",
    principalAmount: "",
    interestRate: "0.02",
    termMonths: "12",
  });

  function load() {
    api.get<LoanAccount[]>("/loans").then(setLoans);
  }

  useEffect(() => {
    load();
    api.get<Member[]>("/members?status=active").then(setMembers);
  }, []);

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/loans", {
        ...form,
        principalAmount: Number(form.principalAmount),
        interestRate: Number(form.interestRate),
        termMonths: Number(form.termMonths),
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit application");
    }
  }

  const canApply = user && CAN_APPLY.includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Loans</h1>
          <p className="text-sm text-slate-500">Application → review → approval → release → repayment.</p>
        </div>
        {canApply && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "New Application"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleApply} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              required
              value={form.memberId}
              onChange={(e) => setForm({ ...form, memberId: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.memberNumber} — {m.fullName}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Loan product (e.g. Regular Loan)"
              value={form.loanProduct}
              onChange={(e) => setForm({ ...form, loanProduct: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Principal amount"
              value={form.principalAmount}
              onChange={(e) => setForm({ ...form, principalAmount: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              step="0.0001"
              placeholder="Flat monthly interest rate (e.g. 0.02 = 2%/mo)"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="1"
              step="1"
              placeholder="Term (months)"
              value={form.termMonths}
              onChange={(e) => setForm({ ...form, termMonths: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Submit Application
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Principal</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Days Past Due</th>
            </tr>
          </thead>
          <tbody>
            {loans === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : loans.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No loans yet.
                </td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr key={loan.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/loans/${loan.id}`} className="text-slate-900 font-medium hover:underline">
                      {loan.member?.fullName ?? loan.memberId}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{loan.loanProduct}</td>
                  <td className="px-4 py-2">{Number(loan.principalAmount).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <Badge value={loan.status} />
                  </td>
                  <td className="px-4 py-2">{loan.aging?.daysPastDue ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
