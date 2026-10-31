import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DisbursementVoucher } from "../lib/types";
import { Badge } from "./Badge";

type SourceField = "loanTransactionId" | "depositTransactionId" | "shareCapitalTransactionId";

// Every role that can record one of the three disbursement types —
// matches disbursementVouchers.routes.ts's VOUCHER_ROLES server-side.
const CAN_MANAGE = ["cashier", "manager", "admin"];

/**
 * Issue / print / void controls for one transaction's disbursement
 * voucher, shared across the loan, deposit, and share capital detail
 * pages — the outflow counterpart to ReceiptCell, against
 * POST/GET /api/disbursement-vouchers.
 */
export function VoucherCell({
  voucher,
  transactionId,
  sourceField,
  userRole,
  onChange,
}: {
  voucher?: DisbursementVoucher | null;
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
      await api.post("/disbursement-vouchers", { [sourceField]: transactionId });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue voucher");
    } finally {
      setBusy(false);
    }
  }

  async function voidVoucher() {
    if (!voucher) return;
    const reason = window.prompt("Reason for voiding this disbursement voucher:");
    if (!reason) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/disbursement-vouchers/${voucher.id}/void`, { reason });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to void voucher");
    } finally {
      setBusy(false);
    }
  }

  if (!voucher) {
    if (!canManage) return <span className="text-slate-400">—</span>;
    return (
      <div>
        <button
          onClick={issue}
          disabled={busy}
          className="text-slate-900 text-xs font-medium hover:underline disabled:opacity-50"
        >
          {busy ? "Issuing…" : "Issue Voucher"}
        </button>
        {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link
          to={`/disbursement-vouchers/${voucher.id}`}
          target="_blank"
          className="text-slate-900 text-xs font-medium hover:underline"
        >
          DV #{String(voucher.sequenceNumber).padStart(6, "0")}
        </Link>
        {voucher.status === "void" ? (
          <Badge value="void" />
        ) : (
          canManage && (
            <button
              onClick={voidVoucher}
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
