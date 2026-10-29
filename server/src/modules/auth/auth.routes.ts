import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { signToken } from "../../middleware/auth";
import { badRequest, unauthorized } from "../../lib/httpError";
import { requireAuth } from "../../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "active") {
    throw unauthorized("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw unauthorized("Invalid email or password");
  }

  const token = signToken({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    memberId: user.memberId,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      memberId: user.memberId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

// Reads mustChangePassword (and anything else that can change after the
// token was issued) fresh from the database rather than trusting the
// JWT's snapshot — a token minted before a staff-forced reset would
// otherwise keep reporting the old value until it expires.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || user.status !== "active") {
    throw unauthorized();
  }
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      memberId: user.memberId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Any authenticated login's own self-service password change — the
// only way mustChangePassword is ever cleared, and (until this PR) the
// only way ANY login, staff or member, could change its own password
// at all.
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw unauthorized();

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw badRequest("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  res.json({ changed: true });
});
