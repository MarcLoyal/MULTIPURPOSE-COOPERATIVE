import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { buildMemberStatement } from "../../lib/memberStatement";

export const membersRouter = Router();
membersRouter.use(requireAuth, requireStaff);

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
      // Never passwordHash — this is read by any staff role, not just
      // the ones allowed to manage the login itself.
      userAccount: { select: { id: true, email: true, status: true, createdAt: true } },
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
      // Explicit fields, not a spread — Vercel's build flagged
      // `...data` here as resolving to `never` against Prisma's
      // generated (XOR-unioned) create-input type. Not reproducible
      // locally even controlling for TS version/Prisma Client version/
      // compiler options, but explicit fields sidestep the whole
      // spread-into-union inference question regardless of root cause.
      data: {
        memberNumber: data.memberNumber,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        address: data.address,
        dateJoined: data.dateJoined,
        beneficiaryName: data.beneficiaryName,
        beneficiaryRelationship: data.beneficiaryRelationship,
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

// ---------------------------------------------------------------------------
// Member portal login (roadmap item 4) — staff creates/manages a member's
// own login from their record. No public self-signup path exists anywhere
// in this app; a member login only ever comes from here.
// ---------------------------------------------------------------------------

const createLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

membersRouter.post(
  "/:id/login",
  requireRole("admin", "manager"),
  async (req, res) => {
    const data = createLoginSchema.parse(req.body);
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) throw notFound("Member not found");

    const existingLogin = await prisma.user.findUnique({ where: { memberId: member.id } });
    if (existingLogin) throw conflict("This member already has a portal login");

    const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
    if (emailTaken) throw badRequest("That email is already in use by another login");

    const passwordHash = await bcrypt.hash(data.password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: member.fullName,
          email: data.email,
          passwordHash,
          role: "member",
          memberId: member.id,
          mustChangePassword: true,
        },
      });
      await writeAuditLog(tx, {
        entityType: "User",
        entityId: user.id,
        action: "create",
        newValue: { email: user.email, role: user.role, memberId: user.memberId },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return user;
    });

    res.status(201).json({ id: created.id, email: created.email, status: created.status, createdAt: created.createdAt });
  }
);

const updateLoginSchema = z
  .object({
    status: z.enum(["active", "disabled"]).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((data) => data.status !== undefined || data.password !== undefined, {
    message: "Provide status and/or password",
  });

membersRouter.patch(
  "/:id/login",
  requireRole("admin", "manager"),
  async (req, res) => {
    const data = updateLoginSchema.parse(req.body);
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) throw notFound("Member not found");

    const existingLogin = await prisma.user.findUnique({ where: { memberId: member.id } });
    if (!existingLogin) throw notFound("This member has no portal login");

    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: existingLogin.id },
        // A staff-set password is, by definition, one the member didn't
        // choose — force them to replace it on next login, same as a
        // freshly created login.
        data: { status: data.status, passwordHash, mustChangePassword: passwordHash ? true : undefined },
      });
      await writeAuditLog(tx, {
        entityType: "User",
        entityId: user.id,
        action: "update",
        previousValue: { status: existingLogin.status },
        newValue: { status: user.status, passwordReset: passwordHash !== undefined },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return user;
    });

    res.json({ id: updated.id, email: updated.email, status: updated.status, createdAt: updated.createdAt });
  }
);

// Printable/downloadable statement of account — see lib/memberStatement.ts.
membersRouter.get("/:id/statement", async (req, res) => {
  res.json(await buildMemberStatement(req.params.id));
});
