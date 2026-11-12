import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  CivilStatus,
  Member,
  MemberStatement,
  MemberStatus,
  ShareCapitalTransaction,
  TimelineEntry,
} from "../lib/types";
import { Badge } from "../components/Badge";
import { SummaryCard } from "../components/SummaryCard";
import { ActivityLog } from "../components/ActivityLog";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useModuleSettings } from "../context/ModuleSettingsContext";
import { MEMBER_STATUS_LABELS, CIVIL_STATUS_LABELS, CIVIL_STATUS_OPTIONS } from "../lib/philippineLabels";
import { resizeImageToDataUrl } from "../lib/image";

// Visible tabs — bilingual, Tagalog first, per IWMPC's phase-1 brief.
// Portal Login and Activity Log are appended separately, admin/manager
// only (see canSeeAdminTabs below).
const BASE_TABS = ["Impormasyon (Personal Info)", "Lahat ng Transaksyon (All Transactions)", "Pautang (Loans)", "Share Capital"] as const;
const ADMIN_TABS = ["Portal Login", "Activity Log"] as const;

// Hidden placeholders for future phases — intentionally never added to
// a TABS array or rendered. Do NOT build these yet:
//   "Tubig (Water Billing)"
//   "Bigas at LPG"

const STATUS_OPTIONS: MemberStatus[] = ["active", "inactive", "resigned", "deceased", "terminated"];

function timelineCategory(type: string): "loan" | "deposit" | "share_capital" {
  if (type.startsWith("loan_")) return "loan";
  if (type.startsWith("deposit_")) return "deposit";
  return "share_capital";
}

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isModuleEnabled } = useModuleSettings();
  const [member, setMember] = useState<Member | null>(null);
  const [statement, setStatement] = useState<MemberStatement | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [shareCapitalTxns, setShareCapitalTxns] = useState<ShareCapitalTransaction[] | null>(null);

  const canSeeAdminTabs = user && ["admin", "manager"].includes(user.role);
  const TABS = canSeeAdminTabs ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;
  const [tab, setTab] = useState<string>(BASE_TABS[0]);

  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api.get<Member>(`/members/${id}`).then(setMember);
    api.get<MemberStatement>(`/members/${id}/statement`).then(setStatement);
    api.get<TimelineEntry[]>(`/members/${id}/transactions`).then(setTimeline);
    api.get<ShareCapitalTransaction[]>(`/share-capital/transactions?memberId=${id}`).then(setShareCapitalTxns);
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

  if (!member || !statement) return <p className="text-lg text-slate-500">Naglo-load… (Loading…)</p>;

  const canChangeStatus = user && ["admin", "manager"].includes(user.role);
  const canEditInfo = user && ["admin", "manager", "accountant"].includes(user.role);

  const activeLoans = statement.loans.filter((l) => ["active", "past_due"].includes(l.status));
  const totalLoanBalance = activeLoans.reduce((sum, l) => sum + (l.aging?.outstandingBalance ?? 0), 0);
  const maxDaysPastDue = Math.max(0, ...activeLoans.map((l) => l.aging?.daysPastDue ?? 0));
  const nextDueDates = activeLoans.map((l) => l.aging?.nextDueDate).filter((d): d is string => Boolean(d));
  const earliestNextDue = nextDueDates.length
    ? nextDueDates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
    : null;
  const daysUntilDue = earliestNextDue ? Math.ceil((new Date(earliestNextDue).getTime() - Date.now()) / 86400000) : null;
  const loanCardStatus: "ok" | "warning" | "danger" =
    maxDaysPastDue > 0 ? "danger" : daysUntilDue !== null && daysUntilDue <= 5 ? "warning" : "ok";

  const totalDeposits = (statement.deposits ?? []).reduce((sum, d) => sum + d.balance, 0);

  return (
    <div className="space-y-6">
      <Link to="/members" className="text-base text-slate-500 hover:underline">
        ← Bumalik sa Kasapi (Back to Members)
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{member.fullName}</h1>
          <p className="text-lg text-slate-500 mt-1">
            {member.memberNumber} · <Badge value={member.status} label={MEMBER_STATUS_LABELS[member.status]} />
          </p>
          <p className="text-base text-slate-500 mt-1">
            Sumali noong (Joined): {formatDate(member.dateJoined)}
          </p>
        </div>
        <div className="flex flex-col gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="rounded-md bg-slate-900 text-white text-base px-4 py-2 hover:bg-slate-800"
          >
            I-print ang Profile
          </button>
          <Link
            to={`/members/${member.id}/statement`}
            target="_blank"
            className="rounded-md border border-slate-300 text-base px-4 py-2 text-center hover:bg-slate-50"
          >
            Statement of Account
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4">
        <SummaryCard label="Share Capital (Paid)" value={formatCurrency(statement.shareCapital?.balance ?? 0)} />
        <SummaryCard
          label="Balanse sa Pautang (Loan Balance)"
          value={formatCurrency(totalLoanBalance)}
          sub={
            maxDaysPastDue > 0
              ? `${maxDaysPastDue} araw na overdue`
              : earliestNextDue
                ? `Susunod na bayaran: ${formatDate(earliestNextDue)}`
                : undefined
          }
          status={loanCardStatus}
        />
        {isModuleEnabled("deposits") && <SummaryCard label="Deposits" value={formatCurrency(totalDeposits)} />}
        <SummaryCard
          label="Huling Dividend (Last Dividend)"
          value={statement.lastDividend ? formatCurrency(statement.lastDividend.amount) : "—"}
          sub={statement.lastDividend ? formatDate(statement.lastDividend.date) : undefined}
        />
      </div>

      <div className="border-b border-slate-200 print:hidden">
        <nav className="flex gap-5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-1 py-2 text-base border-b-2 ${
                tab === t ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === "Impormasyon (Personal Info)" && (
        <PersonalInfoTab
          member={member}
          canEdit={!!canEditInfo}
          canChangeStatus={!!canChangeStatus}
          error={error}
          onChangeStatus={changeStatus}
          onSaved={load}
        />
      )}

      {tab === "Lahat ng Transaksyon (All Transactions)" && <TimelineTab timeline={timeline} />}

      {tab === "Pautang (Loans)" && <LoansTab loans={statement.loans} />}

      {tab === "Share Capital" && (
        <ShareCapitalTab
          memberId={member.id}
          balance={statement.shareCapital?.balance ?? 0}
          transactions={shareCapitalTxns}
          onChange={load}
        />
      )}

      {tab === "Portal Login" && canSeeAdminTabs && <PortalLoginTab member={member} onChange={load} />}

      {tab === "Activity Log" && canSeeAdminTabs && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <ActivityLog entityType="Member" entityId={member.id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personal Info
// ---------------------------------------------------------------------------

function PersonalInfoTab({
  member,
  canEdit,
  canChangeStatus,
  error,
  onChangeStatus,
  onSaved,
}: {
  member: Member;
  canEdit: boolean;
  canChangeStatus: boolean;
  error: string | null;
  onChangeStatus: (status: MemberStatus) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    phone: member.phone ?? "",
    email: member.email ?? "",
    address: member.address ?? "",
    birthDate: member.birthDate ? member.birthDate.slice(0, 10) : "",
    civilStatus: (member.civilStatus ?? "") as CivilStatus | "",
    idType: member.idType ?? "",
    idNumber: member.idNumber ?? "",
    photoUrl: member.photoUrl ?? "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingBeneficiaries, setEditingBeneficiaries] = useState(false);
  const [beneficiaryRows, setBeneficiaryRows] = useState(
    (member.beneficiaries ?? []).map((b) => ({ name: b.name, relationship: b.relationship }))
  );
  const [beneficiaryError, setBeneficiaryError] = useState<string | null>(null);
  const [savingBeneficiaries, setSavingBeneficiaries] = useState(false);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setForm((f) => ({ ...f, photoUrl: dataUrl }));
    } catch {
      setSaveError("Failed to process photo");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      await api.patch(`/members/${member.id}`, {
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        birthDate: form.birthDate || undefined,
        civilStatus: form.civilStatus || undefined,
        idType: form.idType || undefined,
        idNumber: form.idNumber || undefined,
        photoUrl: form.photoUrl || undefined,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveBeneficiaries(e: FormEvent) {
    e.preventDefault();
    setBeneficiaryError(null);
    setSavingBeneficiaries(true);
    try {
      await api.put(`/members/${member.id}/beneficiaries`, {
        beneficiaries: beneficiaryRows.filter((b) => b.name.trim() && b.relationship.trim()),
      });
      setEditingBeneficiaries(false);
      onSaved();
    } catch (err) {
      setBeneficiaryError(err instanceof ApiError ? err.message : "Failed to save beneficiaries");
    } finally {
      setSavingBeneficiaries(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl p-5 max-w-lg space-y-4">
        <h2 className="text-lg font-medium text-slate-900">Baguhin ang Impormasyon (Edit Personal Info)</h2>
        {saveError && <p className="text-base text-rose-600">{saveError}</p>}

        <div className="flex items-center gap-4">
          {form.photoUrl && (
            <img src={form.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
          )}
          <div>
            <label className="block text-base font-medium text-slate-700 mb-1">Larawan (Photo)</label>
            <input type="file" accept="image/*" onChange={handlePhoto} className="text-base" />
          </div>
        </div>

        <Field label="Telepono (Phone)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
        <Field label="Tirahan (Address)" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <Field
          label="Kaarawan (Birthday)"
          value={form.birthDate}
          onChange={(v) => setForm({ ...form, birthDate: v })}
          type="date"
        />
        <div>
          <label className="block text-base font-medium text-slate-700 mb-1">Katayuang Sibil (Civil Status)</label>
          <select
            value={form.civilStatus}
            onChange={(e) => setForm({ ...form, civilStatus: e.target.value as CivilStatus })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          >
            <option value="">—</option>
            {CIVIL_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CIVIL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <Field label="Uri ng ID (ID Type)" value={form.idType} onChange={(v) => setForm({ ...form, idType: v })} />
        <Field label="Numero ng ID (ID Number)" value={form.idNumber} onChange={(v) => setForm({ ...form, idNumber: v })} />

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 text-white text-base px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            I-save (Save)
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50"
          >
            Kanselahin (Cancel)
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {member.photoUrl && (
              <img src={member.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
            )}
            <dl className="grid grid-cols-2 gap-4 text-base">
              <div>
                <dt className="text-slate-500">Telepono (Phone)</dt>
                <dd>{member.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd>{member.email ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Tirahan (Address)</dt>
                <dd>{member.address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Kaarawan (Birthday)</dt>
                <dd>{member.birthDate ? formatDate(member.birthDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Katayuang Sibil (Civil Status)</dt>
                <dd>{member.civilStatus ? CIVIL_STATUS_LABELS[member.civilStatus] : "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">ID</dt>
                <dd>{member.idType ? `${member.idType} — ${member.idNumber ?? "—"}` : "—"}</dd>
              </div>
              {(member.beneficiaryName || member.beneficiaryRelationship) && (
                <div>
                  <dt className="text-slate-500">Dating Benepisyaryo (Prior Beneficiary)</dt>
                  <dd>
                    {member.beneficiaryName ?? "—"}
                    {member.beneficiaryRelationship ? ` (${member.beneficiaryRelationship})` : ""}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="print:hidden rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50 shrink-0"
            >
              Baguhin (Edit)
            </button>
          )}
        </div>

        {canChangeStatus && (
          <div className="pt-4 border-t border-slate-100 print:hidden">
            <label className="block text-base font-medium text-slate-700 mb-1">
              Baguhin ang Katayuan (Change Status)
            </label>
            <select
              value={member.status}
              onChange={(e) => onChangeStatus(e.target.value as MemberStatus)}
              className="rounded-md border border-slate-300 px-3 py-2 text-base"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {MEMBER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {error && <p className="text-base text-rose-600 mt-2">{error}</p>}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-slate-900">Mga Benepisyaryo (Beneficiaries)</h2>
          {canEdit && !editingBeneficiaries && (
            <button
              onClick={() => {
                setBeneficiaryRows((member.beneficiaries ?? []).map((b) => ({ name: b.name, relationship: b.relationship })));
                setEditingBeneficiaries(true);
              }}
              className="print:hidden rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50"
            >
              Baguhin (Edit)
            </button>
          )}
        </div>

        {editingBeneficiaries ? (
          <form onSubmit={saveBeneficiaries} className="space-y-3">
            {beneficiaryError && <p className="text-base text-rose-600">{beneficiaryError}</p>}
            {beneficiaryRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  placeholder="Pangalan (Name)"
                  value={row.name}
                  onChange={(e) => {
                    const next = [...beneficiaryRows];
                    next[i] = { ...next[i], name: e.target.value };
                    setBeneficiaryRows(next);
                  }}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-base"
                />
                <input
                  placeholder="Kaugnayan (Relationship)"
                  value={row.relationship}
                  onChange={(e) => {
                    const next = [...beneficiaryRows];
                    next[i] = { ...next[i], relationship: e.target.value };
                    setBeneficiaryRows(next);
                  }}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-base"
                />
                <button
                  type="button"
                  onClick={() => setBeneficiaryRows(beneficiaryRows.filter((_, idx) => idx !== i))}
                  className="text-rose-600 text-base px-2"
                >
                  Alisin (Remove)
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setBeneficiaryRows([...beneficiaryRows, { name: "", relationship: "" }])}
              className="text-slate-600 text-base hover:underline"
            >
              + Magdagdag (Add)
            </button>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={savingBeneficiaries}
                className="rounded-md bg-slate-900 text-white text-base px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
              >
                I-save (Save)
              </button>
              <button
                type="button"
                onClick={() => setEditingBeneficiaries(false)}
                className="rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50"
              >
                Kanselahin (Cancel)
              </button>
            </div>
          </form>
        ) : (member.beneficiaries ?? []).length === 0 ? (
          <p className="text-base text-slate-500">Wala pang nakalista. (None listed yet.)</p>
        ) : (
          <ul className="space-y-2">
            {member.beneficiaries!.map((b) => (
              <li key={b.id} className="text-base">
                {b.name} <span className="text-slate-500">({b.relationship})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-base font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lahat ng Transaksyon (All Transactions)
// ---------------------------------------------------------------------------

function TimelineTab({ timeline }: { timeline: TimelineEntry[] | null }) {
  const [filter, setFilter] = useState<"all" | "loan" | "deposit" | "share_capital">("all");

  if (timeline === null) return <p className="text-base text-slate-500">Naglo-load… (Loading…)</p>;

  const filtered = filter === "all" ? timeline : timeline.filter((t) => timelineCategory(t.type) === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 print:hidden">
        <label className="text-base text-slate-600">Salain ayon sa (Filter by):</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-md border border-slate-300 px-3 py-2 text-base"
        >
          <option value="all">Lahat (All)</option>
          <option value="loan">Pautang (Loans)</option>
          <option value="deposit">Deposits</option>
          <option value="share_capital">Share Capital</option>
        </select>
        <button onClick={() => window.print()} className="ml-auto text-base text-slate-600 hover:underline">
          I-print (Print)
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Petsa (Date)</th>
              <th className="px-4 py-2">Uri (Type)</th>
              <th className="px-4 py-2">Halaga (Amount)</th>
              <th className="px-4 py-2">OR/Voucher #</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  Walang transaksyon. (No transactions.)
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => {
                const row = (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">{formatDateTime(t.date)}</td>
                    <td className="px-4 py-2">{humanizeEnum(t.type)}</td>
                    <td className="px-4 py-2">{formatCurrency(t.amount)}</td>
                    <td className="px-4 py-2">
                      {t.reference ? `#${String(t.reference.sequenceNumber).padStart(6, "0")}` : "—"}
                    </td>
                  </tr>
                );
                return t.linkTo ? (
                  <Link key={i} to={t.linkTo} target={t.linkTo.startsWith("/receipts") || t.linkTo.startsWith("/disbursement-vouchers") ? "_blank" : undefined} className="contents">
                    {row}
                  </Link>
                ) : (
                  row
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pautang (Loans)
// ---------------------------------------------------------------------------

function LoansTab({ loans }: { loans: MemberStatement["loans"] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-base">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="px-4 py-2">Produkto (Product)</th>
            <th className="px-4 py-2">Prinsipal (Principal)</th>
            <th className="px-4 py-2">Natitirang Balanse (Remaining Balance)</th>
            <th className="px-4 py-2">Susunod na Bayaran (Next Due)</th>
            <th className="px-4 py-2">Katayuan (Status)</th>
          </tr>
        </thead>
        <tbody>
          {loans.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-slate-500" colSpan={5}>
                Wala pang pautang. (No loans yet.)
              </td>
            </tr>
          ) : (
            loans.map((loan) => (
              <tr key={loan.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/loans/${loan.id}`} className="text-slate-900 font-medium hover:underline">
                    {loan.loanProduct}
                  </Link>
                </td>
                <td className="px-4 py-2">{formatCurrency(loan.principalAmount)}</td>
                <td className="px-4 py-2">{loan.aging ? formatCurrency(loan.aging.outstandingBalance) : "—"}</td>
                <td className="px-4 py-2">
                  {loan.aging?.daysPastDue ? (
                    <span className="text-rose-600 font-medium">{loan.aging.daysPastDue} araw overdue</span>
                  ) : loan.aging?.nextDueDate ? (
                    formatDate(loan.aging.nextDueDate)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  <Badge value={loan.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share Capital (+ "Tanggapin ang Bayad" receive-payment action)
// ---------------------------------------------------------------------------

const CAN_RECORD_PAYMENT = ["cashier", "accountant", "manager", "admin"];
const CAN_APPROVE_PAYMENT = ["manager", "admin"];

function ShareCapitalTab({
  memberId,
  balance,
  transactions,
  onChange,
}: {
  memberId: string;
  balance: number;
  transactions: ShareCapitalTransaction[] | null;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"subscription" | "additional_purchase">(
    balance > 0 ? "additional_purchase" : "subscription"
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canRecord = user && CAN_RECORD_PAYMENT.includes(user.role);
  const canApprove = user && CAN_APPROVE_PAYMENT.includes(user.role);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/share-capital/transactions", { memberId, type, amount: Number(amount) });
      setAmount("");
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  async function act(txnId: string, action: "approve" | "reject") {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/share-capital/transactions/${txnId}/${action}`);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-base text-slate-500">Balanse (Balance)</p>
          <p className="text-2xl font-semibold text-slate-900">{formatCurrency(balance)}</p>
        </div>
        {canRecord && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="print:hidden rounded-md bg-slate-900 text-white text-base px-4 py-2 hover:bg-slate-800"
          >
            Tanggapin ang Bayad (Receive Payment)
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 max-w-md space-y-3 print:hidden">
          {error && <p className="text-base text-rose-600">{error}</p>}
          <div>
            <label className="block text-base font-medium text-slate-700 mb-1">Uri (Type)</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            >
              <option value="subscription">Subscription (Unang Bahagi)</option>
              <option value="additional_purchase">Additional Purchase (Dagdag na Bahagi)</option>
            </select>
          </div>
          <div>
            <label className="block text-base font-medium text-slate-700 mb-1">Halaga (Amount)</label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-slate-900 text-white text-base px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              Isumite (Submit)
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50"
            >
              Kanselahin (Cancel)
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Petsa (Date)</th>
              <th className="px-4 py-2">Uri (Type)</th>
              <th className="px-4 py-2">Halaga (Amount)</th>
              <th className="px-4 py-2">Katayuan (Status)</th>
              {canApprove && <th className="px-4 py-2 print:hidden">Aksyon (Actions)</th>}
            </tr>
          </thead>
          <tbody>
            {!transactions || transactions.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={canApprove ? 5 : 4}>
                  {transactions === null ? "Naglo-load… (Loading…)" : "Wala pang transaksyon. (No transactions yet.)"}
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-2">{humanizeEnum(t.type)}</td>
                  <td className="px-4 py-2">{formatCurrency(t.amount)}</td>
                  <td className="px-4 py-2">
                    <Badge value={t.status} />
                  </td>
                  {canApprove && (
                    <td className="px-4 py-2 print:hidden">
                      {t.status === "pending" && (
                        <div className="flex gap-2">
                          <button onClick={() => act(t.id, "approve")} className="text-emerald-700 text-base hover:underline">
                            Aprubahan
                          </button>
                          <button onClick={() => act(t.id, "reject")} className="text-rose-700 text-base hover:underline">
                            Tanggihan
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portal Login (unchanged logic, now behind an admin/manager-only tab)
// ---------------------------------------------------------------------------

function PortalLoginTab({ member, onChange }: { member: Member; onChange: () => void }) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function createLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginNotice(null);
    try {
      await api.post(`/members/${member.id}/login`, { email: loginEmail, password: loginPassword });
      setLoginEmail("");
      setLoginPassword("");
      setLoginNotice("Login created. Share the email and password with the member directly — there is no email delivery.");
      onChange();
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Failed to create login");
    }
  }

  async function toggleLoginStatus(nextStatus: "active" | "disabled") {
    setLoginError(null);
    setLoginNotice(null);
    try {
      await api.patch(`/members/${member.id}/login`, { status: nextStatus });
      onChange();
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Failed to update login");
    }
  }

  async function submitResetPassword(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginNotice(null);
    try {
      await api.patch(`/members/${member.id}/login`, { password: resetPassword });
      setResetPassword("");
      setLoginNotice("Password reset. Share the new password with the member directly.");
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Failed to reset password");
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md space-y-4">
      {loginNotice && <p className="text-base text-emerald-600">{loginNotice}</p>}
      {loginError && <p className="text-base text-rose-600">{loginError}</p>}

      {!member.userAccount ? (
        <>
          <p className="text-base text-slate-500">
            This member has no portal login yet. Create one to give them read-only access to their own account.
          </p>
          <form onSubmit={createLogin} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            />
            <input
              type="text"
              required
              minLength={8}
              placeholder="Temporary password (min 8 characters)"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            />
            <button type="submit" className="rounded-md bg-slate-900 text-white text-base px-4 py-2 hover:bg-slate-800">
              Create Login
            </button>
          </form>
        </>
      ) : (
        <>
          <dl className="text-base space-y-2">
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd>{member.userAccount.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>
                <Badge value={member.userAccount.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd>{formatDate(member.userAccount.createdAt)}</dd>
            </div>
          </dl>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <button
              onClick={() => toggleLoginStatus(member.userAccount!.status === "active" ? "disabled" : "active")}
              className="rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50"
            >
              {member.userAccount.status === "active" ? "Disable Login" : "Re-enable Login"}
            </button>

            <form onSubmit={submitResetPassword} className="space-y-2">
              <label className="block text-base font-medium text-slate-700">Reset password</label>
              <input
                type="text"
                required
                minLength={8}
                placeholder="New password (min 8 characters)"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
              />
              <button type="submit" className="rounded-md border border-slate-300 text-base px-4 py-2 hover:bg-slate-50">
                Reset Password
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
