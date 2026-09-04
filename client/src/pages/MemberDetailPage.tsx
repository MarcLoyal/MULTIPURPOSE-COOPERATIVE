import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Member, MemberStatus } from "../lib/types";
import { Badge } from "../components/Badge";
import { ActivityLog } from "../components/ActivityLog";
import { formatDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const TABS = ["Details", "Loans", "Activity Log"] as const;
const STATUS_OPTIONS: MemberStatus[] = ["active", "inactive", "resigned", "deceased", "terminated"];

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Details");
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api.get<Member>(`/members/${id}`).then(setMember);
  }

  useEffect(load, [id]);

  async function changeStatus(status: MemberStatus) {
    if (!id) return;
    setError(null);
    try {
      await api.post(`/members/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  if (!member) return <p className="text-slate-500">Loading…</p>;

  const canChangeStatus = user && ["admin", "manager"].includes(user.role);

  return (
    <div>
      <Link to="/members" className="text-sm text-slate-500 hover:underline">
        ← Back to Members
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{member.fullName}</h1>
          <p className="text-sm text-slate-500">{member.memberNumber}</p>
        </div>
        <Badge value={member.status} />
      </div>

      <div className="border-b border-slate-200 mb-4">
        <nav className="flex gap-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-1 py-2 text-sm border-b-2 ${
                tab === t ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === "Details" && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd>{member.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd>{member.email ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Address</dt>
              <dd>{member.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Date Joined</dt>
              <dd>{formatDate(member.dateJoined)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Share Capital Balance</dt>
              <dd>{member.shareCapitalAccount ? Number(member.shareCapitalAccount.balance).toFixed(2) : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Beneficiary</dt>
              <dd>
                {member.beneficiaryName ?? "—"}
                {member.beneficiaryRelationship ? ` (${member.beneficiaryRelationship})` : ""}
              </dd>
            </div>
          </dl>

          {canChangeStatus && (
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-1">Change status</label>
              <div className="flex items-center gap-2">
                <select
                  value={member.status}
                  onChange={(e) => changeStatus(e.target.value as MemberStatus)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
            </div>
          )}
        </div>
      )}

      {tab === "Loans" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Principal</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(member.loanAccounts ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={3}>
                    No loans yet.
                  </td>
                </tr>
              ) : (
                member.loanAccounts!.map((loan) => (
                  <tr key={loan.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link to={`/loans/${loan.id}`} className="text-slate-900 font-medium hover:underline">
                        {loan.loanProduct}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{Number(loan.principalAmount).toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <Badge value={loan.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Activity Log" && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <ActivityLog entityType="Member" entityId={member.id} />
        </div>
      )}
    </div>
  );
}
