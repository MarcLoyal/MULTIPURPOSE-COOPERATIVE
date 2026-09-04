import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Member, ShareCapitalTransaction, ShareCapitalTxnType } from "../lib/types";
import { Badge } from "../components/Badge";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const TYPES: ShareCapitalTxnType[] = ["subscription", "additional_purchase", "withdrawal", "transfer", "dividend"];
const CAN_RECORD = ["cashier", "accountant", "manager", "admin"];
const CAN_APPROVE = ["manager", "admin"];

export function ShareCapitalPage() {
  const { user } = useAuth();
  const [txns, setTxns] = useState<ShareCapitalTransaction[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ memberId: "", type: "subscription" as ShareCapitalTxnType, amount: "" });

  function load() {
    api.get<ShareCapitalTransaction[]>("/share-capital/transactions").then(setTxns);
  }

  useEffect(() => {
    load();
    api.get<Member[]>("/members").then(setMembers);
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/share-capital/transactions", { ...form, amount: Number(form.amount) });
      setShowForm(false);
      setForm({ memberId: "", type: "subscription", amount: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record transaction");
    }
  }

  async function act(id: string, action: "approve" | "reject") {
    setError(null);
    try {
      await api.post(`/share-capital/transactions/${id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    }
  }

  const canRecord = user && CAN_RECORD.includes(user.role);
  const canApprove = user && CAN_APPROVE.includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Share Capital</h1>
          <p className="text-sm text-slate-500">Subscriptions, withdrawals, transfers — pending → approved → posted.</p>
        </div>
        {canRecord && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "Record Transaction"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">
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
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ShareCapitalTxnType })}
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
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Submit
          </button>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
              {canApprove && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {txns === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : txns.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  No share capital transactions yet.
                </td>
              </tr>
            ) : (
              txns.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">{t.account?.member.fullName ?? "—"}</td>
                  <td className="px-4 py-2">{t.type}</td>
                  <td className="px-4 py-2">{Number(t.amount).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <Badge value={t.status} />
                  </td>
                  <td className="px-4 py-2">{formatDateTime(t.createdAt)}</td>
                  {canApprove && (
                    <td className="px-4 py-2">
                      {t.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => act(t.id, "approve")}
                            className="text-emerald-700 text-xs font-medium hover:underline"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => act(t.id, "reject")}
                            className="text-rose-700 text-xs font-medium hover:underline"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
