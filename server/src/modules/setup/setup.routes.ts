import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { signToken } from "../../middleware/auth";
import { badRequest, conflict, tooManyRequests, unauthorized } from "../../lib/httpError";
import { writeAuditLog } from "../../lib/audit";

/**
 * First-time setup — the cooperative creates its own first admin. Public
 * (no requireAuth: nobody can log in yet), but every path through here is
 * guarded:
 *   1. Permanently locked once CooperativeProfile exists — checked
 *      before anything else, so even the correct code can never run
 *      this twice (see CooperativeProfile's doc comment in schema.prisma
 *      for why that row, not admin-existence, is the lock).
 *   2. Rate-limited: SETUP_CODE wrong too many times in a trailing
 *      window blocks further attempts, correct code or not, until the
 *      window clears. Global, not per-IP — this is a one-time,
 *      single-cooperative flow, and trusting a per-request IP header
 *      without a configured trusted proxy would be easy to spoof anyway.
 *   3. Fails closed if SETUP_CODE isn't configured on the server at all
 *      — same generic "invalid setup code" response either way, so an
 *      anonymous caller can't distinguish "misconfigured" from "wrong
 *      code."
 */
export const setupRouter = Router();

const FAILED_ATTEMPT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

// A single flag, not "needsSetup" plus "codeConfigured" separately — the
// normal login must always work regardless of setup state (demo accounts
// included, at all times), so the client has exactly one decision to
// make: show a "set up your cooperative" link, or don't. Whether that's
// because setup is already done or because SETUP_CODE was never
// configured for this environment makes no difference to that decision,
// and isn't worth exposing to an anonymous caller either way.
setupRouter.get("/status", async (_req, res) => {
  const profile = await prisma.cooperativeProfile.findFirst({ select: { id: true } });
  res.json({ setupAvailable: !profile && Boolean(env.setupCode) });
});

const setupSchema = z.object({
  setupCode: z.string().min(1),
  cooperative: z.object({
    name: z.string().min(1),
    address: z.string().min(1),
    cdaRegistrationNumber: z.string().min(1),
  }),
  admin: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

setupRouter.post("/", async (req, res) => {
  const existingProfile = await prisma.cooperativeProfile.findFirst({ select: { id: true } });
  if (existingProfile) {
    throw conflict("Setup has already been completed and can't be run again.");
  }

  const windowStart = new Date(Date.now() - FAILED_ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  const recentFailures = await prisma.setupAttempt.count({ where: { attemptedAt: { gte: windowStart } } });
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    throw tooManyRequests(`Too many failed setup attempts. Try again in ${FAILED_ATTEMPT_WINDOW_MINUTES} minutes.`);
  }

  const data = setupSchema.parse(req.body);

  const codeValid = Boolean(env.setupCode) && data.setupCode === env.setupCode;
  if (!codeValid) {
    await prisma.setupAttempt.create({ data: {} });
    throw unauthorized("Invalid setup code");
  }

  const emailTaken = await prisma.user.findUnique({ where: { email: data.admin.email } });
  if (emailTaken) throw badRequest("That email is already in use by another login");

  const passwordHash = await bcrypt.hash(data.admin.password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.cooperativeProfile.create({
      data: {
        name: data.cooperative.name,
        address: data.cooperative.address,
        cdaRegistrationNumber: data.cooperative.cdaRegistrationNumber,
      },
    });
    const admin = await tx.user.create({
      data: {
        name: data.admin.name,
        email: data.admin.email,
        passwordHash,
        role: "admin",
        // Self-chosen and confirmed right here in the setup form — not
        // a staff-set password, so no forced change on first login
        // (same rule self-service /auth/change-password already
        // follows: mustChangePassword is only ever true for a password
        // someone else picked).
        mustChangePassword: false,
      },
    });
    await writeAuditLog(tx, {
      entityType: "CooperativeProfile",
      entityId: profile.id,
      action: "create",
      newValue: { name: profile.name },
      performedBy: { id: admin.id, name: admin.name },
    });
    await writeAuditLog(tx, {
      entityType: "User",
      entityId: admin.id,
      action: "create",
      newValue: { name: admin.name, email: admin.email, role: admin.role },
      performedBy: { id: admin.id, name: admin.name },
    });
    return { profile, admin };
  });

  const token = signToken({
    sub: result.admin.id,
    name: result.admin.name,
    email: result.admin.email,
    role: result.admin.role,
    memberId: null,
  });

  res.status(201).json({
    token,
    user: {
      id: result.admin.id,
      name: result.admin.name,
      email: result.admin.email,
      role: result.admin.role,
      memberId: null,
      mustChangePassword: false,
    },
  });
});
