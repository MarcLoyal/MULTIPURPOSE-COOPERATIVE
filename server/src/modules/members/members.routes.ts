import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { buildMemberStatement } from "../../lib/memberStatement";
import { buildMemberTimeline } from "../../lib/memberTimeline";

export const membersRouter = Router();
membersRouter.use(requireAuth, requireStaff);

// A base64 data URL, resized/compressed to roughly 200px / 100KB
// client-side before upload (see MemberDetailPage.tsx) — this cap is a
// generous backstop, not the primary size control. ~145,000 characters
// covers a ~100KB image plus base64's ~33% inflation with headroom.
const PHOTO_MAX_LENGTH = 200_000;

const createMemberSchema = z.object({
  memberNumber: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  dateJoined: z.coerce.date().optional(),
  beneficiaryName: z.string().optional(),
  beneficiaryRelationship: z.string().optional(),
  // IWMPC Phase 1 additions — all optional, all additive.
  birthDate: z.coerce.date().optional(),
  civilStatus: z.enum(["single", "married", "widowed", "separated"]).optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  photoUrl: z.string().max(PHOTO_MAX_LENGTH, "Photo is too large").optional(),
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
    // Explicit select, not `include` on top of the default "every
    // scalar field" — deliberately leaves out photoUrl so a page
    // listing many members never pulls every photo over the wire.
    select: {
      id: true,
      memberNumber: true,
      fullName: true,
      phone: true,
      email: true,
      address: true,
      dateJoined: true,
      status: true,
      membershipClass: true,
      beneficiaryName: true,
      beneficiaryRelationship: true,
      birthDate: true,
      civilStatus: true,
      idType: true,
      idNumber: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      shareCapitalAccount: true,
    },
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
      depositAccounts: { include: { depositProduct: true } },
      beneficiaries: { orderBy: { sortOrder: "asc" } },
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
        birthDate: data.birthDate,
        civilStatus: data.civilStatus,
        idType: data.idType,
        idNumber: data.idNumber,
        photoUrl: data.photoUrl,
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

// Lahat ng Transaksyon (All Transactions) — see lib/memberTimeline.ts.
membersRouter.get("/:id/transactions", async (req, res) => {
  res.json(await buildMemberTimeline(req.params.id));
});

const beneficiariesSchema = z.object({
  beneficiaries: z
    .array(
      z.object({
        name: z.string().min(1),
        relationship: z.string().min(1),
      })
    )
    .max(10),
});

// Replaces the WHOLE list in one call rather than per-row CRUD — the
// simplest correct behavior for a list this short, and keeps viewing
// and editing separate at the UI level (one "Save beneficiaries"
// action, not inline-editable rows). Does not touch the old flat
// Member.beneficiaryName/beneficiaryRelationship fields — see
// MemberBeneficiary's schema comment for why those stay untouched.
membersRouter.put(
  "/:id/beneficiaries",
  requireRole("admin", "manager", "accountant"),
  async (req, res) => {
    const { beneficiaries } = beneficiariesSchema.parse(req.body);
    const existing = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Member not found");

    const result = await prisma.$transaction(async (tx) => {
      await tx.memberBeneficiary.deleteMany({ where: { memberId: req.params.id } });
      if (beneficiaries.length === 0) return [];
      await tx.memberBeneficiary.createMany({
        data: beneficiaries.map((b, i) => ({
          memberId: req.params.id,
          name: b.name,
          relationship: b.relationship,
          sortOrder: i,
        })),
      });
      const rows = await tx.memberBeneficiary.findMany({
        where: { memberId: req.params.id },
        orderBy: { sortOrder: "asc" },
      });
      await writeAuditLog(tx, {
        entityType: "Member",
        entityId: req.params.id,
        action: "update",
        newValue: { beneficiaries: rows },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return rows;
    });

    res.json(result);
  }
);
