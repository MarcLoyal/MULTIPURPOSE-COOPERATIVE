import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ModuleSettingsProvider } from "./context/ModuleSettingsContext";
import { ModuleGate } from "./components/ModuleGate";
import { Layout } from "./components/Layout";
import { PortalLayout } from "./components/PortalLayout";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
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
import { CashFlowStatementPage } from "./pages/CashFlowStatementPage";
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
import { StaffUsersPage } from "./pages/StaffUsersPage";
import { ReceiptPrintPage } from "./pages/ReceiptPrintPage";
import { DisbursementVoucherPrintPage } from "./pages/DisbursementVoucherPrintPage";
import { MemberStatementPage } from "./pages/MemberStatementPage";
import { CdaDataPackPage } from "./pages/CdaDataPackPage";
import { OpeningBalancesImportPage } from "./pages/OpeningBalancesImportPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { ModuleSettingsPage } from "./pages/ModuleSettingsPage";

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
        <ModuleSettingsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
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
              <Route
                path="/share-capital"
                element={
                  <ModuleGate moduleKey="shareCapital">
                    <ShareCapitalPage />
                  </ModuleGate>
                }
              />
              <Route path="/loans" element={<LoansPage />} />
              <Route path="/loans/:id" element={<LoanDetailPage />} />
              <Route
                path="/deposits"
                element={
                  <ModuleGate moduleKey="deposits">
                    <DepositsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/deposits/:id"
                element={
                  <ModuleGate moduleKey="deposits">
                    <DepositAccountDetailPage />
                  </ModuleGate>
                }
              />
              <Route path="/cash" element={<CashPage />} />
              <Route
                path="/ledger"
                element={
                  <ModuleGate moduleKey="generalLedger">
                    <LedgerPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/trial-balance"
                element={
                  <ModuleGate moduleKey="trialBalance">
                    <TrialBalancePage />
                  </ModuleGate>
                }
              />
              <Route
                path="/income-statement"
                element={
                  <ModuleGate moduleKey="incomeStatement">
                    <IncomeStatementPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/balance-sheet"
                element={
                  <ModuleGate moduleKey="balanceSheet">
                    <BalanceSheetPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/cash-flow-statement"
                element={
                  <ModuleGate moduleKey="cashFlowStatement">
                    <CashFlowStatementPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/fiscal-years"
                element={
                  <ModuleGate moduleKey="fiscalYears">
                    <FiscalYearsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/fiscal-years/:id"
                element={
                  <ModuleGate moduleKey="fiscalYears">
                    <FiscalYearDetailPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/allowance-report"
                element={
                  <ModuleGate moduleKey="allowanceReport">
                    <AllowanceReportPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/cda-data-pack"
                element={
                  <ModuleGate moduleKey="cdaDataPack">
                    <CdaDataPackPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/allowance-rates"
                element={
                  <ModuleGate moduleKey="advanced">
                    <AllowanceSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/deposit-products"
                element={
                  <ModuleGate moduleKey="advanced">
                    <DepositProductsSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/loan-products"
                element={
                  <ModuleGate moduleKey="advanced">
                    <LoanProductsSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/dividend-rates"
                element={
                  <ModuleGate moduleKey="advanced">
                    <DividendSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/loan-limit"
                element={
                  <ModuleGate moduleKey="advanced">
                    <LoanLimitSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/receipt-label"
                element={
                  <ModuleGate moduleKey="advanced">
                    <ReceiptSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/staff-users"
                element={
                  <ModuleGate moduleKey="advanced">
                    <StaffUsersPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/opening-balances-import"
                element={
                  <ModuleGate moduleKey="advanced">
                    <OpeningBalancesImportPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/settings/modules"
                element={
                  <ModuleGate moduleKey="advanced">
                    <ModuleSettingsPage />
                  </ModuleGate>
                }
              />
              <Route
                path="/audit-log"
                element={
                  <ModuleGate moduleKey="advanced">
                    <AuditLogPage />
                  </ModuleGate>
                }
              />
              <Route path="/receipts/:id" element={<ReceiptPrintPage />} />
              <Route path="/disbursement-vouchers/:id" element={<DisbursementVoucherPrintPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ModuleSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
