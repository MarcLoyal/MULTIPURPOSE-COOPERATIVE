import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { DepositProduct, DepositType } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { formatCurrency } from "../lib/format";

const CAN_EDIT = ["manager", "accountant", "admin"];

export function DepositProductsSettingsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<DepositProduct[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "savings" as DepositType,
    interestRate: "0.0025",
    minimumBalance: "0",
    creditingFrequencyMonths: "1",
    termMonths: "6",
    preTerminationPenaltyRate: "0.01",
  });

  function load() {
    api.get<DepositProduct[]>("/deposits/products").then(setProducts);
  }

  useEffect(load, []);

  const canEdit = user && CAN_EDIT.includes(user.role);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/deposits/products", {
        name: form.name,
        type: form.type,
        interestRate: Number(form.interestRate),
        minimumBalance: Number(form.minimumBalance),
        creditingFrequencyMonths: Number(form.creditingFrequencyMonths),
        ...(form.type === "time"
          ? { termMonths: Number(form.termMonths), preTerminationPenaltyRate: Number(form.preTerminationPenaltyRate) }
          : {}),
      });
      setShowForm(false);
      setForm({ ...form, name: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create product");
    }
  }

  async function toggleActive(product: DepositProduct) {
    setError(null);
    try {
      await api.patch(`/deposits/products/${product.id}`, { isActive: !product.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update product");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Deposit Products</h1>
          <p className="text-sm text-slate-500">Board-approved savings and time deposit products.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "New Product"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              placeholder="Name (e.g. Regular Savings)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as DepositType })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="savings">Savings</option>
              <option value="time">Time Deposit</option>
            </select>
            <input
              required
              type="number"
              min="0"
              step="0.0001"
              placeholder="Interest rate per crediting period (e.g. 0.0025 = 0.25%)"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Minimum balance"
              value={form.minimumBalance}
              onChange={(e) => setForm({ ...form, minimumBalance: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="1"
              step="1"
              placeholder="Crediting frequency (months)"
              value={form.creditingFrequencyMonths}
              onChange={(e) => setForm({ ...form, creditingFrequencyMonths: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {form.type === "time" && (
              <>
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
                <input
                  required
                  type="number"
                  min="0"
                  max="1"
                  step="0.0001"
                  placeholder="Pre-termination penalty rate (e.g. 0.01 = 1%)"
                  value={form.preTerminationPenaltyRate}
                  onChange={(e) => setForm({ ...form, preTerminationPenaltyRate: e.target.value })}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Create Product
          </button>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Rate / period</th>
              <th className="px-4 py-2">Term</th>
              <th className="px-4 py-2">Min. Balance</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {products === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={7}>
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={7}>
                  No deposit products yet.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{p.type === "time" ? "Time Deposit" : "Savings"}</td>
                  <td className="px-4 py-2">{(Number(p.interestRate) * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2">{p.termMonths ? `${p.termMonths} mo` : "—"}</td>
                  <td className="px-4 py-2">{formatCurrency(p.minimumBalance)}</td>
                  <td className="px-4 py-2">
                    <span className={p.isActive ? "text-emerald-700" : "text-slate-400"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2">
                      <button onClick={() => toggleActive(p)} className="text-xs font-medium hover:underline">
                        {p.isActive ? "Deactivate" : "Reactivate"}
                      </button>
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
