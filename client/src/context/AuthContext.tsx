import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, getToken, setToken, ApiError } from "../api/client";
import { CurrentUser } from "../lib/types";

type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: CurrentUser }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: CurrentUser }>("/auth/login", { email, password });
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  // Re-pulls /auth/me — used after a successful password change, since
  // mustChangePassword flips server-side but the already-issued token's
  // decoded claims never carried it in the first place (the server
  // reads it fresh on every /auth/me call, not from the token).
  async function refreshUser() {
    const res = await api.get<{ user: CurrentUser }>("/auth/me");
    setUser(res.user);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
