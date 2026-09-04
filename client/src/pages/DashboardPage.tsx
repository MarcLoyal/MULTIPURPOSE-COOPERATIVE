import { useEffect, useState } from "react";
import { api } from "../api/client";
import { DashboardSummary } from "../lib/types";
import { formatCurrency } from "../lib/format";

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Active Members" value={summary.activeMembers.toLocaleString()} />
          <StatCard label="Active Loans" value={summary.activeLoans.toLocaleString()} />
          <StatCard
            label="Past-Due Loans"
            value={summary.pastDueLoans.toLocaleString()}
            tone={summary.pastDueLoans > 0 ? "danger" : undefined}
          />
          <StatCard label="Total Share Capital" value={formatCurrency(summary.totalShareCapital)} />
          <StatCard label="Cash Position" value={formatCurrency(summary.cashPosition)} />
        </div>
      )}
    </div>
  );
}
