import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type AuditActor = { id: string; name: string };

// Shared with both the per-entity "Activity Log" tab (audit.routes.ts's
// GET /:entityType/:entityId) and the global Audit Log viewer (GET /) —
// one phrasing map and one renderer, so the two views never drift.
export const AUDIT_ACTION_PHRASES: Record<AuditAction, string> = {
  create: "created",
  update: "updated",
  approve: "approved",
  reject: "rejected",
  delete_attempt: "attempted to delete",
};

export function describeAuditLog(log: { entityType: string; action: AuditAction; performedByName: string; performedAt: Date }): string {
  const verb = AUDIT_ACTION_PHRASES[log.action] ?? log.action;
  const entityLabel = log.entityType.replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${log.performedByName} ${verb} this ${entityLabel} on ${log.performedAt.toLocaleString()}`;
}

/**
 * Writes one append-only AuditLog row. Accepts an optional Prisma transaction
 * client so callers can record the audit entry atomically with the business
 * write it describes.
 */
export async function writeAuditLog(
  tx: Prisma.TransactionClient | typeof prisma,
  params: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    previousValue?: unknown;
    newValue?: unknown;
    performedBy: AuditActor;
  }
) {
  await tx.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      previousValue: params.previousValue === undefined ? Prisma.JsonNull : (params.previousValue as Prisma.InputJsonValue),
      newValue: params.newValue === undefined ? Prisma.JsonNull : (params.newValue as Prisma.InputJsonValue),
      performedById: params.performedBy.id,
      performedByName: params.performedBy.name,
    },
  });
}
