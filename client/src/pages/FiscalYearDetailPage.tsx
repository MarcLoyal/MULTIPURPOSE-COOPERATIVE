import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  DividendDistributeResult,
  DividendDistributionSetting,
  FiscalYear,
  FiscalYearCloseResult,
  IncomeStatement,
} from "../lib/types";
import { formatCurrency, formatDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const CAN_CLOSE = ["manager", "accountant", "admin"];

export function FiscalYearDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [fiscalYear, setFiscalYear] = useState<FiscalYear | null>(null);
  const [statement, setStatement] = useState<IncomeStatement | null>(null);
  const [form, setForm] = useState({
    reserveFundPercent: "10",
    cetfPercent: "10",
    communityDevFundPercent: "3",
    optionalFundPercent: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalYearCloseResult | null>(null);
  const [divSetting, setDivSetting] = useState<DividendDistributionSetting | null>(null);
  const [divResult, setDivResult] = useState<DividendDistributeResult | null>(null);
  const [distributing, setDistributing] = useState(false);

  function load() {
    if (!id) return;
    api.get<FiscalYear>(`/accounting/fiscal-years/${id}`).then((fy) => {
      setFiscalYear(fy);
      const params = new URLSearchParams();
      if (fy.periodStart) params.set("from", fy.periodStart.slice(0, 10));
      params.set("to", fy.yearEndDate.slice(0, 10));
      api.get<IncomeStatement>(`/accounting/income-statement?${params.toString()}`).then(setStatement);
    });
    api.get<DividendDistributionSetting>("/settings/dividend-rates").then(setDivSetting);
  }

  useEffect(load, [id]);

  async function handleDistribute() {
    if (!id) return;
    setError(null);
    setDistributing(true);
    try {
      const res = await api.post<DividendDistributeResult>(`/accounting/fiscal-years/${id}/distribute`);
      setDivResult(res);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to distribute");
    } finally {
      setDistributing(false);
    }
  }

  async function handleClose(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      const res = await api.post<FiscalYearCloseResult>(`/accounting/fiscal-years/${id}/close`, {
        reserveFundPercent: Number(form.reserveFundPercent),
        cetfPercent: Number(form.cetfPercent),
        communityDevFundPercent: Number(form.communityDevFundPercent),
        optionalFundPercent: Number(form.optionalFundPercent),
      });
      setResult(res);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close fiscal year");
    }
  }

  if (!fiscalYear) return <p className="text-slate-500">Loading…</p>;

  const canClose = user && CAN_CLOSE.includes(user.role) && fiscalYear.status === "open";
  // For an OPEN fiscal year, the live income statement is the real
  // figure. For a CLOSED one, a live query for that same period always
  // nets to zero (the closing entries zeroed it out) — so use the
  // figure snapshotted on the allocation at close time instead, which
  // is exactly what the "Net Surplus for Period" box should show
  // either way: the actual period surplus, not "what's left now."
  const netSurplus =
    fiscalYear.status === "closed"
      ? Number(fiscalYear.statutoryFundAllocation?.netSurplus ?? 0)
      : statement?.netSurplus ?? 0;
  const pct = (key: keyof typeof form) => Number(form[key]) || 0;
  const previewReserve = (netSurplus * pct("reserveFundPercent")) / 100;
  const previewCetf = (netSurplus * pct("cetfPercent")) / 100;
  const previewCommunityDev = (netSurplus * pct("communityDevFundPercent")) / 100;
  const previewOptional = (netSurplus * pct("optionalFundPercent")) / 100;
  const previewTotal = previewReserve + previewCetf + previewCommunityDev + previewOptional;
  const previewExceedsSurplus = previewTotal > netSurplus;

  const canDistribute =
    user &&
    CAN_CLOSE.includes(user.role) &&
    fiscalYear.status === "closed" &&
    !!fiscalYear.statutoryFundAllocation &&
    !fiscalYear.dividendDistribution;
  const alloc = fiscalYear.statutoryFundAllocation;
  const unallocatedRemainder = alloc
    ? Number(alloc.netSurplus) -
      (Number(alloc.reserveFundPercent) +
        Number(alloc.cetfPercent) +
        Number(alloc.communityDevFundPercent) +
        Number(alloc.optionalFundPercent)) *
        (Number(alloc.netSurplus) / 100)
    : 0;
  const divPreviewShareCapital = divSetting
    ? (unallocatedRemainder * Number(divSetting.shareCapitalInterestPercent)) / 100
    : 0;
  const divPreviewPatronage = divSetting
    ? (unallocatedRemainder * Number(divSetting.patronageRefundPercent)) / 100
    : 0;

  return (
    <div>
      <Link to="/fiscal-years" className="text-sm text-slate-500 hover:underline">
        ← Back to Fiscal Years
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Fiscal Year ending {formatDate(fiscalYear.yearEndDate)}</h1>
        <span className={fiscalYear.status === "open" ? "text-emerald-700 text-sm font-medium" : "text-slate-400 text-sm font-medium"}>
          {fiscalYear.status === "open" ? "Open" : "Closed"}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Period: {fiscalYear.periodStart ? formatDate(fiscalYear.periodStart) : "beginning of records"} —{" "}
        {formatDate(fiscalYear.yearEndDate)}
      </p>

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <p className="text-slate-500 text-sm">Net Surplus for Period</p>
        <p className={`text-2xl font-semibold ${netSurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {fiscalYear.status === "closed" || statement ? formatCurrency(Math.abs(netSurplus)) : "…"}
          {netSurplus < 0 && " (deficit)"}
        </p>
      </div>

      {fiscalYear.status === "closed" && fiscalYear.statutoryFundAllocation && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <p className="text-slate-700 font-medium mb-2">Allocated percentages</p>
          <dl className="grid grid-cols-2 gap-y-1 text-sm max-w-sm">
            <dt className="text-slate-500">Reserve Fund</dt>
            <dd className="text-right">{Number(fiscalYear.statutoryFundAllocation.reserveFundPercent)}%</dd>
            <dt className="text-slate-500">CETF</dt>
            <dd className="text-right">{Number(fiscalYear.statutoryFundAllocation.cetfPercent)}%</dd>
            <dt className="text-slate-500">Community Development Fund</dt>
            <dd className="text-right">{Number(fiscalYear.statutoryFundAllocation.communityDevFundPercent)}%</dd>
            <dt className="text-slate-500">Optional Fund</dt>
            <dd className="text-right">{Number(fiscalYear.statutoryFundAllocation.optionalFundPercent)}%</dd>
          </dl>
          <p className="text-xs text-slate-400 mt-3">
            Exact posted amounts are in the General Ledger (source: Fiscal Year Close).
          </p>
        </div>
      )}

      {fiscalYear.status === "closed" && fiscalYear.dividendDistribution && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <p className="text-slate-700 font-medium mb-2">Dividend / patronage refund distributed</p>
          <dl className="grid grid-cols-2 gap-y-1 text-sm max-w-sm">
            <dt className="text-slate-500">Interest on Share Capital ({Number(fiscalYear.dividendDistribution.shareCapitalInterestPercent)}%)</dt>
            <dd className="text-right">{formatCurrency(fiscalYear.dividendDistribution.shareCapitalInterestAmount)}</dd>
            <dt className="text-slate-500">Patronage Refund ({Number(fiscalYear.dividendDistribution.patronageRefundPercent)}%)</dt>
            <dd className="text-right">{formatCurrency(fiscalYear.dividendDistribution.patronageRefundAmount)}</dd>
            <dt className="text-slate-500">Members credited</dt>
            <dd className="text-right">{fiscalYear.dividendDistribution.memberCount}</dd>
          </dl>
          <p className="text-xs text-slate-400 mt-3">
            Credited to each member's Share Capital Account — see Share Capital for individual "dividend" entries.
          </p>
        </div>
      )}

      {divResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 mb-6 text-sm">
          {divResult.distributed ? (
            <>
              <p className="font-medium mb-1">Distribution posted.</p>
              <p>Interest on Share Capital: {formatCurrency(divResult.shareCapitalInterestAmount ?? 0)}</p>
              <p>Patronage Refund: {formatCurrency(divResult.patronageRefundAmount ?? 0)}</p>
              <p>Members credited: {divResult.memberCount ?? 0}</p>
              <p>Still undivided in 30600: {formatCurrency(divResult.unallocatedRemainder)}</p>
            </>
          ) : (
            <p>{divResult.message}</p>
          )}
        </div>
      )}

      {canDistribute && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <p className="text-slate-700 font-medium">Distribute to members</p>
          <p className="text-sm text-slate-500">
            Unallocated remainder: <span className="font-medium text-slate-900">{formatCurrency(unallocatedRemainder)}</span>.
            Using current Settings → Dividend Rates ({divSetting ? Number(divSetting.shareCapitalInterestPercent) : "…"}% share
            capital interest, {divSetting ? Number(divSetting.patronageRefundPercent) : "…"}% patronage refund).
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm max-w-md">
            <p className="font-medium text-slate-700 mb-2">Preview</p>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-slate-500">Interest on Share Capital</dt>
              <dd className="text-right">{formatCurrency(divPreviewShareCapital)}</dd>
              <dt className="text-slate-500">Patronage Refund</dt>
              <dd className="text-right">{formatCurrency(divPreviewPatronage)}</dd>
            </dl>
            <p className="text-xs text-slate-400 mt-2">
              Interest on Share Capital splits by each member's current share capital balance; Patronage Refund
              splits by each member's loan interest paid during this fiscal year's period.
            </p>
          </div>
          <button
            onClick={handleDistribute}
            disabled={distributing}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {distributing ? "Distributing…" : "Distribute"}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 mb-6 text-sm">
          {result.allocated ? (
            <>
              <p className="font-medium mb-1">Fiscal year closed and allocated.</p>
              <p>Reserve Fund: {formatCurrency(result.reserveAmount ?? 0)}</p>
              <p>CETF: {formatCurrency(result.cetfAmount ?? 0)}</p>
              <p>Community Development Fund: {formatCurrency(result.communityDevAmount ?? 0)}</p>
              <p>Optional Fund: {formatCurrency(result.optionalAmount ?? 0)}</p>
              <p>Unallocated remainder (stays in Undivided Net Surplus): {formatCurrency(result.unallocatedRemainder ?? 0)}</p>
            </>
          ) : (
            <p>{result.message}</p>
          )}
        </div>
      )}

      {canClose && (
        <form onSubmit={handleClose} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <p className="text-slate-700 font-medium">Statutory fund allocation (RA 9520 Art. 86 bounds)</p>
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg p-3">
            The percentages below are pre-filled at Art. 86's own floor/ceiling values (reserve 10%, CETF 10%,
            community dev 3%, optional 0%) — a safe, compliant starting point, not your cooperative's actual
            bylaws figures. Confirm the real percentages with your board/bylaws before closing.
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <label className="text-sm text-slate-600">
              Reserve Fund % (min 10)
              <input
                required
                type="number"
                min="10"
                step="0.01"
                value={form.reserveFundPercent}
                onChange={(e) => setForm({ ...form, reserveFundPercent: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              CETF % (0–10)
              <input
                required
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={form.cetfPercent}
                onChange={(e) => setForm({ ...form, cetfPercent: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Community Development Fund % (min 3)
              <input
                required
                type="number"
                min="3"
                step="0.01"
                value={form.communityDevFundPercent}
                onChange={(e) => setForm({ ...form, communityDevFundPercent: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Optional Fund % (0–7)
              <input
                required
                type="number"
                min="0"
                max="7"
                step="0.01"
                value={form.optionalFundPercent}
                onChange={(e) => setForm({ ...form, optionalFundPercent: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm max-w-md">
            <p className="font-medium text-slate-700 mb-2">Preview</p>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-slate-500">Reserve Fund</dt>
              <dd className="text-right">{formatCurrency(previewReserve)}</dd>
              <dt className="text-slate-500">CETF (split 50/50 internal/union)</dt>
              <dd className="text-right">{formatCurrency(previewCetf)}</dd>
              <dt className="text-slate-500">Community Development Fund</dt>
              <dd className="text-right">{formatCurrency(previewCommunityDev)}</dd>
              <dt className="text-slate-500">Optional Fund</dt>
              <dd className="text-right">{formatCurrency(previewOptional)}</dd>
              <dt className="text-slate-700 font-medium border-t border-slate-200 pt-1 mt-1">Total Allocated</dt>
              <dd className={`text-right font-medium border-t border-slate-200 pt-1 mt-1 ${previewExceedsSurplus ? "text-rose-600" : ""}`}>
                {formatCurrency(previewTotal)}
              </dd>
            </dl>
            {previewExceedsSurplus && (
              <p className="text-rose-600 mt-2">This exceeds the period's net surplus — closing will be rejected.</p>
            )}
          </div>

          {netSurplus <= 0 && (
            <p className="text-sm text-amber-700">
              Net surplus for this period is {netSurplus === 0 ? "zero" : "negative"} — closing will mark the fiscal
              year closed with nothing allocated, regardless of the percentages above.
            </p>
          )}

          <button
            type="submit"
            disabled={previewExceedsSurplus && netSurplus > 0}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            Close Fiscal Year
          </button>
        </form>
      )}
    </div>
  );
}
