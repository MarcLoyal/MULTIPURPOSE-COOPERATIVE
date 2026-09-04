import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type AuditActor = { id: string; name: string };

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
