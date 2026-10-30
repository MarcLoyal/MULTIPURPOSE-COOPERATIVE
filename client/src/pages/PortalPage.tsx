import { useEffect, useState } from "react";
import { api } from "../api/client";
import { DividendEstimate, LoanLimit, Member, ShareCapitalTransaction } from "../lib/types";
import { Badge } from "../components/Badge";
import { formatCurrency, formatDate } from "../lib/format";

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold mt-1 text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-medium text-slate-900 mb-2 px-1">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500">{text}</div>;
}

export function PortalPage() {
  const [me, setMe] = useState<Member | null>(null);
  const [loanLimit, setLoanLimit] = useState<LoanLimit | null>(null);
  const [estimate, setEstimate] = useState<DividendEstimate | null>(null);
  const [dividends, setDividends] = useState<ShareCapitalTransaction[] | null>(null);

  useEffect(() => {
    api.get<Member>("/portal/me").then(setMe);
    api.get<LoanLimit>("/portal/loan-limit").then(setLoanLimit);
    api.get<DividendEstimate>("/portal/dividend-estimate").then(setEstimate);
    api.get<ShareCapitalTransaction[]>("/portal/dividend-history").then(setDividends);
  }, []);

  if (!me) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="px-1">
        <h1 className="text-xl font-semibold text-slate-900">{me.fullName}</h1>
        <p className="text-sm text-slate-500">
          {me.memberNumber} · <Badge value={me.status} />
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Share Capital Balance"
          value={me.shareCapitalAccount ? formatCurrency(me.shareCapitalAccount.balance) : formatCurrency(0)}
        />
        {loanLimit && (
          <SummaryCard
            label="Loanable Amount"
            value={formatCurrency(loanLimit.loanableAmount)}
            sub="Placeholder rule — not yet confirmed by board policy"
          />
        )}
        <SummaryCard
          label="Active Loans"
          value={String((me.loanAccounts ?? []).filter((l) => ["active", "past_due"].includes(l.status)).length)}
        />
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-medium text-slate-900 mb-1">Estimated Dividend — This Fiscal Year</h2>
        {!estimate ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !estimate.available ? (
          <p className="text-sm text-slate-500">{estimate.reason}</p>
        ) : (
          <div>
            <p className="text-2xl font-semibold text-slate-900">{formatCurrency(estimate.estimatedTotal)}</p>
            <p className="text-sm text-slate-500 mt-1">
              Interest on share capital: {formatCurrency(estimate.estimatedShareCapitalInterest)}
              <br />
              Patronage refund: {formatCurrency(estimate.estimatedPatronageRefund)}
            </p>
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-3 mt-3">
              <p className="font-medium mb-1">This is only an estimate, not a promise</p>
              <p>{estimate.assumptions}</p>
            </div>
          </div>
        )}
      </section>

      <Section title="Loans">
        {(me.loanAccounts ?? []).length === 0 ? (
          <EmptyCard text="No loans yet." />
        ) : (
          me.loanAccounts!.map((loan) => (
            <div key={loan.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{loan.loanProduct}</p>
                <p className="text-sm text-slate-500">{formatCurrency(loan.principalAmount)}</p>
              </div>
              <Badge value={loan.status} />
            </div>
          ))
        )}
      </Section>

      <Section title="Deposits">
        {(me.depositAccounts ?? []).length === 0 ? (
          <EmptyCard text="No deposit accounts yet." />
        ) : (
          me.depositAccounts!.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{d.depositProduct?.name ?? "—"}</p>
                <p className="text-sm text-slate-500">{formatCurrency(d.balance)}</p>
              </div>
              <Badge value={d.status} />
            </div>
          ))
        )}
      </Section>

      <Section title="Dividend History">
        {!dividends || dividends.length === 0 ? (
          <EmptyCard text={dividends === null ? "Loading…" : "No dividends distributed yet."} />
        ) : (
          dividends.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{formatDate(d.createdAt)}</p>
              <p className="font-medium text-slate-900">{formatCurrency(d.amount)}</p>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
