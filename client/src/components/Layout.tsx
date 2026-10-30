import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { humanizeEnum } from "../lib/format";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/members", label: "Members" },
  { to: "/share-capital", label: "Share Capital" },
  { to: "/loans", label: "Loans" },
  { to: "/deposits", label: "Deposits" },
  { to: "/cash", label: "Cash" },
  { to: "/ledger", label: "General Ledger" },
  { to: "/trial-balance", label: "Trial Balance" },
  { to: "/income-statement", label: "Income Statement" },
  { to: "/balance-sheet", label: "Statement of Financial Condition" },
  { to: "/cash-flow-statement", label: "Statement of Cash Flows" },
  { to: "/fiscal-years", label: "Fiscal Years" },
  { to: "/allowance-report", label: "Allowance for Losses" },
  { to: "/cda-data-pack", label: "CDA Report Data Pack" },
];

const SETTINGS_ROLES = ["manager", "accountant", "admin"];

export function Layout() {
  const { user, logout } = useAuth();
  let navItems = user && SETTINGS_ROLES.includes(user.role)
    ? [
        ...NAV_ITEMS,
        { to: "/settings/allowance-rates", label: "Allowance Settings" },
        { to: "/settings/deposit-products", label: "Deposit Products" },
        { to: "/settings/loan-products", label: "Loan Products" },
        { to: "/settings/dividend-rates", label: "Dividend Rates" },
        { to: "/settings/loan-limit", label: "Loan Limit" },
        { to: "/settings/receipt-label", label: "Receipt Label" },
      ]
    : NAV_ITEMS;
  if (user?.role === "admin") {
    navItems = [...navItems, { to: "/settings/staff-users", label: "Staff Users" }];
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col print:hidden">
        <div className="px-4 py-5 border-b border-slate-700">
          <p className="font-semibold leading-tight">Multipurpose Cooperative</p>
          <p className="text-xs text-slate-400">Automation MVP</p>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm rounded-md mx-2 ${
                  isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700 text-sm">
          <p className="font-medium">{user?.name}</p>
          <p className="text-slate-400 text-xs mb-2">{user ? humanizeEnum(user.role) : ""}</p>
          <button onClick={logout} className="text-xs text-slate-300 underline hover:text-white">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-slate-50 p-6 overflow-y-auto print:bg-white print:p-0">
        <Outlet />
      </main>
    </div>
  );
}
