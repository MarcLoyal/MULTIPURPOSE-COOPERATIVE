import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

export const auditRouter = Router();
auditRouter.use(requireAuth);

const ACTION_PHRASES: Record<string, string> = {
  create: "created",
  update: "updated",
  approve: "approved",
  reject: "rejected",
  delete_attempt: "attempted to delete",
};

function toPlainLanguage(log: {
  entityType: string;
  action: string;
  performedByName: string;
  performedAt: Date;
}): string {
  const verb = ACTION_PHRASES[log.action] ?? log.action;
  const entityLabel = log.entityType.replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${log.performedByName} ${verb} this ${entityLabel} on ${log.performedAt.toLocaleString()}`;
}

/**
 * GET /api/audit/:entityType/:entityId
 * Returns the append-only activity log for one entity, in plain language,
 * newest first. Used by the "Activity Log" tab on every entity detail view.
 */
auditRouter.get("/:entityType/:entityId", async (req, res) => {
  const { entityType, entityId } = req.params;
  const logs = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { performedAt: "desc" },
  });

  res.json(
    logs.map((log) => ({
      id: log.id,
      action: log.action,
      performedByName: log.performedByName,
      performedAt: log.performedAt,
      previousValue: log.previousValue,
      newValue: log.newValue,
      description: toPlainLanguage(log),
    }))
  );
});
