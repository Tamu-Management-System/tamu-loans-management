// The range each number in Settings must stay within. The screens and the API (docs/api-contract.md) use the same limits.
export const SETTING_LIMITS = {
  recoveryAfterDaysLate: [7, 365],
  seriouslyLateDays: [1, 180],
  backdateDays: [0, 30],
  idleTimeoutMinutes: [5, 60],
  nationalIdVisibleSeconds: [10, 120],
  inviteValidHours: [1, 168],
  maxFailedSignIns: [3, 10],
  lockoutMinutes: [5, 120],
  minPasswordLength: [10, 64],
} as const;

