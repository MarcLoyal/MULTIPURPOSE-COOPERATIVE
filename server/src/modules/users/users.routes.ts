import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { writeAuditLog } from "../../lib/audit";

/**
 * Staff User Management — admin only. Creates/deactivates/reactivates
 * staff logins (the five roles requireStaff recognizes) and resets their
 * passwords. Reuses the exact same "staff sets a password, the holder
 * must replace it on next login" mechanism members.routes.ts's
 * POST/PATCH /:id/login already established for member-portal logins —
 * same mustChangePassword flag, same bcrypt hashing, same pattern.
 *
 * Member-role logins never show up here (filtered out below) and can't
 * be created, disabled, or reset through this router — that's
 * members.routes.ts's /:id/login, a separate workflow.
 */
export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("admin"));

const STAFF_ROLES = ["cashier", "credit_officer", "manager", "accountant", "admin"] as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { not: "member" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, status: true, mustChangePassword: true, createdAt: true },
  });
  res.json(users);
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(STAFF_ROLES),
});

usersRouter.post("/", async (req, res) => {
  const data = createUserSchema.parse(req.body);

  const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
  if (emailTaken) throw badRequest("That email is already in use by another login");

  const passwordHash = await bcrypt.hash(data.password, 10);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        // A staff account's initial password is, by definition, one the
        // holder didn't choose — force them to replace it on first
        // login, same as a freshly created member portal login.
        mustChangePassword: true,
      },
    });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: user.id,
      action: "create",
      newValue: { name: user.name, email: user.email, role: user.role },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return user;
  });

  res.status(201).json({
    id: created.id,
    name: created.name,
    email: created.email,
    role: created.role,
    status: created.status,
    mustChangePassword: created.mustChangePassword,
    createdAt: created.createdAt,
  });
});

const updateUserSchema = z
  .object({
    status: z.enum(["active", "disabled"]).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((data) => data.status !== undefined || data.password !== undefined, {
    message: "Provide status and/or password",
  });

usersRouter.patch("/:id", async (req, res) => {
  const data = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role === "member") throw notFound("Staff user not found");

  if (data.status === "disabled") {
    // An admin can never deactivate their own account — regardless of
    // how many other active admins exist — so there's never a moment
    // where the admin doing the deactivating has just locked themself
    // out.
    if (existing.id === req.user!.id) {
      throw conflict("You can't deactivate your own account");
    }
    // Separately, the system as a whole must always keep at least one
    // active admin — so deactivating any OTHER admin is blocked too,
    // if they're the last one standing.
    if (existing.role === "admin" && existing.status === "active") {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: "admin", status: "active", id: { not: existing.id } },
      });
      if (otherActiveAdmins === 0) {
        throw conflict("Can't deactivate the only active admin — reactivate or promote another admin first");
      }
    }
  }

  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: existing.id },
      data: {
        status: data.status,
        passwordHash,
        // Same rule as members.routes.ts's PATCH /:id/login: a
        // staff-set password forces a replace on next login.
        mustChangePassword: passwordHash ? true : undefined,
      },
    });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: user.id,
      action: "update",
      previousValue: { status: existing.status },
      newValue: { status: user.status, passwordReset: passwordHash !== undefined },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return user;
  });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    status: updated.status,
    mustChangePassword: updated.mustChangePassword,
  });
});
