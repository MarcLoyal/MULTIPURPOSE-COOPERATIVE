import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReceiptPrintData } from "../lib/types";
import { formatCurrency, formatDateTime } from "../lib/format";

export function ReceiptPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<ReceiptPrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<ReceiptPrintData>(`/receipts/${id}`)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load receipt"));
    // Intentionally re-fetches (and so re-increments the server's print
    // count) only when the id changes, not on every render — see
    // receipts.routes.ts's GET /:id for why each fetch counts as a view.
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

  if (!receipt) return <p className="text-slate-500 mt-12 text-center">Loading…</p>;

  const isVoid = receipt.status === "void";

  return (
    <div className="max-w-md mx-auto py-10 print:py-0">
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
          <p className="text-sm text-slate-500">{receipt.documentLabel}</p>
          {receipt.isReprint && !isVoid && (
            <span className="inline-block mt-2 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
              REPRINT
            </span>
          )}
        </div>

        <div className="border-y border-dashed border-slate-300 py-4 mb-4 text-center">
          <p className="text-xs text-slate-500">{receipt.documentLabel} No.</p>
          <p className="text-2xl font-mono font-semibold text-slate-900">
            {String(receipt.sequenceNumber).padStart(6, "0")}
          </p>
        </div>

        <dl className="text-sm space-y-3">
          <div className="flex justify-between">
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium">{formatDateTime(receipt.date)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Received from</dt>
            <dd className="font-medium text-right">
              {receipt.memberName}
              <br />
              <span className="text-xs text-slate-400">{receipt.memberNumber}</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Particulars</dt>
            <dd className="font-medium text-right">{receipt.particulars}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-3">
            <dt className="text-slate-500">Amount</dt>
            <dd className="text-lg font-semibold">{formatCurrency(receipt.amount)}</dd>
          </div>
          <div className="flex justify-between pt-3">
            <dt className="text-slate-500">Received by</dt>
            <dd className="font-medium">{receipt.receivedByName}</dd>
          </div>
        </dl>

        {isVoid && (
          <div className="mt-4 pt-4 border-t border-rose-200 text-sm text-rose-700">
            <p className="font-medium">Voided</p>
            <p>{receipt.voidReason}</p>
          </div>
        )}
      </div>
    </div>
  );
}
