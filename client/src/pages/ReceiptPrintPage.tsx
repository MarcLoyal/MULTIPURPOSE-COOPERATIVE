import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ReceiptData } from "../lib/types";
import { formatCurrency, formatDateTime } from "../lib/format";

const SOURCE_PATHS: Record<string, string> = {
  loan: "/loans/transactions",
  deposit: "/deposits/transactions",
  "share-capital": "/share-capital/transactions",
};

export function ReceiptPrintPage() {
  const { source, id } = useParams<{ source: string; id: string }>();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const basePath = source ? SOURCE_PATHS[source] : undefined;
    if (!basePath || !id) {
      setError("Unknown receipt type");
      return;
    }
    api
      .get<ReceiptData>(`${basePath}/${id}/receipt`)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load receipt"));
  }, [source, id]);

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

      <div className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:rounded-none print:p-0">
        <div className="text-center mb-6">
          <p className="font-semibold text-lg text-slate-900">Multipurpose Cooperative</p>
          <p className="text-sm text-slate-500">Official Receipt</p>
        </div>

        <div className="border-y border-dashed border-slate-300 py-4 mb-4 text-center">
          <p className="text-xs text-slate-500">OR No.</p>
          <p className="text-2xl font-mono font-semibold text-slate-900">{receipt.officialReceiptNumber}</p>
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
      </div>
    </div>
  );
}
