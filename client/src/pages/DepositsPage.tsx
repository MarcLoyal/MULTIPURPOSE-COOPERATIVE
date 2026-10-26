import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DepositAccount, DepositProduct, Member } from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const CAN_OPEN = ["cashier", "manager", "admin"];

export function DepositsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<DepositAccount[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [products, setProducts] = useState<DepositProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ memberId: "", depositProductId: "", openingDeposit: "" });

  function load() {
    api.get<DepositAccount[]>("/deposits/accounts").then(setAccounts);
  }

  useEffect(() => {
    load();
    api.get<Member[]>("/members?status=active").then(setMembers);
    api.get<DepositProduct[]>("/deposits/products").then((p) => setProducts(p.filter((x) => x.isActive)));
  }, []);

  async function handleOpen(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/deposits/accounts", {
        memberId: form.memberId,
        depositProductId: form.depositProductId,
        openingDeposit: form.openingDeposit ? Number(form.openingDeposit) : 0,
      });
      setShowForm(false);
      setForm({ memberId: "", depositProductId: "", openingDeposit: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open account");
    }
  }

  const canOpen = user && CAN_OPEN.includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Deposits</h1>
          <p className="text-sm text-slate-500">Savings and time deposit accounts.</p>
        </div>
        {canOpen && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "Open Account"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleOpen} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
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
              required
              value={form.depositProductId}
              onChange={(e) => setForm({ ...form, depositProductId: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type === "time" ? "Time" : "Savings"})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Opening deposit (optional)"
              value={form.openingDeposit}
              onChange={(e) => setForm({ ...form, openingDeposit: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Open Account
          </button>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Opened</th>
            </tr>
          </thead>
          <tbody>
            {accounts === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No deposit accounts yet.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/deposits/${a.id}`} className="text-slate-900 font-medium hover:underline">
                      {a.member?.fullName ?? a.memberId}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{a.depositProduct?.name ?? "—"}</td>
                  <td className="px-4 py-2">{formatCurrency(a.balance)}</td>
                  <td className="px-4 py-2">
                    <span className={a.status === "active" ? "text-emerald-700" : "text-slate-400"}>
                      {a.status === "active" ? "Active" : "Closed"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{formatDate(a.openedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
