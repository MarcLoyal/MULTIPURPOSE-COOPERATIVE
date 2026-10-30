import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TABS = [
  {
    to: "/portal",
    label: "Dashboard",
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    to: "/portal/statement",
    label: "Statement",
    end: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    to: "/portal/change-password",
    label: "Account",
    end: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
        <circle cx="12" cy="8" r="3.2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
      </svg>
    ),
  },
];

export function PortalLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-10 bg-slate-900 text-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-semibold leading-tight text-sm truncate">Multipurpose Cooperative</p>
          <p className="text-xs text-slate-400 truncate">{user?.name}</p>
        </div>
        <button
          onClick={logout}
          className="shrink-0 text-xs text-slate-300 underline py-2 pl-3 hover:text-white"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 z-10 bg-white border-t border-slate-200 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium ${
                isActive ? "text-slate-900" : "text-slate-400"
              }`
            }
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
