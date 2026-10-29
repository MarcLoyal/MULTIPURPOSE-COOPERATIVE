import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { FiscalYear } from "../lib/types";
import { formatDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const CAN_CREATE = ["manager", "accountant", "admin"];

export function FiscalYearsPage() {
  const { user } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [yearEndDate, setYearEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<FiscalYear[]>("/accounting/fiscal-years").then(setFiscalYears);
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/accounting/fiscal-years", { yearEndDate });
      setShowForm(false);
      setYearEndDate("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create fiscal year");
    }
  }

  const canCreate = user && CAN_CREATE.includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Fiscal Years</h1>
          <p className="text-sm text-slate-500">Year-end close and statutory fund allocation (RA 9520 Art. 86).</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "New Fiscal Year"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="flex gap-3 items-center">
            <label className="text-sm text-slate-600">Year-end date</label>
            <input
              required
              type="date"
              value={yearEndDate}
              onChange={(e) => setYearEndDate(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
              Create
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      )}

      {error && !showForm && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Year End Date</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Reserve</th>
              <th className="px-4 py-2">CETF</th>
              <th className="px-4 py-2">Community Dev</th>
              <th className="px-4 py-2">Optional</th>
            </tr>
          </thead>
          <tbody>
            {fiscalYears === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : fiscalYears.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  No fiscal years yet.
                </td>
              </tr>
            ) : (
              fiscalYears.map((fy) => (
                <tr key={fy.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/fiscal-years/${fy.id}`} className="text-slate-900 font-medium hover:underline">
                      {formatDate(fy.yearEndDate)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className={fy.status === "open" ? "text-emerald-700" : "text-slate-400"}>
                      {fy.status === "open" ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {fy.statutoryFundAllocation ? `${Number(fy.statutoryFundAllocation.reserveFundPercent)}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {fy.statutoryFundAllocation ? `${Number(fy.statutoryFundAllocation.cetfPercent)}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {fy.statutoryFundAllocation ? `${Number(fy.statutoryFundAllocation.communityDevFundPercent)}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {fy.statutoryFundAllocation ? `${Number(fy.statutoryFundAllocation.optionalFundPercent)}%` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
