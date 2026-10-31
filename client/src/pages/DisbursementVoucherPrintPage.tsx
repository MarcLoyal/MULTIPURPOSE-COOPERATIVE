import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DisbursementVoucherPrintData } from "../lib/types";
import { formatCurrency, formatDateTime } from "../lib/format";

export function DisbursementVoucherPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [voucher, setVoucher] = useState<DisbursementVoucherPrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<DisbursementVoucherPrintData>(`/disbursement-vouchers/${id}`)
      .then(setVoucher)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load disbursement voucher"));
    // Intentionally re-fetches (and so re-increments the server's print
    // count) only when the id changes — see ReceiptPrintPage and
    // disbursementVouchers.routes.ts's GET /:id for why each fetch
    // counts as a view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <p className="text-rose-600 mb-3">{error}</p>
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!voucher) return <p className="text-slate-500 mt-12 text-center">Loading…</p>;

  const isVoid = voucher.status === "void";

  return (
    <div className="max-w-2xl mx-auto py-10 print:py-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
        >
          Print
        </button>
      </div>

      <div className="relative bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:rounded-none print:p-0">
        {isVoid && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-6xl font-black text-rose-500/30 rotate-[-20deg] border-4 border-rose-500/30 px-6 py-2">
              VOID
            </span>
          </div>
        )}

        <div className="text-center mb-6">
          <p className="font-semibold text-lg text-slate-900">Multipurpose Cooperative</p>
          <p className="text-sm text-slate-500">Disbursement Voucher</p>
          {voucher.isReprint && !isVoid && (
            <span className="inline-block mt-2 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
              REPRINT
            </span>
          )}
        </div>

        <div className="border-y border-dashed border-slate-300 py-4 mb-4 text-center">
          <p className="text-xs text-slate-500">Voucher No.</p>
          <p className="text-2xl font-mono font-semibold text-slate-900">
            {String(voucher.sequenceNumber).padStart(6, "0")}
          </p>
        </div>

        <dl className="text-sm space-y-3">
          <div className="flex justify-between">
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium">{formatDateTime(voucher.date)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Payee</dt>
            <dd className="font-medium text-right">
              {voucher.payeeName}
              <br />
              <span className="text-xs text-slate-400">{voucher.memberNumber}</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Purpose</dt>
            <dd className="font-medium text-right">{voucher.purpose}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-3">
            <dt className="text-slate-500">Amount</dt>
            <dd className="text-lg font-semibold">{formatCurrency(voucher.amount)}</dd>
          </div>
          <div className="pt-1">
            <dt className="text-slate-500 text-xs">Amount in words</dt>
            <dd className="font-medium italic">{voucher.amountInWords}</dd>
          </div>
        </dl>

        <div className="mt-5 pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 mb-2">Account entries</p>
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1">Account</th>
                <th className="py-1 text-right">Debit</th>
                <th className="py-1 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {voucher.accountEntries.map((e, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">
                    {e.accountCode} — {e.accountLabel}
                  </td>
                  <td className="py-1 text-right">{e.debit > 0 ? formatCurrency(e.debit) : ""}</td>
                  <td className="py-1 text-right">{e.credit > 0 ? formatCurrency(e.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6 text-center text-xs text-slate-500">
          <div>
            <div className="border-t border-slate-400 pt-1 mt-8">{voucher.preparedByName}</div>
            <p className="mt-1">Prepared by</p>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1 mt-8">&nbsp;</div>
            <p className="mt-1">Approved by</p>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1 mt-8">{voucher.payeeName}</div>
            <p className="mt-1">Received by (member signature)</p>
          </div>
        </div>

        {isVoid && (
          <div className="mt-4 pt-4 border-t border-rose-200 text-sm text-rose-700">
            <p className="font-medium">Voided</p>
            <p>{voucher.voidReason}</p>
          </div>
        )}
      </div>
    </div>
  );
}
