/** "0772418230" or "+256 772 418 230" -> "0772 418 230"; null if it isn't a Ugandan mobile number. */
export function normalisePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("256")) digits = `0${digits.slice(3)}`;
  return /^07\d{8}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : null;
}
