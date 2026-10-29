import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Receipt } from "../lib/types";
import { Badge } from "./Badge";

type SourceField = "loanTransactionId" | "depositTransactionId" | "shareCapitalTransactionId";

// Every role that can record one of the three payment types — matches
// receipts.routes.ts's RECEIPT_ROLES server-side.
const CAN_MANAGE = ["cashier", "accountant", "manager", "admin"];

/**
 * Issue / print / void controls for one transaction's receipt, shared
 * across the loan, deposit, and share capital detail pages so the
 * three don't each reimplement the same flow against
 * POST/GET /api/receipts.
 */
export function ReceiptCell({
  receipt,
  transactionId,
  sourceField,
  userRole,
  onChange,
}: {
  receipt?: Receipt | null;
  transactionId: string;
  sourceField: SourceField;
  userRole?: string;
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = userRole && CAN_MANAGE.includes(userRole);

  async function issue() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/receipts", { [sourceField]: transactionId });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue receipt");
    } finally {
      setBusy(false);
    }
  }

  async function voidReceipt() {
    if (!receipt) return;
    const reason = window.prompt("Reason for voiding this receipt:");
    if (!reason) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/receipts/${receipt.id}/void`, { reason });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to void receipt");
    } finally {
      setBusy(false);
    }
  }

  if (!receipt) {
    if (!canManage) return <span className="text-slate-400">—</span>;
    return (
      <div>
        <button
          onClick={issue}
          disabled={busy}
          className="text-slate-900 text-xs font-medium hover:underline disabled:opacity-50"
        >
          {busy ? "Issuing…" : "Issue Receipt"}
        </button>
        {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link
          to={`/receipts/${receipt.id}`}
          target="_blank"
          className="text-slate-900 text-xs font-medium hover:underline"
        >
          #{String(receipt.sequenceNumber).padStart(6, "0")}
        </Link>
        {receipt.status === "void" ? (
          <Badge value="void" />
        ) : (
          canManage && (
            <button
              onClick={voidReceipt}
              disabled={busy}
              className="text-rose-600 text-xs hover:underline disabled:opacity-50"
            >
              Void
            </button>
          )
        )}
      </div>
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
