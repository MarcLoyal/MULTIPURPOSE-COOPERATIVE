import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { DashboardSummary } from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone === "danger" ? "text-rose-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function FiscalYearCard({ fiscalYear }: { fiscalYear: DashboardSummary["fiscalYear"] }) {
  if (!fiscalYear) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <p className="text-sm text-slate-500">Fiscal Year</p>
        <p className="text-lg font-medium mt-1 text-slate-900">No fiscal year set up yet</p>
      </div>
    );
  }

  const detail =
    fiscalYear.status === "open"
      ? "Open — not yet closed"
      : fiscalYear.hasDividendDistribution
        ? "Closed — statutory funds allocated and dividends/patronage refund distributed"
        : fiscalYear.hasStatutoryAllocation
          ? "Closed — statutory funds allocated, dividends/patronage refund not yet distributed"
          : "Closed — no surplus to allocate";

  return (
    <Link
      to={`/fiscal-years/${fiscalYear.id}`}
      className="block bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-slate-300 transition-colors"
    >
      <p className="text-sm text-slate-500">Fiscal Year</p>
      <p className="text-2xl font-semibold mt-1 text-slate-900">
        Ending {formatDate(fiscalYear.yearEndDate)}
        <span
          className={`ml-2 align-middle text-xs font-medium px-2 py-0.5 rounded-full ${
            fiscalYear.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {fiscalYear.status === "open" ? "Open" : "Closed"}
        </span>
      </p>
      <p className="text-xs text-slate-400 mt-1">{detail}</p>
    </Link>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    api.get<DashboardSummary>("/dashboard").then(setSummary);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">Live counts pulled from the current system of record.</p>
      {!summary ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Active Members" value={summary.activeMembers.toLocaleString()} />
            <StatCard label="Active Loans" value={summary.activeLoans.toLocaleString()} />
            <StatCard
              label="Past-Due Loans"
              value={summary.pastDueLoans.toLocaleString()}
              tone={summary.pastDueLoans > 0 ? "danger" : undefined}
            />
            <StatCard label="Total Share Capital" value={formatCurrency(summary.totalShareCapital)} />
            <StatCard label="Total Deposits" value={formatCurrency(summary.totalDeposits)} />
            <StatCard label="Cash Position" value={formatCurrency(summary.cashPosition)} />
          </div>
          <FiscalYearCard fiscalYear={summary.fiscalYear} />
        </div>
      )}
    </div>
  );
}
