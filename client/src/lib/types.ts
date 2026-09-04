export type UserRole = "cashier" | "credit_officer" | "manager" | "accountant" | "admin";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type MemberStatus = "active" | "inactive" | "resigned" | "deceased" | "terminated";

export type Member = {
  id: string;
  memberNumber: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dateJoined: string;
  status: MemberStatus;
  beneficiaryName?: string | null;
  beneficiaryRelationship?: string | null;
  createdAt: string;
  shareCapitalAccount?: { id: string; balance: string } | null;
  loanAccounts?: LoanAccount[];
};

export type ShareCapitalTxnType = "subscription" | "additional_purchase" | "withdrawal" | "transfer" | "dividend";
export type ShareCapitalTxnStatus = "pending" | "approved" | "rejected" | "posted";

export type ShareCapitalTransaction = {
  id: string;
  shareCapitalAccountId: string;
  type: ShareCapitalTxnType;
  amount: string;
  status: ShareCapitalTxnStatus;
  createdById: string;
  approvedById?: string | null;
  createdAt: string;
  approvedAt?: string | null;
  account?: { member: Member };
};

export type LoanStatus =
  | "applied"
  | "under_review"
  | "approved"
  | "released"
  | "active"
  | "past_due"
  | "restructured"
  | "closed"
  | "rejected";

export type LoanTransaction = {
  id: string;
  loanAccountId: string;
  type: "release" | "repayment" | "penalty" | "restructure";
  amount: string;
  balanceAfter: string;
  createdById: string;
  createdAt: string;
};

export type LoanAging = {
  daysPastDue: number;
  nextDueDate: string | null;
  totalDue: number;
  outstandingBalance: number;
};

export type Installment = {
  installmentNumber: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
};

export type LoanAccount = {
  id: string;
  memberId: string;
  loanProduct: string;
  principalAmount: string;
  interestRate: string;
  termMonths: number;
  status: LoanStatus;
  reviewNotes?: string | null;
  releaseDate?: string | null;
  createdAt: string;
  member?: Member;
  transactions?: LoanTransaction[];
  aging?: LoanAging | null;
  schedule?: Installment[];
};

export type CashTxnType = "collection" | "disbursement" | "petty_cash" | "cash_advance" | "bank_deposit";

export type CashTransaction = {
  id: string;
  type: CashTxnType;
  amount: string;
  referenceType?: string | null;
  officialReceiptNumber: string;
  createdById: string;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  entryDate: string;
  accountCode: string;
  accountLabel: string;
  debit: string;
  credit: string;
  sourceType: string;
  memo?: string | null;
  batchId: string;
};

export type TrialBalanceRow = {
  accountCode: string;
  accountLabel: string;
  totalDebit: number;
  totalCredit: number;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  performedByName: string;
  performedAt: string;
  previousValue: unknown;
  newValue: unknown;
  description: string;
};

export type DashboardSummary = {
  activeMembers: number;
  activeLoans: number;
  pastDueLoans: number;
  totalShareCapital: number;
  cashPosition: number;
};
