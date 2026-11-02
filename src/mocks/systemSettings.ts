// System settings and loan products for the mock API. Admins change these in Settings; the app
// and the mock API both follow them, so nothing an admin can change is hard-coded elsewhere.
import type { LoanPricing, LoanProduct, SystemSettings } from "../api/types";
export { SETTING_LIMITS } from "../lib/settingLimits";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const systemSettings: SystemSettings = {
  business: {
    name: "Tamu Cleaning Services Ltd",
    shortName: "Tamu",
    address: "Plot 14, Ntinda Road, Kampala",
    phone: "0414 530 220",
    email: "loans@tamu.example",
    payoutAccounts: [
      { method: "MTN MoMo", number: "0772 900 410", accountName: "Tamu Cleaning Services" },
      { method: "Airtel Money", number: "0752 900 410", accountName: "Tamu Cleaning Services" },
    ],
    branches: ["Kampala Central", "Mbarara"],
  },
  loanRules: {
    approverCannotDisburse: true,
    creatorCannotApprove: true,
    phoneChangeNeedsApproval: true,
    oneOpenLoanPerBorrower: true,
    recoveryAfterDaysLate: 60,
    recoveryMode: "suggest",
    seriouslyLateDays: 30,
  },
  payments: {
    repaymentMethods: ["Cash", "MTN MoMo", "Airtel Money"],
    payoutMethods: ["MTN MoMo", "Airtel Money"],
    referenceRequired: true,
    backdateDays: 3,
    allowOverpayment: true,
  },
  security: {
    idleTimeoutMinutes: 15,
    nationalIdVisibleSeconds: 30,
    inviteValidHours: 48,
    maxFailedSignIns: 5,
    lockoutMinutes: 15,
    minPasswordLength: 12,
  },
  changed: {
    business: { at: daysAgo(12), by: "Martin Ssempa" },
    loanRules: { at: daysAgo(4), by: "Martin Ssempa" },
    payments: null,
    security: null,
  },
};

const product = (fields: Omit<LoanProduct, "updatedAt" | "updatedBy" | "inUse"> & { updatedDaysAgo: number }): LoanProduct => {
  const { updatedDaysAgo, ...rest } = fields;
  return { ...rest, inUse: 0, updatedAt: daysAgo(updatedDaysAgo), updatedBy: "Martin Ssempa" };
};

export const loanProducts: LoanProduct[] = [
  product({
    id: "prod-daily",
    name: "Daily loan",
    description: "Small loans for market traders, repaid every day.",
    status: "active",
    repaymentSchedule: "daily",
    interest: { ratePercent: 0.6, per: "day" },
    amount: { min: 100_000, max: 2_000_000 },
    numberOfPayments: 30,
    fee: { type: "none", value: 0, collection: "added" },
    penalty: { type: "percent", value: 1, per: "day", graceDays: 2 },
    updatedDaysAgo: 30,
  }),
  product({
    id: "prod-weekly",
    name: "Weekly loan",
    description: "The most common loan, repaid every week.",
    status: "active",
    repaymentSchedule: "weekly",
    interest: { ratePercent: 4.5, per: "week" },
    amount: { min: 100_000, max: 5_000_000 },
    numberOfPayments: 4,
    fee: { type: "none", value: 0, collection: "added" },
    penalty: { type: "percent", value: 5, per: "missed-payment", graceDays: 3 },
    updatedDaysAgo: 30,
  }),
  product({
    id: "prod-monthly",
    name: "Monthly loan",
    description: "Bigger loans for salaried staff, repaid every month.",
    status: "active",
    repaymentSchedule: "monthly",
    interest: { ratePercent: 18, per: "month" },
    amount: { min: 100_000, max: 10_000_000 },
    numberOfPayments: 1,
    fee: { type: "none", value: 0, collection: "added" },
    penalty: { type: "percent", value: 5, per: "missed-payment", graceDays: 5 },
    updatedDaysAgo: 30,
  }),
  product({
    id: "prod-school",
    name: "School fees loan",
    description: "Seasonal loan for school fees; no longer offered.",
    status: "archived",
    repaymentSchedule: "monthly",
    interest: { ratePercent: 4, per: "month" },
    amount: { min: 100_000, max: 3_000_000 },
    numberOfPayments: 1,
    fee: { type: "none", value: 0, collection: "added" },
    penalty: { type: "fixed", value: 10_000, per: "missed-payment", graceDays: 3 },
    updatedDaysAgo: 120,
  }),
];

export const findProduct = (id: string | null | undefined) => loanProducts.find((p) => p.id === id);

/** The product a loan made before products existed counts as (by how often it's repaid) */
export const productForSchedule = (schedule: LoanProduct["repaymentSchedule"]) => loanProducts.find((p) => p.status === "active" && p.repaymentSchedule === schedule) ?? loanProducts[0];

/** The pricing copied onto an application from its product */
export const pricingOf = (p: LoanProduct): LoanPricing => ({ productName: p.name, interestRatePercent: p.interest.ratePercent, interestPer: p.interest.per, fee: { ...p.fee } });
