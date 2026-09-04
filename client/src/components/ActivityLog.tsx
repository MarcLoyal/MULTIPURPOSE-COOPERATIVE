import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AuditLogEntry } from "../lib/types";
import { formatDateTime } from "../lib/format";

export function ActivityLog({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    setLogs(null);
    api.get<AuditLogEntry[]>(`/audit/${entityType}/${entityId}`).then(setLogs);
  }, [entityType, entityId]);

  if (logs === null) return <p className="text-sm text-slate-500">Loading activity…</p>;
  if (logs.length === 0) return <p className="text-sm text-slate-500">No activity recorded yet.</p>;

  return (
    <ul className="space-y-3">
      {logs.map((log) => (
        <li key={log.id} className="border-l-2 border-slate-300 pl-3 text-sm">
          <p className="text-slate-800">{log.description}</p>
          <p className="text-xs text-slate-400">{formatDateTime(log.performedAt)}</p>
        </li>
      ))}
    </ul>
  );
}
