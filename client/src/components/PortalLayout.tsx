import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function PortalLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-slate-100 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="font-semibold leading-tight">Multipurpose Cooperative</p>
          <p className="text-xs text-slate-400">Member Portal</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{user?.name}</p>
          <Link to="/portal/change-password" className="text-xs text-slate-300 underline hover:text-white mr-3">
            Change Password
          </Link>
          <button onClick={logout} className="text-xs text-slate-300 underline hover:text-white">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 bg-slate-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
