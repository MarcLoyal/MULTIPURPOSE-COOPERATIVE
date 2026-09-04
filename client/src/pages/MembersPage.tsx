import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Member } from "../lib/types";
import { Badge } from "../components/Badge";
import { formatDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const CAN_CREATE_MEMBER = ["admin", "manager", "accountant"];

export function MembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    memberNumber: "",
    fullName: "",
    phone: "",
    email: "",
    address: "",
    beneficiaryName: "",
    beneficiaryRelationship: "",
  });

  function load() {
    api.get<Member[]>(`/members${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setMembers);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/members", form);
      setShowForm(false);
      setForm({
        memberNumber: "",
        fullName: "",
        phone: "",
        email: "",
        address: "",
        beneficiaryName: "",
        beneficiaryRelationship: "",
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to register member");
    }
  }

  const canCreate = user && CAN_CREATE_MEMBER.includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Members</h1>
          <p className="text-sm text-slate-500">Register and manage cooperative membership.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "Register Member"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Member number (e.g. MPC-0002)"
              value={form.memberNumber}
              onChange={(e) => setForm({ ...form, memberNumber: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm col-span-2"
            />
            <input
              placeholder="Beneficiary name"
              value={form.beneficiaryName}
              onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Beneficiary relationship"
              value={form.beneficiaryRelationship}
              onChange={(e) => setForm({ ...form, beneficiaryRelationship: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Save Member
          </button>
        </form>
      )}

      <input
        placeholder="Search by name or member number…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Member #</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Date Joined</th>
              <th className="px-4 py-2">Share Capital</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {members === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No members found.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/members/${m.id}`} className="text-slate-900 font-medium hover:underline">
                      {m.memberNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link to={`/members/${m.id}`} className="hover:underline">
                      {m.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatDate(m.dateJoined)}</td>
                  <td className="px-4 py-2">
                    {m.shareCapitalAccount ? Number(m.shareCapitalAccount.balance).toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge value={m.status} />
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
