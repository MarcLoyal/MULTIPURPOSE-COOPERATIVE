import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

type ModuleSettingsValue = {
  // undefined while loading, then the key->enabled map. Treat a missing
  // key as enabled (see server's getModuleSettings doc comment — same
  // "new module defaults on" reasoning applies client-side).
  modules: Record<string, boolean> | undefined;
  isModuleEnabled: (key: string) => boolean;
};

const ModuleSettingsContext = createContext<ModuleSettingsValue>({
  modules: undefined,
  isModuleEnabled: () => true,
});

/**
 * Fetches the per-deployment module on/off map once per staff session
 * (see ModuleSetting's doc comment in schema.prisma) and makes it
 * available to Layout.tsx's nav filtering and App.tsx's ModuleGate.
 * Never fetched for a member-role login — the portal has no nav to
 * filter, and GET /settings/modules is a staff-only route anyway.
 */
export function ModuleSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [modules, setModules] = useState<Record<string, boolean> | undefined>(undefined);

  useEffect(() => {
    if (!user || user.role === "member") {
      setModules(undefined);
      return;
    }
    api
      .get<Record<string, boolean>>("/settings/modules")
      .then(setModules)
      .catch(() => setModules({}));
  }, [user]);

  function isModuleEnabled(key: string): boolean {
    if (!modules) return true;
    return modules[key] ?? true;
  }

  return (
    <ModuleSettingsContext.Provider value={{ modules, isModuleEnabled }}>{children}</ModuleSettingsContext.Provider>
  );
}

export function useModuleSettings(): ModuleSettingsValue {
  return useContext(ModuleSettingsContext);
}
