import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { CashTransaction, CashTxnType } from "../lib/types";
import { formatCurrency, formatDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const TYPES: CashTxnType[] = ["collection", "disbursement", "petty_cash", "cash_advance", "bank_deposit"];
const CAN_RECORD = ["cashier", "accountant", "admin"];

export function CashPage() {
  const { user } = useAuth();
  const [txns, setTxns] = useState<CashTransaction[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "collection" as CashTxnType,
    amount: "",
    officialReceiptNumber: "",
    referenceType: "",
  });

  function load() {
    api.get<CashTransaction[]>("/cash/transactions").then(setTxns);
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/cash/transactions", { ...form, amount: Number(form.amount) });
      setShowForm(false);
      setForm({ type: "collection", amount: "", officialReceiptNumber: "", referenceType: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record cash transaction");
    }
  }

  const canRecord = user && CAN_RECORD.includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cash Management</h1>
          <p className="text-sm text-slate-500">Receipt-based cash journal — every entry requires an OR number.</p>
        </div>
        {canRecord && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "Record Cash Transaction"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CashTxnType })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Official Receipt Number"
              value={form.officialReceiptNumber}
              onChange={(e) => setForm({ ...form, officialReceiptNumber: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Reference (optional, e.g. 'other')"
              value={form.referenceType}
              onChange={(e) => setForm({ ...form, referenceType: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Submit
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">OR #</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {txns === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : txns.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  No cash transactions yet.
                </td>
              </tr>
            ) : (
              txns.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{t.officialReceiptNumber}</td>
                  <td className="px-4 py-2 capitalize">{t.type.replace("_", " ")}</td>
                  <td className="px-4 py-2">{formatCurrency(t.amount)}</td>
                  <td className="px-4 py-2">{formatDateTime(t.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
