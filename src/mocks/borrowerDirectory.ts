// Borrowers: who they are and which officer looks after them. Filled in by the sample data
// generator (seed.ts); people registered in the demo are added as they're created.
import { loans } from "./fixtures";

export type MockBorrowerStatus = "active" | "in-arrears" | "cleared" | "applicant";

export interface MockBorrower {
  id: string;
  name: string;
  phone: string;
  /** Address: where they live */
  area: string;
  /** National ID number. Never sent in lists (see docs/security.md). */
  nin: string;
  officerId: string;
  /** ISO date */
  registeredOn: string;
  currentLoanId: string | null;
  applicationId: string | null;
  /** Loans repaid in full before the current one */
  clearedLoans: number;
  /** Registered during the demo: only real data, no sample documents */
  addedInSession?: boolean;
}

export const borrowers: MockBorrower[] = [];

export function borrowerStatus(borrower: MockBorrower): MockBorrowerStatus {
  if (borrower.currentLoanId) {
    const loan = loans.find((l) => l.id === borrower.currentLoanId);
    if (loan && loan.outstandingBalance <= 0) return "cleared"; // paid off in this session
    return loan && loan.daysPastDue > 0 ? "in-arrears" : "active";
  }
  return borrower.applicationId ? "applicant" : "cleared";
}

/** The next borrower number, e.g. "B-0207". */
export const nextBorrowerId = () => `B-${String(Math.max(0, ...borrowers.map((b) => Number(b.id.slice(2)))) + 1).padStart(4, "0")}`;
