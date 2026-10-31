import { useEffect, useState } from "react";
import { api, ApiError, getToken, API_BASE_URL } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { AuditLogFilterOptions, GlobalAuditLogPage } from "../lib/types";
import { formatDateTime, humanizeEnum } from "../lib/format";

export function AuditLogPage() {
  const { user } = useAuth();
  const [filterOptions, setFilterOptions] = useState<AuditLogFilterOptions | null>(null);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<GlobalAuditLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const canView = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (!canView) return;
    api
      .get<AuditLogFilterOptions>("/audit/filters")
      .then(setFilterOptions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load filters"));
  }, [canView]);

  function buildQuery(extra?: Record<string, string | number>) {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (action) params.set("action", action);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
    return params.toString();
  }

  function load(targetPage: number) {
    setError(null);
    api
      .get<GlobalAuditLogPage>(`/audit?${buildQuery({ page: targetPage })}`)
      .then((r) => {
        setResult(r);
        setPage(r.page);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit log"));
  }

  useEffect(() => {
    if (!canView) return;
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, userId, action, dateFrom, dateTo]);

  async function exportCsv() {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/api/audit/export?${buildQuery()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError("Failed to export CSV");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (user && !canView) {
    return <p className="text-slate-500">Audit Log is for admins and managers only.</p>;
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Who did what and when — approvals, voids, postings, and user and settings changes, across every module.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
        >
          Export CSV
        </button>
      </div>

      {error && <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">User</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[12rem]"
          >
            <option value="">All users</option>
            {(filterOptions?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {(filterOptions?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {humanizeEnum(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {(userId || action || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setUserId("");
              setAction("");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-sm text-slate-500 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {result === null ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : result.logs.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No activity matches these filters.
                </td>
              </tr>
            ) : (
              result.logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(log.performedAt)}</td>
                  <td className="px-4 py-2">{log.performedByName}</td>
                  <td className="px-4 py-2">{humanizeEnum(log.action)}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {log.entityType} <span className="text-xs">{log.entityId.slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-2">
                    {log.description}
                    {expandedId === log.id && (
                      <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-md p-2 overflow-x-auto">
                        {JSON.stringify({ previousValue: log.previousValue, newValue: log.newValue }, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <p>
            {(page - 1) * result.pageSize + 1}–{Math.min(page * result.pageSize, result.total)} of {result.total}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
