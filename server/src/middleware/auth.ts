import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../config/env";
import { unauthorized, forbidden } from "../lib/httpError";

export type JwtPayload = {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw unauthorized("Missing or invalid Authorization header");
  }
  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = {
      id: decoded.sub,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}

/**
 * Role-based access guard. Must run after requireAuth. This is the
 * server-side enforcement point for segregation of duties (e.g. a cashier
 * must never be able to hit an approval endpoint, regardless of what the
 * UI shows).
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw unauthorized();
    }
    if (!roles.includes(req.user.role)) {
      throw forbidden(`Role '${req.user.role}' is not permitted to perform this action`);
    }
    next();
  };
}
