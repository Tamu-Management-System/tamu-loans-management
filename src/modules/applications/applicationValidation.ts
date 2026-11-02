import { normalisePhone } from "../../lib/phone";

/** Ugandan National ID number (NIN): 14 characters, starting CM or CF. */
const NATIONAL_ID = /^C[MF][A-Z0-9]{12}$/;

export const normaliseNationalId = (value: string) => value.replace(/\s+/g, "").toUpperCase();

export interface PersonDraft {
  fullName: string;
  nationalId: string;
  phone: string;
}

export interface BorrowerDraft extends PersonDraft {
  premises: string;
  area: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function personErrors(person: PersonDraft): FieldErrors<PersonDraft> {
  const errors: FieldErrors<PersonDraft> = {};
  if (person.fullName.trim().split(/\s+/).filter(Boolean).length < 2) errors.fullName = "Enter the full name, as on the National ID.";
  if (!NATIONAL_ID.test(normaliseNationalId(person.nationalId))) errors.nationalId = "Enter the 14-character NIN from the National ID, e.g. CM1234567890AB.";
  if (!normalisePhone(person.phone)) errors.phone = "Enter a mobile number, e.g. 0772 418 230.";
  return errors;
}

export function borrowerErrors(borrower: BorrowerDraft): FieldErrors<BorrowerDraft> {
  const errors: FieldErrors<BorrowerDraft> = personErrors(borrower);
  if (!borrower.premises.trim()) errors.premises = "Enter your shop, premises, building or arcade.";
  if (!borrower.area.trim()) errors.area = "Enter your area.";
  return errors;
}

/** A guarantor can't be the borrower or the other guarantor. */
export function sameAsError(nationalId: string, others: { nationalId: string; who: string }[]) {
  const id = normaliseNationalId(nationalId);
  const match = others.find((other) => id && normaliseNationalId(other.nationalId) === id);
  return match ? `This is the same NIN as ${match.who}. A guarantor must be a different person.` : undefined;
}
