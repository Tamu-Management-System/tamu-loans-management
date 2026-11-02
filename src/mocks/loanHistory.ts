// Loans repaid in full before each borrower's current one. Filled in by the sample data generator
// (seed.ts), with their real schedules and payments.
import type { RepaymentSchedule } from "../api/types";

export interface MockPastLoan {
  id: string;
  borrowerId: string;
  product: string;
  productId: string;
  principal: number;
  totalRepayable: number;
  repaymentSchedule: RepaymentSchedule;
  /** ISO dates */
  disbursedOn: string;
  clearedOn: string;
  schedule: { firstPaymentOn: string; numberOfPayments: number; instalment: number };
  /** The most days any instalment was paid late */
  mostDaysLate: number;
}

export const pastLoans: MockPastLoan[] = [];
