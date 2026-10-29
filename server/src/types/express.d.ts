import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        // Only present for role=member — the Member record this login
        // is linked to. Portal routes scope every query to this, never
        // to anything from the request body/params.
        memberId?: string | null;
      };
    }
  }
}

export {};
