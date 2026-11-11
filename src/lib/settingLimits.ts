// The range each number in Settings must stay within. The screens and the API (docs/api-contract.md) use the same limits.
export const SETTING_LIMITS = {
  recoveryAfterDaysLate: [7, 365],
  seriouslyLateDays: [1, 180],
  par30TargetPercent: [1, 30],
  earlyWarningDays: [1, 60],
  onlineLinkValidHours: [1, 168],
  guarantorMaxActiveLoans: [1, 5],
  firstPaymentWithinDays: [1, 120],
  approvalWaitingWarnHours: [1, 168],
  disbursementWaitingWarnDays: [1, 30],
  promiseToPayDays: [0, 30],
  reminderDaysBefore: [0, 14],
  backdateDays: [0, 30],
  editWindowHours: [0, 168],
  idleTimeoutMinutes: [5, 60],
  nationalIdVisibleSeconds: [10, 120],
  inviteValidHours: [1, 168],
  maxFailedSignIns: [3, 10],
  lockoutMinutes: [5, 120],
  minPasswordLength: [10, 64],
} as const;

