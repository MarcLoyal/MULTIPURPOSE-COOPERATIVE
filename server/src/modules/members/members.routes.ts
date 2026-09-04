import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { notFound } from "../../lib/httpError";

export const membersRouter = Router();
membersRouter.use(requireAuth);

const createMemberSchema = z.object({
  memberNumber: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  dateJoined: z.coerce.date().optional(),
  beneficiaryName: z.string().optional(),
  beneficiaryRelationship: z.string().optional(),
});

const updateMemberSchema = createMemberSchema.partial();

const statusSchema = z.object({
  status: z.enum(["active", "inactive", "resigned", "deceased", "terminated"]),
});

membersRouter.get("/", async (req, res) => {
  const { status, q } = req.query as { status?: string; q?: string };
  const members = await prisma.member.findMany({
    where: {
      status: status ? (status as any) : undefined,
      OR: q
        ? [
            { fullName: { contains: q, mode: "insensitive" } },
            { memberNumber: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { shareCapitalAccount: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(members);
});

membersRouter.get("/:id", async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { id: req.params.id },
    include: {
      shareCapitalAccount: true,
      loanAccounts: true,
    },
  });
  if (!member) throw notFound("Member not found");
  res.json(member);
});

// Registering a member also opens their share capital account (1:1 per spec 3.2).
membersRouter.post("/", requireRole("admin", "manager", "accountant"), async (req, res) => {
  const data = createMemberSchema.parse(req.body);

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        ...data,
        createdById: req.user!.id,
      },
    });
    await tx.shareCapitalAccount.create({
      data: { memberId: created.id, balance: 0 },
    });
    await writeAuditLog(tx, {
      entityType: "Member",
      entityId: created.id,
      action: "create",
      newValue: created,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return created;
  });

  res.status(201).json(member);
});

membersRouter.patch("/:id", requireRole("admin", "manager", "accountant"), async (req, res) => {
  const data = updateMemberSchema.parse(req.body);
  const existing = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Member not found");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.member.update({ where: { id: req.params.id }, data });
    await writeAuditLog(tx, {
      entityType: "Member",
      entityId: result.id,
      action: "update",
      previousValue: existing,
      newValue: result,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return result;
  });

  res.json(updated);
});

// Status transitions (e.g. active -> resigned) require elevated privileges (spec 4.1).
membersRouter.post("/:id/status", requireRole("admin", "manager"), async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const existing = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Member not found");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.member.update({ where: { id: req.params.id }, data: { status } });
    await writeAuditLog(tx, {
      entityType: "Member",
      entityId: result.id,
      action: "update",
      previousValue: { status: existing.status },
      newValue: { status: result.status },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return result;
  });

  res.json(updated);
});
