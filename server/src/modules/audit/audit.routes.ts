import { Router } from "express";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { describeAuditLog } from "../../lib/audit";
import { badRequest } from "../../lib/httpError";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireStaff);

/**
 * GET /api/audit/:entityType/:entityId
 * Returns the append-only activity log for one entity, in plain language,
 * newest first. Used by the "Activity Log" tab on every entity detail view.
 * Open to any staff role (same as the rest of that detail page), unlike
 * the global viewer below which is manager/admin only.
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
      description: describeAuditLog(log),
    }))
  );
});

const AUDIT_ACTIONS: AuditAction[] = ["create", "update", "approve", "reject", "delete_attempt"];

function parseFilters(query: Record<string, unknown>) {
  const userId = typeof query.userId === "string" && query.userId ? query.userId : undefined;
  const actionRaw = typeof query.action === "string" ? query.action : undefined;
  if (actionRaw && !AUDIT_ACTIONS.includes(actionRaw as AuditAction)) {
    throw badRequest(`action must be one of: ${AUDIT_ACTIONS.join(", ")}`);
  }
  const action = actionRaw as AuditAction | undefined;

  const dateFrom = typeof query.dateFrom === "string" && query.dateFrom ? new Date(query.dateFrom) : undefined;
  if (dateFrom && Number.isNaN(dateFrom.getTime())) throw badRequest("dateFrom is not a valid date");
  const dateTo = typeof query.dateTo === "string" && query.dateTo ? new Date(query.dateTo) : undefined;
  if (dateTo && Number.isNaN(dateTo.getTime())) throw badRequest("dateTo is not a valid date");
  // dateTo is a calendar day picked in the UI — include the whole day,
  // not just its midnight instant.
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  const where: Prisma.AuditLogWhereInput = {
    performedById: userId,
    action,
    performedAt:
      dateFrom || dateTo
        ? {
            gte: dateFrom,
            lte: dateTo,
          }
        : undefined,
  };
  return where;
}

/**
 * GET /api/audit/filters
 * Distinct (id, name) pairs for every user who actually appears in the
 * audit log, for populating the "User" filter dropdown. Deliberately
 * not GET /api/users (admin-only, and includes staff who have never
 * performed a logged action) — this is scoped to this module's own
 * manager/admin access and to users the log can actually filter on.
 */
auditRouter.get("/filters", requireRole("manager", "admin"), async (_req, res) => {
  const rows = await prisma.auditLog.findMany({
    distinct: ["performedById"],
    select: { performedById: true, performedByName: true },
    orderBy: { performedByName: "asc" },
  });
  res.json({
    users: rows.map((r) => ({ id: r.performedById, name: r.performedByName })),
    actions: AUDIT_ACTIONS,
  });
});

const PAGE_SIZE = 50;

/**
 * GET /api/audit
 * The global audit log viewer's data source: every AuditLog row across
 * every entity type, newest first, filterable by user/action/date and
 * paginated (this table is append-only and never trimmed, so it only
 * grows). Manager/admin only, per the cooperative's governance need to
 * review approvals, voids, postings, and user/settings changes.
 */
auditRouter.get("/", requireRole("manager", "admin"), async (req, res) => {
  const where = parseFilters(req.query as Record<string, unknown>);
  const page = Math.max(1, Number(req.query.page) || 1);

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { performedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  res.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    logs: logs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      performedById: log.performedById,
      performedByName: log.performedByName,
      performedAt: log.performedAt,
      previousValue: log.previousValue,
      newValue: log.newValue,
      description: describeAuditLog(log),
    })),
  });
});

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * GET /api/audit/export
 * CSV of every AuditLog row matching the same filters as GET / — the
 * whole matching set in one file, not just the current page, since an
 * export is meant to leave the app (for the board, an auditor, etc.).
 * Generated server-side rather than built up from a JSON fetch
 * client-side, since an unpaginated result set here can be large.
 */
auditRouter.get("/export", requireRole("manager", "admin"), async (req, res) => {
  const where = parseFilters(req.query as Record<string, unknown>);
  const logs = await prisma.auditLog.findMany({ where, orderBy: { performedAt: "desc" } });

  const header = ["Date", "User", "Action", "Entity Type", "Entity ID", "Description"];
  const rows = logs.map((log) => [
    log.performedAt.toISOString(),
    log.performedByName,
    log.action,
    log.entityType,
    log.entityId,
    describeAuditLog(log),
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
