import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useModuleSettings } from "../context/ModuleSettingsContext";

/**
 * Client-side counterpart to the server's requireModule (see
 * lib/moduleSettings.ts) — redirects away from a report/accounting
 * page or an "advanced" admin tool when its module is off, same admin
 * bypass. This is UX, not the real enforcement; the server route is
 * what actually blocks a non-admin who navigates here directly (same
 * relationship StaffArea/MemberArea already have to requireStaff).
 */
export function ModuleGate({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { user } = useAuth();
  const { isModuleEnabled } = useModuleSettings();
  if (user?.role === "admin") return <>{children}</>;
  if (!isModuleEnabled(moduleKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
