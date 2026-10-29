import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
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
import { AllowanceReportPage } from "./pages/AllowanceReportPage";
import { AllowanceSettingsPage } from "./pages/AllowanceSettingsPage";
import { DepositsPage } from "./pages/DepositsPage";
import { DepositAccountDetailPage } from "./pages/DepositAccountDetailPage";
import { DepositProductsSettingsPage } from "./pages/DepositProductsSettingsPage";
import { FiscalYearsPage } from "./pages/FiscalYearsPage";
import { FiscalYearDetailPage } from "./pages/FiscalYearDetailPage";
import { LoanProductsSettingsPage } from "./pages/LoanProductsSettingsPage";

function ProtectedArea() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedArea />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MemberDetailPage />} />
            <Route path="/share-capital" element={<ShareCapitalPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/loans/:id" element={<LoanDetailPage />} />
            <Route path="/deposits" element={<DepositsPage />} />
            <Route path="/deposits/:id" element={<DepositAccountDetailPage />} />
            <Route path="/cash" element={<CashPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/trial-balance" element={<TrialBalancePage />} />
            <Route path="/income-statement" element={<IncomeStatementPage />} />
            <Route path="/fiscal-years" element={<FiscalYearsPage />} />
            <Route path="/fiscal-years/:id" element={<FiscalYearDetailPage />} />
            <Route path="/allowance-report" element={<AllowanceReportPage />} />
            <Route path="/settings/allowance-rates" element={<AllowanceSettingsPage />} />
            <Route path="/settings/deposit-products" element={<DepositProductsSettingsPage />} />
            <Route path="/settings/loan-products" element={<LoanProductsSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
