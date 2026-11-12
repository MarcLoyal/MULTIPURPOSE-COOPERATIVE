import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useModuleSettings } from "../context/ModuleSettingsContext";
import { humanizeEnum } from "../lib/format";

// Always on, never gated by a module flag — Dashboard/Members/Cash/Loans
// are IWMPC's whole Phase 1 (bilingual labels given directly by the
// client; "Home"/"Cashier" rather than "Dashboard"/"Cash" are the nav
// names they asked for, even though the underlying pages/routes keep
// their existing names). Shown in full for every deployment, including
// the existing cooperative — a plain label-text/sizing change, not
// worth gating behind a module flag just for that.
const CORE_NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/members", label: "Kasapi (Members)" },
  { to: "/cash", label: "Kahera (Cashier)" },
  { to: "/loans", label: "Pautang (Loans)" },
];

// Each tied to its own ModuleSetting row — on by default (existing
// cooperative sees every one of these, unchanged), off for IWMPC.
const MODULE_NAV_ITEMS = [
  { to: "/share-capital", label: "Share Capital", moduleKey: "shareCapital" },
  { to: "/deposits", label: "Deposits", moduleKey: "deposits" },
  { to: "/ledger", label: "General Ledger", moduleKey: "generalLedger" },
  { to: "/trial-balance", label: "Trial Balance", moduleKey: "trialBalance" },
  { to: "/income-statement", label: "Income Statement", moduleKey: "incomeStatement" },
  { to: "/balance-sheet", label: "Statement of Financial Condition", moduleKey: "balanceSheet" },
  { to: "/cash-flow-statement", label: "Statement of Cash Flows", moduleKey: "cashFlowStatement" },
  { to: "/fiscal-years", label: "Fiscal Years", moduleKey: "fiscalYears" },
  { to: "/allowance-report", label: "Allowance for Losses", moduleKey: "allowanceReport" },
  { to: "/cda-data-pack", label: "CDA Report Data Pack", moduleKey: "cdaDataPack" },
];

// Bundled under the single "advanced" flag — settings pages and admin
// tools, same as today's role gating, just also hidden behind one
// module flag on top of it.
const ADVANCED_NAV_ITEMS: { to: string; label: string; roles: string[] }[] = [
  { to: "/settings/allowance-rates", label: "Allowance Settings", roles: ["manager", "accountant", "admin"] },
  { to: "/settings/deposit-products", label: "Deposit Products", roles: ["manager", "accountant", "admin"] },
  { to: "/settings/loan-products", label: "Loan Products", roles: ["manager", "accountant", "admin"] },
  { to: "/settings/dividend-rates", label: "Dividend Rates", roles: ["manager", "accountant", "admin"] },
  { to: "/settings/loan-limit", label: "Loan Limit", roles: ["manager", "accountant", "admin"] },
  { to: "/settings/receipt-label", label: "Receipt Label", roles: ["manager", "accountant", "admin"] },
  { to: "/audit-log", label: "Audit Log", roles: ["manager", "admin"] },
  { to: "/settings/staff-users", label: "Staff Users", roles: ["admin"] },
  { to: "/settings/opening-balances-import", label: "Opening Balances Import", roles: ["admin"] },
  { to: "/settings/modules", label: "Modules (On/Off)", roles: ["admin"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { isModuleEnabled } = useModuleSettings();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const visibleModuleItems = MODULE_NAV_ITEMS.filter((item) => isModuleEnabled(item.moduleKey));
  const hiddenModuleItems = MODULE_NAV_ITEMS.filter((item) => !isModuleEnabled(item.moduleKey));

  const advancedEnabled = isModuleEnabled("advanced");
  const visibleAdvancedItems = advancedEnabled
    ? ADVANCED_NAV_ITEMS.filter((item) => user && item.roles.includes(user.role))
    : [];
  const hiddenAdvancedItems = !advancedEnabled
    ? ADVANCED_NAV_ITEMS.filter((item) => user && item.roles.includes(user.role))
    : [];

  // Only admin ever gets the expander, and only when something is
  // actually hidden — an all-modules-on deployment (the existing
  // cooperative, by default) never even sees this link.
  const canExpandAdvanced = user?.role === "admin" && (hiddenModuleItems.length > 0 || hiddenAdvancedItems.length > 0);

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 bg-slate-900 text-slate-100 flex flex-col print:hidden">
        <div className="px-4 py-5 border-b border-slate-700">
          <p className="font-semibold leading-tight">Multipurpose Cooperative</p>
          <p className="text-xs text-slate-400">Automation MVP</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {CORE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-4 py-3 text-lg font-medium rounded-md mx-2 ${
                  isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          {visibleModuleItems.length > 0 && <div className="my-2 mx-4 border-t border-slate-700" />}
          {visibleModuleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-2 text-base rounded-md mx-2 ${
                  isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          {visibleAdvancedItems.length > 0 && <div className="my-2 mx-4 border-t border-slate-700" />}
          {visibleAdvancedItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-2 text-base rounded-md mx-2 ${
                  isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          {canExpandAdvanced && (
            <div className="mx-2 mt-2">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
              >
                {advancedOpen ? "▾" : "▸"} Advanced
              </button>
              {advancedOpen && (
                <div className="space-y-1">
                  {[...hiddenModuleItems, ...hiddenAdvancedItems].map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `block px-4 py-2 text-sm rounded-md ${
                          isActive ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
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
