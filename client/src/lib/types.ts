export type UserRole = "cashier" | "credit_officer" | "manager" | "accountant" | "admin" | "member";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  memberId?: string | null;
  mustChangePassword: boolean;
};

export type StaffRole = Exclude<UserRole, "member">;

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  createdAt: string;
};

export type MemberLoginStatus = "active" | "disabled";

export type MemberLogin = {
  id: string;
  email: string;
  status: MemberLoginStatus;
  createdAt: string;
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
  depositAccounts?: DepositAccount[];
  userAccount?: MemberLogin | null;
};

export type DividendEstimate =
  | { available: false; reason: string }
  | {
      available: true;
      asOf: string;
      fiscalYearId: string;
      netSurplusSoFar: number;
      estimatedShareCapitalInterest: number;
      estimatedPatronageRefund: number;
      estimatedTotal: number;
      isEstimate: true;
      assumptions: string;
    };

export type ShareCapitalTxnType = "subscription" | "additional_purchase" | "withdrawal" | "transfer" | "dividend";
export type ShareCapitalTxnStatus = "pending" | "approved" | "rejected" | "posted";

export type ReceiptStatus = "active" | "void";
export type ReceiptSourceType = "loan_repayment" | "deposit" | "share_capital";

export type Receipt = {
  id: string;
  sequenceNumber: number;
  documentLabel: string;
  sourceType: ReceiptSourceType;
  amount: string;
  status: ReceiptStatus;
  voidReason?: string | null;
  printCount: number;
  createdAt: string;
};

export type ReceiptPrintData = {
  id: string;
  sequenceNumber: number;
  documentLabel: string;
  status: ReceiptStatus;
  voidReason: string | null;
  isReprint: boolean;
  amount: number;
  date: string;
  memberName: string;
  memberNumber: string;
  particulars: string;
  receivedByName: string;
};

export type DisbursementVoucherStatus = "active" | "void";
export type DisbursementVoucherSourceType = "loan_release" | "deposit_withdrawal" | "share_capital_withdrawal";

export type DisbursementVoucher = {
  id: string;
  sequenceNumber: number;
  sourceType: DisbursementVoucherSourceType;
  amount: string;
  status: DisbursementVoucherStatus;
  voidReason?: string | null;
  printCount: number;
  createdAt: string;
};

export type DisbursementVoucherPrintData = {
  id: string;
  sequenceNumber: number;
  status: DisbursementVoucherStatus;
  voidReason: string | null;
  isReprint: boolean;
  amount: number;
  amountInWords: string;
  date: string;
  payeeName: string;
  memberNumber: string;
  purpose: string;
  accountEntries: { accountCode: string; accountLabel: string; debit: number; credit: number }[];
  preparedByName: string;
};

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
  receipt?: Receipt | null;
  disbursementVoucher?: DisbursementVoucher | null;
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
  type: "release" | "repayment" | "penalty" | "restructure" | "reclassify";
  amount: string;
  balanceAfter: string;
  createdById: string;
  createdAt: string;
  receipt?: Receipt | null;
  disbursementVoucher?: DisbursementVoucher | null;
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

export type LoanProduct = {
  id: string;
  name: string;
  description?: string | null;
  interestRate: string;
  ratePeriod: "monthly" | "annual";
  computationMethod: "diminishing_balance" | "flat";
  amortizationStyle: "equal_payment" | "equal_principal";
  isActive: boolean;
  createdAt: string;
};

export type LoanAccount = {
  id: string;
  memberId: string;
  loanProduct: string;
  principalAmount: string;
  interestRate: string;
  computationMethod: "diminishing_balance" | "flat";
  ratePeriod: "monthly" | "annual";
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

export type GlobalAuditLogEntry = AuditLogEntry & {
  entityType: string;
  entityId: string;
  performedById: string;
};

export type GlobalAuditLogPage = {
  total: number;
  page: number;
  pageSize: number;
  logs: GlobalAuditLogEntry[];
};

export type AuditLogFilterOptions = {
  users: { id: string; name: string }[];
  actions: string[];
};

export type DashboardSummary = {
  activeMembers: number;
  activeLoans: number;
  pastDueLoans: number;
  totalShareCapital: number;
  totalDeposits: number;
  cashPosition: number;
  fiscalYear: {
    id: string;
    yearEndDate: string;
    status: FiscalYearStatus;
    hasStatutoryAllocation: boolean;
    hasDividendDistribution: boolean;
  } | null;
};

export type AllowanceRateSetting = {
  id: string;
  bucketLabel: string;
  minDaysPastDue: number;
  maxDaysPastDue: number | null;
  ratePercent: string;
  sortOrder: number;
  updatedAt: string;
};

export type AllowanceReportRow = {
  loanId: string;
  memberName: string;
  loanProduct: string;
  outstandingBalance: number;
  daysPastDue: number;
  bucket: string;
  ratePercent: number;
  allowanceAmount: number;
};

export type AllowanceReport = {
  rows: AllowanceReportRow[];
  totalAllowance: number;
};

export type LoanDisclosure = {
  loanId: string;
  memberName: string;
  loanProduct: string;
  computationMethod: "diminishing_balance" | "flat";
  ratePeriod: "monthly" | "annual";
  principalAmount: number;
  termMonths: number;
  totalInterest: number;
  amountFinanced: number;
  totalOfPayments: number;
  effectiveInterestRatePercent: number;
  isNominalRateOnly: boolean;
  feesNote: string;
};

export type FiscalYearStatus = "open" | "closed";

export type StatutoryFundAllocation = {
  id: string;
  fiscalYearId: string;
  reserveFundPercent: string;
  cetfPercent: string;
  communityDevFundPercent: string;
  optionalFundPercent: string;
  netSurplus: string;
  createdAt: string;
};

export type DividendDistribution = {
  id: string;
  fiscalYearId: string;
  shareCapitalInterestPercent: string;
  patronageRefundPercent: string;
  shareCapitalInterestAmount: string;
  patronageRefundAmount: string;
  memberCount: number;
  createdAt: string;
};

export type DividendDistributionSetting = {
  id: string;
  shareCapitalInterestPercent: string;
  patronageRefundPercent: string;
  updatedAt: string;
};

export type LoanLimitSetting = {
  id: string;
  shareCapitalMultiplier: string;
  updatedAt: string;
};

export type ReceiptSetting = {
  id: string;
  documentLabel: string;
  updatedAt: string;
};

export type LoanLimit = {
  memberId: string;
  shareCapitalBalance: number;
  shareCapitalMultiplier: number;
  grossLimit: number;
  outstandingLoanBalance: number;
  loanableAmount: number;
  isPlaceholder: boolean;
};

export type FiscalYear = {
  id: string;
  yearEndDate: string;
  status: FiscalYearStatus;
  createdAt: string;
  statutoryFundAllocation?: StatutoryFundAllocation | null;
  dividendDistribution?: DividendDistribution | null;
  periodStart?: string | null;
};

export type FiscalYearCloseResult = {
  fiscalYear: FiscalYear;
  allocated: boolean;
  netSurplus: number;
  message?: string;
  allocation?: StatutoryFundAllocation;
  reserveAmount?: number;
  cetfAmount?: number;
  communityDevAmount?: number;
  optionalAmount?: number;
  unallocatedRemainder?: number;
};

export type DividendDistributeResult = {
  distributed: boolean;
  message?: string;
  distribution?: DividendDistribution;
  shareCapitalInterestAmount?: number;
  patronageRefundAmount?: number;
  memberCount?: number;
  unallocatedRemainder: number;
};

export type IncomeStatementRow = {
  accountCode: string;
  accountLabel: string;
  element: "revenue" | "expense";
  amount: number;
};

export type IncomeStatement = {
  fromDate: string | null;
  toDate: string | null;
  revenueRows: IncomeStatementRow[];
  expenseRows: IncomeStatementRow[];
  totalRevenue: number;
  totalExpense: number;
  netSurplus: number;
};

export type BalanceSheetRow = {
  accountCode: string;
  accountLabel: string;
  element: "asset" | "liability" | "equity";
  isContra: boolean;
  amount: number;
};

export type BalanceSheet = {
  asOf: string;
  assetRows: BalanceSheetRow[];
  liabilityRows: BalanceSheetRow[];
  equityRows: BalanceSheetRow[];
  unclosedNetSurplus: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
};

export type DepositType = "savings" | "time";
export type DepositComputationBasis =
  | "daily_balance"
  | "average_daily_balance"
  | "lowest_monthly_balance"
  | "month_end_balance";
export type DepositAccountStatus = "active" | "closed";
export type DepositTxnType = "deposit" | "withdrawal" | "interest_credit" | "pretermination_penalty";

export type DepositProduct = {
  id: string;
  name: string;
  type: DepositType;
  interestRate: string;
  computationBasis: DepositComputationBasis;
  creditingFrequencyMonths: number;
  minimumBalance: string;
  termMonths: number | null;
  preTerminationPenaltyRate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type DepositTransaction = {
  id: string;
  depositAccountId: string;
  type: DepositTxnType;
  amount: string;
  balanceAfter: string;
  createdById: string;
  createdAt: string;
  receipt?: Receipt | null;
  disbursementVoucher?: DisbursementVoucher | null;
};

export type DepositAccount = {
  id: string;
  memberId: string;
  depositProductId: string;
  balance: string;
  status: DepositAccountStatus;
  openedAt: string;
  closedAt: string | null;
  member?: Member;
  depositProduct?: DepositProduct;
  transactions?: DepositTransaction[];
};

export type MemberStatement = {
  generatedAt: string;
  member: {
    id: string;
    memberNumber: string;
    fullName: string;
    status: MemberStatus;
    dateJoined: string;
  };
  shareCapital: {
    balance: number;
    transactions: { id: string; type: ShareCapitalTxnType; amount: number; createdAt: string }[];
  } | null;
  loans: {
    id: string;
    loanProduct: string;
    principalAmount: number;
    status: LoanStatus;
    transactions: {
      id: string;
      type: "release" | "repayment" | "penalty" | "restructure" | "reclassify";
      amount: number;
      balanceAfter: number;
      createdAt: string;
    }[];
  }[];
  deposits: {
    id: string;
    productName: string;
    balance: number;
    status: DepositAccountStatus;
    transactions: { id: string; type: DepositTxnType; amount: number; balanceAfter: number; createdAt: string }[];
  }[];
};

export type EquityChangeRow = {
  accountCode: string;
  accountLabel: string;
  isContra: boolean;
  beginningBalance: number;
  netChange: number;
  endingBalance: number;
};

export type StatementOfChangesInEquity = {
  periodStart: string | null;
  periodEnd: string;
  rows: EquityChangeRow[];
  totalBeginning: number;
  totalNetChange: number;
  totalEnding: number;
};

export type CashFlowRow = {
  category: "operating" | "investing" | "financing";
  label: string;
  amount: number;
};

export type StatementOfCashFlows = {
  periodStart: string | null;
  periodEnd: string;
  operatingRows: CashFlowRow[];
  investingRows: CashFlowRow[];
  financingRows: CashFlowRow[];
  netOperating: number;
  netInvesting: number;
  netFinancing: number;
  totalNetChange: number;
  cashBeginning: number;
  cashEnding: number;
  balanced: boolean;
};

export type CdaDataPack = {
  isUnaudited: true;
  isPreliminary: boolean;
  fiscalYear: {
    id: string;
    yearEndDate: string;
    status: FiscalYearStatus;
    periodStart: string | null;
    reportAsOf: string;
  };
  generatedAt: string;
  balanceSheet: BalanceSheet;
  incomeStatement: IncomeStatement;
  equityStatement: StatementOfChangesInEquity;
  cashFlowStatement: StatementOfCashFlows;
  trialBalance: { asOf: string; rows: TrialBalanceRow[]; totals: { totalDebit: number; totalCredit: number }; balanced: boolean };
  statutoryFundAllocation: StatutoryFundAllocation | null;
  dividendDistribution: DividendDistribution | null;
  membership: {
    newMembersDuringPeriod: number;
    totalMembersCurrent: number;
    currentCountsByStatus: Record<string, number>;
    currentCountsByClass: Record<string, number>;
  };
  shareCapital: {
    totalPaidUpAtYearEnd: number;
    subscriptionsDuringPeriod: number;
    withdrawalsDuringPeriod: number;
    perMemberBalancesAtYearEnd: { memberId: string; memberNumber: string; fullName: string; balance: number }[];
  };
  loans: {
    releasedDuringPeriod: number;
    collectedDuringPeriod: number;
    outstandingPortfolioAtYearEnd: number;
    currentStatusBreakdown: { status: string; count: number }[];
    allowanceForProbableLossesAtYearEnd: number;
  };
  deposits: {
    depositsDuringPeriod: number;
    withdrawalsDuringPeriod: number;
    endingBalancesByProduct: { accountCode: string; label: string; amount: number }[];
  };
};
