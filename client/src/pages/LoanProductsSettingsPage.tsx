import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { LoanProduct } from "../lib/types";
import { useAuth } from "../context/AuthContext";

const CAN_EDIT = ["manager", "accountant", "admin"];

export function LoanProductsSettingsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<LoanProduct[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    interestRate: "0.02",
    ratePeriod: "monthly" as "monthly" | "annual",
    computationMethod: "diminishing_balance" as "diminishing_balance" | "flat",
    amortizationStyle: "equal_payment" as "equal_payment" | "equal_principal",
  });

  function load() {
    api.get<LoanProduct[]>("/loans/products").then(setProducts);
  }

  useEffect(load, []);

  const canEdit = user && CAN_EDIT.includes(user.role);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/loans/products", {
        name: form.name,
        description: form.description || undefined,
        interestRate: Number(form.interestRate),
        ratePeriod: form.ratePeriod,
        computationMethod: form.computationMethod,
        amortizationStyle: form.amortizationStyle,
      });
      setShowForm(false);
      setForm({ ...form, name: "", description: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create product");
    }
  }

  async function toggleActive(product: LoanProduct) {
    setError(null);
    try {
      await api.patch(`/loans/products/${product.id}`, { isActive: !product.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update product");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Loan Products</h1>
          <p className="text-sm text-slate-500">Board-approved loan products. New applications must pick one.</p>
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
              placeholder="Name (e.g. Regular Loan)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              step="0.0001"
              placeholder="Rate per period (e.g. 0.02 = 2%)"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={form.ratePeriod}
              onChange={(e) => setForm({ ...form, ratePeriod: e.target.value as "monthly" | "annual" })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
            <select
              value={form.computationMethod}
              onChange={(e) =>
                setForm({ ...form, computationMethod: e.target.value as "diminishing_balance" | "flat" })
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="diminishing_balance">Diminishing Balance</option>
              <option value="flat">Flat</option>
            </select>
            <select
              value={form.amortizationStyle}
              onChange={(e) =>
                setForm({ ...form, amortizationStyle: e.target.value as "equal_payment" | "equal_principal" })
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="equal_payment">Equal Payment</option>
              <option value="equal_principal">Equal Principal</option>
            </select>
          </div>
          {form.computationMethod === "flat" && (
            <p className="text-xs text-amber-700">
              Flat/advance-deducted products need a written auditor/CDA sign-off per CDA MC 2012-05 — diminishing
              balance is the default for a reason.
            </p>
          )}
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
              <th className="px-4 py-2">Rate / period</th>
              <th className="px-4 py-2">Method</th>
              <th className="px-4 py-2">Amortization</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {products === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  No loan products yet — applications can't be submitted until one exists.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">
                    {(Number(p.interestRate) * 100).toFixed(2)}%/{p.ratePeriod === "annual" ? "yr" : "mo"}
                  </td>
                  <td className="px-4 py-2">{p.computationMethod === "flat" ? "Flat" : "Diminishing Balance"}</td>
                  <td className="px-4 py-2">{p.amortizationStyle === "equal_principal" ? "Equal Principal" : "Equal Payment"}</td>
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
