import { Fragment, useEffect, useState } from "react";
import { api } from "../api/client";
import { CdaDataPack, FiscalYear } from "../lib/types";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum } from "../lib/format";
import { downloadCsv } from "../lib/csv";

function AmountRow({
  label,
  amount,
  isContra,
  bold,
}: {
  label: string;
  amount: number;
  isContra?: boolean;
  bold?: boolean;
}) {
  return (
    <tr className={bold ? "border-t-2 border-slate-300 font-semibold" : "border-t border-slate-100"}>
      <td className={`px-3 py-1.5 ${isContra ? "pl-8 text-slate-500" : ""}`}>
        {isContra ? "Less: " : ""}
        {label}
      </td>
      <td className="px-3 py-1.5 text-right">{isContra ? `(${formatCurrency(amount)})` : formatCurrency(amount)}</td>
    </tr>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">{title}</div>
      <table className="w-full text-sm">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

function buildCsv(data: CdaDataPack) {
  downloadCsv(`cda-data-pack-${data.fiscalYear.yearEndDate.slice(0, 10)}.csv`, [
    {
      title: `CDA Report Data Pack — NOT the CAPR itself; unaudited${data.isPreliminary ? "; PRELIMINARY, fiscal year not yet closed" : ""} — fiscal year ending ${data.fiscalYear.yearEndDate.slice(0, 10)}`,
      headers: ["Generated", "Figures As Of"],
      rows: [[data.generatedAt, data.fiscalYear.reportAsOf]],
    },
    {
      title: "Statement of Financial Condition",
      headers: ["Account Code", "Account", "Element", "Amount"],
      rows: [
        ...data.balanceSheet.assetRows.map((r) => [r.accountCode, r.accountLabel, "Asset", r.isContra ? -r.amount : r.amount]),
        ["", "Total Assets", "", data.balanceSheet.totalAssets],
        ...data.balanceSheet.liabilityRows.map((r) => [r.accountCode, r.accountLabel, "Liability", r.isContra ? -r.amount : r.amount]),
        ["", "Total Liabilities", "", data.balanceSheet.totalLiabilities],
        ...data.balanceSheet.equityRows.map((r) => [r.accountCode, r.accountLabel, "Equity", r.isContra ? -r.amount : r.amount]),
        ["", "Current Period Net Surplus (Unclosed)", "Equity", data.balanceSheet.unclosedNetSurplus],
        ["", "Total Equity", "", data.balanceSheet.totalEquity],
      ],
    },
    {
      title: "Statement of Operations",
      headers: ["Account Code", "Account", "Element", "Amount"],
      rows: [
        ...data.incomeStatement.revenueRows.map((r) => [r.accountCode, r.accountLabel, "Revenue", r.amount]),
        ["", "Total Revenue", "", data.incomeStatement.totalRevenue],
        ...data.incomeStatement.expenseRows.map((r) => [r.accountCode, r.accountLabel, "Expense", r.amount]),
        ["", "Total Expense", "", data.incomeStatement.totalExpense],
        ["", "Net Surplus", "", data.incomeStatement.netSurplus],
      ],
    },
    {
      title: "Statement of Changes in Equity",
      headers: ["Account Code", "Account", "Beginning Balance", "Net Change", "Ending Balance"],
      rows: [
        ...data.equityStatement.rows.map((r) => [
          r.accountCode,
          r.accountLabel,
          r.isContra ? -r.beginningBalance : r.beginningBalance,
          r.isContra ? -r.netChange : r.netChange,
          r.isContra ? -r.endingBalance : r.endingBalance,
        ]),
        ["", "Total", data.equityStatement.totalBeginning, data.equityStatement.totalNetChange, data.equityStatement.totalEnding],
      ],
    },
    {
      title: `Trial Balance as of ${data.trialBalance.asOf.slice(0, 10)}`,
      headers: ["Account Code", "Account", "Total Debit", "Total Credit"],
      rows: [
        ...data.trialBalance.rows.map((r) => [r.accountCode, r.accountLabel, r.totalDebit, r.totalCredit]),
        ["", "Total", data.trialBalance.totals.totalDebit, data.trialBalance.totals.totalCredit],
      ],
    },
    {
      title: "Statutory Fund Allocation",
      headers: ["Net Surplus", "Reserve Fund %", "CETF %", "Community Dev Fund %", "Optional Fund %"],
      rows: data.statutoryFundAllocation
        ? [[
            data.statutoryFundAllocation.netSurplus,
            data.statutoryFundAllocation.reserveFundPercent,
            data.statutoryFundAllocation.cetfPercent,
            data.statutoryFundAllocation.communityDevFundPercent,
            data.statutoryFundAllocation.optionalFundPercent,
          ]]
        : [["None recorded for this fiscal year"]],
    },
    {
      title: "Dividend / Patronage Refund Distribution",
      headers: ["Share Capital Interest", "Patronage Refund", "Member Count"],
      rows: data.dividendDistribution
        ? [[
            data.dividendDistribution.shareCapitalInterestAmount,
            data.dividendDistribution.patronageRefundAmount,
            data.dividendDistribution.memberCount,
          ]]
        : [["None recorded for this fiscal year"]],
    },
    {
      title: "Membership Summary (new members during period are accurate for the period; counts by status/class are CURRENT, not as of year-end)",
      headers: ["Metric", "Value"],
      rows: [
        ["New Members During Period", data.membership.newMembersDuringPeriod],
        ["Total Members (Current)", data.membership.totalMembersCurrent],
        ...Object.entries(data.membership.currentCountsByStatus).map(([k, v]) => [`Status: ${k} (Current)`, v]),
        ...Object.entries(data.membership.currentCountsByClass).map(([k, v]) => [`Class: ${k} (Current)`, v]),
      ],
    },
    {
      title: "Share Capital",
      headers: ["Metric", "Value"],
      rows: [
        ["Total Paid-Up at Year-End", data.shareCapital.totalPaidUpAtYearEnd],
        ["Subscriptions During Period", data.shareCapital.subscriptionsDuringPeriod],
        ["Withdrawals During Period", data.shareCapital.withdrawalsDuringPeriod],
      ],
    },
    {
      title: "Share Capital — Per Member Balance at Year-End",
      headers: ["Member No.", "Member Name", "Balance"],
      rows: data.shareCapital.perMemberBalancesAtYearEnd.map((m) => [m.memberNumber, m.fullName, m.balance]),
    },
    {
      title: "Loan Portfolio (status breakdown is CURRENT, not as of year-end)",
      headers: ["Metric", "Value"],
      rows: [
        ["Released During Period", data.loans.releasedDuringPeriod],
        ["Collected During Period", data.loans.collectedDuringPeriod],
        ["Outstanding Portfolio at Year-End", data.loans.outstandingPortfolioAtYearEnd],
        ["Allowance for Probable Losses at Year-End", data.loans.allowanceForProbableLossesAtYearEnd],
        ...data.loans.currentStatusBreakdown.map((s) => [`Status: ${s.status} (Current, count)`, s.count]),
      ],
    },
    {
      title: "Deposits",
      headers: ["Metric", "Value"],
      rows: [
        ["Deposits During Period", data.deposits.depositsDuringPeriod],
        ["Withdrawals During Period", data.deposits.withdrawalsDuringPeriod],
        ...data.deposits.endingBalancesByProduct.map((d) => [`${d.label} at Year-End`, d.amount]),
      ],
    },
  ]);
}

export function CdaDataPackPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<CdaDataPack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<FiscalYear[]>("/accounting/fiscal-years").then(setFiscalYears);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setData(null);
      return;
    }
    setError(null);
    setData(null);
    api
      .get<CdaDataPack>(`/accounting/cda-data-pack/${selectedId}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data pack"));
  }, [selectedId]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">CDA Report Data Pack</h1>
      <p className="text-sm text-slate-500 mb-4">
        The figures your CDA-accredited external auditor and CAIS filing need to work from, for a closed fiscal
        year — or a preview of them for a fiscal year that's still open.
      </p>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4 mb-6 print:hidden">
        <p className="font-medium mb-1">This is not the CAPR</p>
        <p>
          The CAPR is filed online through CDA's CAIS system and must carry financial statements certified by a
          CDA-accredited external auditor. This page assembles supporting figures only — unaudited, and not a
          substitute for the CAPR, the audited FS, the social/performance audit reports, the officers/training
          list, or any other CAIS attachment.
        </p>
      </div>

      {data?.isPreliminary && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 text-sm rounded-xl p-4 mb-6">
          <p className="font-medium mb-1">PRELIMINARY — fiscal year not yet closed</p>
          <p>
            This fiscal year is still open, so these figures are as of today ({formatDate(data.fiscalYear.reportAsOf)}
            ), not a final year-end cut. They'll change as more activity is posted, and the Statement of Changes in
            Equity's "Current Period Net Surplus (Unclosed)" row reflects surplus the fiscal-year close hasn't swept
            into equity yet. Use this to review the numbers before closing — not as the closed-year data pack.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6 print:hidden">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a fiscal year…</option>
          {fiscalYears.map((y) => (
            <option key={y.id} value={y.id}>
              Year ending {formatDate(y.yearEndDate)} {y.status === "open" ? "(open — preliminary)" : ""}
            </option>
          ))}
        </select>
        {data && (
          <>
            <button
              onClick={() => window.print()}
              className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
            >
              Print
            </button>
            <button
              onClick={() => buildCsv(data)}
              className="rounded-md border border-slate-300 text-slate-700 text-sm px-4 py-2 hover:bg-slate-50"
            >
              Download CSV
            </button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}

      {selectedId && !data && !error && <p className="text-slate-500">Loading…</p>}

      {data && (
        <div className="space-y-6 max-w-3xl">
          <div className="text-center border-b border-slate-200 pb-4">
            <p className="font-semibold text-lg text-slate-900">Multipurpose Cooperative</p>
            <p className="text-sm text-slate-500">
              CDA Report Data Pack — Unaudited{data.isPreliminary ? " — PRELIMINARY (fiscal year not yet closed)" : ""}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Fiscal year ending {formatDate(data.fiscalYear.yearEndDate)}
              {data.isPreliminary ? ` · Figures as of ${formatDate(data.fiscalYear.reportAsOf)}` : ""} · Generated{" "}
              {formatDateTime(data.generatedAt)}
            </p>
          </div>

          <Panel title="Statement of Financial Condition">
            {data.balanceSheet.assetRows.map((r) => (
              <AmountRow key={r.accountCode} label={`${r.accountCode} — ${r.accountLabel}`} amount={r.amount} isContra={r.isContra} />
            ))}
            <AmountRow label="Total Assets" amount={data.balanceSheet.totalAssets} bold />
            {data.balanceSheet.liabilityRows.map((r) => (
              <AmountRow key={r.accountCode} label={`${r.accountCode} — ${r.accountLabel}`} amount={r.amount} isContra={r.isContra} />
            ))}
            <AmountRow label="Total Liabilities" amount={data.balanceSheet.totalLiabilities} bold />
            {data.balanceSheet.equityRows.map((r) => (
              <AmountRow key={r.accountCode} label={`${r.accountCode} — ${r.accountLabel}`} amount={r.amount} isContra={r.isContra} />
            ))}
            {data.balanceSheet.unclosedNetSurplus !== 0 && (
              <AmountRow label="Current Period Net Surplus (Unclosed)" amount={data.balanceSheet.unclosedNetSurplus} />
            )}
            <AmountRow label="Total Equity" amount={data.balanceSheet.totalEquity} bold />
          </Panel>

          <Panel title="Statement of Operations">
            {data.incomeStatement.revenueRows.map((r) => (
              <AmountRow key={r.accountCode} label={`${r.accountCode} — ${r.accountLabel}`} amount={r.amount} />
            ))}
            <AmountRow label="Total Revenue" amount={data.incomeStatement.totalRevenue} bold />
            {data.incomeStatement.expenseRows.map((r) => (
              <AmountRow key={r.accountCode} label={`${r.accountCode} — ${r.accountLabel}`} amount={r.amount} />
            ))}
            <AmountRow label="Total Expense" amount={data.incomeStatement.totalExpense} bold />
            <AmountRow label="Net Surplus" amount={data.incomeStatement.netSurplus} bold />
          </Panel>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">
              Statement of Changes in Equity
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-1.5">Account</th>
                  <th className="px-3 py-1.5 text-right">Beginning</th>
                  <th className="px-3 py-1.5 text-right">Net Change</th>
                  <th className="px-3 py-1.5 text-right">Ending</th>
                </tr>
              </thead>
              <tbody>
                {data.equityStatement.rows.map((r) => (
                  <tr key={r.accountCode || r.accountLabel} className="border-t border-slate-100">
                    <td className={`px-3 py-1.5 ${r.isContra ? "pl-6 text-slate-500" : ""}`}>
                      {r.isContra ? "Less: " : ""}
                      {r.accountCode ? `${r.accountCode} — ${r.accountLabel}` : r.accountLabel}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatCurrency(r.isContra ? -r.beginningBalance : r.beginningBalance)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatCurrency(r.isContra ? -r.netChange : r.netChange)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatCurrency(r.isContra ? -r.endingBalance : r.endingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-3 py-1.5">Total</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(data.equityStatement.totalBeginning)}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(data.equityStatement.totalNetChange)}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(data.equityStatement.totalEnding)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium">
              Trial Balance as of {formatDate(data.trialBalance.asOf)}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-1.5">Account</th>
                  <th className="px-3 py-1.5 text-right">Debit</th>
                  <th className="px-3 py-1.5 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.trialBalance.rows.map((r) => (
                  <tr key={r.accountCode} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">
                      {r.accountCode} — {r.accountLabel}
                    </td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(r.totalDebit)}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(r.totalCredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="px-3 py-1.5">Total ({data.trialBalance.balanced ? "Balanced" : "Out of balance"})</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(data.trialBalance.totals.totalDebit)}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(data.trialBalance.totals.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <Panel title="Statutory Fund Allocation">
            {data.statutoryFundAllocation ? (
              <>
                <AmountRow label="Net Surplus Allocated From" amount={Number(data.statutoryFundAllocation.netSurplus)} />
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-1.5" colSpan={2}>
                    Reserve {data.statutoryFundAllocation.reserveFundPercent}% · CETF{" "}
                    {data.statutoryFundAllocation.cetfPercent}% · Community Dev{" "}
                    {data.statutoryFundAllocation.communityDevFundPercent}% · Optional{" "}
                    {data.statutoryFundAllocation.optionalFundPercent}%
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td className="px-3 py-2 text-slate-500" colSpan={2}>
                  None recorded for this fiscal year.
                </td>
              </tr>
            )}
          </Panel>

          <Panel title="Dividend / Patronage Refund Distribution">
            {data.dividendDistribution ? (
              <>
                <AmountRow
                  label="Interest on Share Capital"
                  amount={Number(data.dividendDistribution.shareCapitalInterestAmount)}
                />
                <AmountRow label="Patronage Refund" amount={Number(data.dividendDistribution.patronageRefundAmount)} />
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-1.5" colSpan={2}>
                    {data.dividendDistribution.memberCount} member(s)
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td className="px-3 py-2 text-slate-500" colSpan={2}>
                  None recorded for this fiscal year.
                </td>
              </tr>
            )}
          </Panel>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-2">Membership Summary</h2>
            <p className="text-xs text-slate-400 mb-3">
              New members during the period is accurate for the fiscal year. Counts by status/class are current as
              of report generation — member status has no history in this system, so a true year-end snapshot
              isn't available.
            </p>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">New Members During Period</dt>
              <dd className="text-right font-medium">{data.membership.newMembersDuringPeriod}</dd>
              <dt className="text-slate-500">Total Members (Current)</dt>
              <dd className="text-right font-medium">{data.membership.totalMembersCurrent}</dd>
              {Object.entries(data.membership.currentCountsByStatus).map(([status, count]) => (
                <Fragment key={`s-${status}`}>
                  <dt className="text-slate-500">{humanizeEnum(status)} (Current)</dt>
                  <dd className="text-right font-medium">{count}</dd>
                </Fragment>
              ))}
              {Object.entries(data.membership.currentCountsByClass).map(([cls, count]) => (
                <Fragment key={`c-${cls}`}>
                  <dt className="text-slate-500">{humanizeEnum(cls)} (Current)</dt>
                  <dd className="text-right font-medium">{count}</dd>
                </Fragment>
              ))}
            </dl>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-2">Share Capital</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm mb-3">
              <dt className="text-slate-500">Total Paid-Up at Year-End</dt>
              <dd className="text-right font-medium">{formatCurrency(data.shareCapital.totalPaidUpAtYearEnd)}</dd>
              <dt className="text-slate-500">Subscriptions During Period</dt>
              <dd className="text-right font-medium">{formatCurrency(data.shareCapital.subscriptionsDuringPeriod)}</dd>
              <dt className="text-slate-500">Withdrawals During Period</dt>
              <dd className="text-right font-medium">{formatCurrency(data.shareCapital.withdrawalsDuringPeriod)}</dd>
            </dl>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-1.5">Member No.</th>
                  <th className="px-3 py-1.5">Name</th>
                  <th className="px-3 py-1.5 text-right">Balance at Year-End</th>
                </tr>
              </thead>
              <tbody>
                {data.shareCapital.perMemberBalancesAtYearEnd.map((m) => (
                  <tr key={m.memberId} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{m.memberNumber}</td>
                    <td className="px-3 py-1.5">{m.fullName}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-2">Loan Portfolio</h2>
            <p className="text-xs text-slate-400 mb-3">
              Released, collected, outstanding portfolio, and allowance are accurate as of the fiscal year's dates.
              The status breakdown is current as of report generation — loan status has no history in this system.
            </p>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Released During Period</dt>
              <dd className="text-right font-medium">{formatCurrency(data.loans.releasedDuringPeriod)}</dd>
              <dt className="text-slate-500">Collected During Period</dt>
              <dd className="text-right font-medium">{formatCurrency(data.loans.collectedDuringPeriod)}</dd>
              <dt className="text-slate-500">Outstanding Portfolio at Year-End</dt>
              <dd className="text-right font-medium">{formatCurrency(data.loans.outstandingPortfolioAtYearEnd)}</dd>
              <dt className="text-slate-500">Allowance for Probable Losses at Year-End</dt>
              <dd className="text-right font-medium">
                {formatCurrency(data.loans.allowanceForProbableLossesAtYearEnd)}
              </dd>
              {data.loans.currentStatusBreakdown.map((s) => (
                <Fragment key={`l-${s.status}`}>
                  <dt className="text-slate-500">{humanizeEnum(s.status)} (Current, count)</dt>
                  <dd className="text-right font-medium">{s.count}</dd>
                </Fragment>
              ))}
            </dl>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-2">Deposits</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Deposits During Period</dt>
              <dd className="text-right font-medium">{formatCurrency(data.deposits.depositsDuringPeriod)}</dd>
              <dt className="text-slate-500">Withdrawals During Period</dt>
              <dd className="text-right font-medium">{formatCurrency(data.deposits.withdrawalsDuringPeriod)}</dd>
              {data.deposits.endingBalancesByProduct.map((d) => (
                <Fragment key={d.accountCode}>
                  <dt className="text-slate-500">{d.label} at Year-End</dt>
                  <dd className="text-right font-medium">{formatCurrency(d.amount)}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
