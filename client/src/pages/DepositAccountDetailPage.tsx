import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { DepositAccount } from "../lib/types";
import { ReceiptCell } from "../components/ReceiptCell";
import { VoucherCell } from "../components/VoucherCell";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const CAN_TRANSACT = ["cashier", "admin"];
const CAN_CREDIT_INTEREST = ["manager", "accountant", "admin"];

export function DepositAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [account, setAccount] = useState<DepositAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");

  function load() {
    if (!id) return;
    api.get<DepositAccount>(`/deposits/accounts/${id}`).then(setAccount);
  }

  useEffect(load, [id]);

  async function submitTxn(type: "deposit" | "withdrawal", amount: string, e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setNotice(null);
    try {
      await api.post(`/deposits/accounts/${id}/transactions`, { type, amount: Number(amount) });
      if (type === "deposit") {
        setDepositAmount("");
      } else {
        setWithdrawalAmount("");
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to record ${type}`);
    }
  }

  async function creditInterest() {
    if (!id) return;
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ credited: boolean; message?: string; note?: string }>(
        `/deposits/accounts/${id}/credit-interest`
      );
      setNotice(result.credited ? result.note ?? "Interest credited." : result.message ?? "Nothing to post.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to credit interest");
    }
  }

  async function closeAccount() {
    if (!id) return;
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ penaltyCharged: number; netPayout: number }>(`/deposits/accounts/${id}/close`);
      setNotice(
        result.penaltyCharged > 0
          ? `Account closed. Pre-termination penalty ${formatCurrency(result.penaltyCharged)} deducted — net payout ${formatCurrency(result.netPayout)}.`
          : `Account closed. Payout ${formatCurrency(result.netPayout)}.`
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close account");
    }
  }

  if (!account) return <p className="text-slate-500">Loading…</p>;

  const role = user?.role;
  const canTransact = role && CAN_TRANSACT.includes(role) && account.status === "active";
  const canCreditInterest = role && CAN_CREDIT_INTEREST.includes(role) && account.status === "active";

  return (
    <div>
      <Link to="/deposits" className="text-sm text-slate-500 hover:underline">
        ← Back to Deposits
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {account.depositProduct?.name} — {account.member?.fullName}
          </h1>
          <p className="text-sm text-slate-500">
            {account.depositProduct?.type === "time" ? "Time Deposit" : "Savings"} · Opened {formatDate(account.openedAt)}
            {account.depositProduct?.termMonths ? ` · ${account.depositProduct.termMonths} month term` : ""}
          </p>
        </div>
        <span className={account.status === "active" ? "text-emerald-700 text-sm font-medium" : "text-slate-400 text-sm font-medium"}>
          {account.status === "active" ? "Active" : "Closed"}
        </span>
      </div>

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 mb-3">{notice}</p>}

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <p className="text-slate-500 text-sm">Current Balance</p>
        <p className="text-2xl font-semibold">{formatCurrency(account.balance)}</p>
      </div>

      {(canTransact || canCreditInterest) && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-4">
          {canTransact && (
            <div className="flex flex-wrap gap-4">
              <form onSubmit={(e) => submitTxn("deposit", depositAmount, e)} className="flex gap-2 items-center">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Deposit amount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm w-40"
                />
                <button className="rounded-md bg-emerald-600 text-white text-sm px-4 py-2 hover:bg-emerald-700">
                  Deposit
                </button>
              </form>
              <form onSubmit={(e) => submitTxn("withdrawal", withdrawalAmount, e)} className="flex gap-2 items-center">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Withdrawal amount"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm w-40"
                />
                <button className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
                  Withdraw
                </button>
              </form>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {canCreditInterest && (
              <button
                onClick={creditInterest}
                className="rounded-md border border-slate-300 text-slate-700 text-sm px-4 py-2 hover:bg-slate-50"
              >
                Credit Interest
              </button>
            )}
            {canTransact && (
              <button
                onClick={closeAccount}
                className="rounded-md border border-rose-300 text-rose-700 text-sm px-4 py-2 hover:bg-rose-50"
              >
                Close Account
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Balance After</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Receipt</th>
              <th className="px-4 py-2">Voucher</th>
            </tr>
          </thead>
          <tbody>
            {!account.transactions || account.transactions.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={6}>
                  No transactions yet.
                </td>
              </tr>
            ) : (
              account.transactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{humanizeEnum(t.type)}</td>
                  <td className="px-4 py-2">{formatCurrency(t.amount)}</td>
                  <td className="px-4 py-2">{formatCurrency(t.balanceAfter)}</td>
                  <td className="px-4 py-2">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-2">
                    {t.type === "deposit" ? (
                      <ReceiptCell
                        receipt={t.receipt}
                        transactionId={t.id}
                        sourceField="depositTransactionId"
                        userRole={role}
                        onChange={load}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {t.type === "withdrawal" ? (
                      <VoucherCell
                        voucher={t.disbursementVoucher}
                        transactionId={t.id}
                        sourceField="depositTransactionId"
                        userRole={role}
                        onChange={load}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
