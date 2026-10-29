import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { PortalLayout } from "./components/PortalLayout";
import { LoginPage } from "./pages/LoginPage";
import { PortalPage } from "./pages/PortalPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MembersPage } from "./pages/MembersPage";
import { MemberDetailPage } from "./pages/MemberDetailPage";
import { ShareCapitalPage } from "./pages/ShareCapitalPage";
import { LoansPage } from "./pages/LoansPage";
import { LoanDetailPage } from "./pages/LoanDetailPage";
import { CashPage } from "./pages/CashPage";
import { LedgerPage } from "./pages/LedgerPage";
import { TrialBalancePage } from "./pages/TrialBalancePage";
import { IncomeStatementPage } from "./pages/IncomeStatementPage";
import { BalanceSheetPage } from "./pages/BalanceSheetPage";
import { AllowanceReportPage } from "./pages/AllowanceReportPage";
import { AllowanceSettingsPage } from "./pages/AllowanceSettingsPage";
import { DepositsPage } from "./pages/DepositsPage";
import { DepositAccountDetailPage } from "./pages/DepositAccountDetailPage";
import { DepositProductsSettingsPage } from "./pages/DepositProductsSettingsPage";
import { FiscalYearsPage } from "./pages/FiscalYearsPage";
import { FiscalYearDetailPage } from "./pages/FiscalYearDetailPage";
import { LoanProductsSettingsPage } from "./pages/LoanProductsSettingsPage";
import { DividendSettingsPage } from "./pages/DividendSettingsPage";
import { LoanLimitSettingsPage } from "./pages/LoanLimitSettingsPage";
import { ReceiptSettingsPage } from "./pages/ReceiptSettingsPage";
import { ReceiptPrintPage } from "./pages/ReceiptPrintPage";
import { MemberStatementPage } from "./pages/MemberStatementPage";
import { CdaDataPackPage } from "./pages/CdaDataPackPage";

// Staff and member logins are two entirely separate route trees, each
// behind its own guard that redirects the wrong role away before its
// layout (and therefore any staff page's component) ever renders — not
// just a nav link that happens to hide itself. The server's requireStaff
// gate (middleware/auth.ts) is the real enforcement; this is the client
// side of "members never even see a staff page," not a substitute for it.
function StaffArea() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "member") return <Navigate to="/portal" replace />;
  return <Layout />;
}

function MemberArea() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "member") return <Navigate to="/" replace />;
  // A staff-created or staff-reset password must be replaced before
  // anything else in the portal is reachable — rendered directly, not
  // as a child route, so no /portal/* path can bypass it.
  if (user.mustChangePassword) return <ChangePasswordPage forced />;
  return <PortalLayout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<MemberArea />}>
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/portal/change-password" element={<ChangePasswordPage />} />
            <Route path="/portal/statement" element={<MemberStatementPage />} />
          </Route>
          <Route element={<StaffArea />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MemberDetailPage />} />
            <Route path="/members/:id/statement" element={<MemberStatementPage />} />
            <Route path="/share-capital" element={<ShareCapitalPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/loans/:id" element={<LoanDetailPage />} />
            <Route path="/deposits" element={<DepositsPage />} />
            <Route path="/deposits/:id" element={<DepositAccountDetailPage />} />
            <Route path="/cash" element={<CashPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/trial-balance" element={<TrialBalancePage />} />
            <Route path="/income-statement" element={<IncomeStatementPage />} />
            <Route path="/balance-sheet" element={<BalanceSheetPage />} />
            <Route path="/fiscal-years" element={<FiscalYearsPage />} />
            <Route path="/fiscal-years/:id" element={<FiscalYearDetailPage />} />
            <Route path="/allowance-report" element={<AllowanceReportPage />} />
            <Route path="/cda-data-pack" element={<CdaDataPackPage />} />
            <Route path="/settings/allowance-rates" element={<AllowanceSettingsPage />} />
            <Route path="/settings/deposit-products" element={<DepositProductsSettingsPage />} />
            <Route path="/settings/loan-products" element={<LoanProductsSettingsPage />} />
            <Route path="/settings/dividend-rates" element={<DividendSettingsPage />} />
            <Route path="/settings/loan-limit" element={<LoanLimitSettingsPage />} />
            <Route path="/settings/receipt-label" element={<ReceiptSettingsPage />} />
            <Route path="/receipts/:id" element={<ReceiptPrintPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
