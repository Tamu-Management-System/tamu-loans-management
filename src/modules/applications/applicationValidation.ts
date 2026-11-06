import { normalisePhone } from "../../lib/phone";

/** Ugandan National ID number (NIN): 14 characters, starting CM or CF. */
const NATIONAL_ID = /^C[MF][A-Z0-9]{12}$/;

export const normaliseNationalId = (value: string) => value.replace(/\s+/g, "").toUpperCase();

export interface PersonDraft {
  fullName: string;
  nationalId: string;
  phone: string;
}

/** A guarantor: the person's details plus how they know the client */
export interface GuarantorDraft extends PersonDraft {
  relationship: string;
}

export type Gender = "female" | "male";

/** A new client, as on the payment agreement and the client's data list */
export interface BorrowerDraft extends PersonDraft {
  gender: Gender | "";
  /** Optional alternative contact */
  secondaryPhone: string;
  premises: string;
  occupation: string;
  /** Where they live (the API calls it `area`) */
  area: string;
  kinName: string;
  kinPhone: string;
}

export const EMPTY_PERSON: PersonDraft = { fullName: "", nationalId: "", phone: "" };
export const EMPTY_GUARANTOR: GuarantorDraft = { ...EMPTY_PERSON, relationship: "" };
export const EMPTY_BORROWER: BorrowerDraft = { ...EMPTY_PERSON, gender: "", secondaryPhone: "", premises: "", occupation: "", area: "", kinName: "", kinPhone: "" };

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
  if (!borrower.gender) errors.gender = "Choose female or male.";
  if (borrower.secondaryPhone.trim() && !normalisePhone(borrower.secondaryPhone)) errors.secondaryPhone = "Enter a mobile number, or leave it empty.";
  else if (borrower.secondaryPhone.trim() && normalisePhone(borrower.secondaryPhone) === normalisePhone(borrower.phone)) errors.secondaryPhone = "Use a different number from the main one, or leave it empty.";
  if (!borrower.premises.trim()) errors.premises = "Enter the shop, premises, building or arcade.";
  if (!borrower.area.trim()) errors.area = "Enter the address.";
  // Next of kin is optional; a number, if given, must be valid and not the client's own
  if (borrower.kinPhone.trim() && !normalisePhone(borrower.kinPhone)) errors.kinPhone = "Enter a mobile number, or leave it empty.";
  else if (borrower.kinPhone.trim() && normalisePhone(borrower.kinPhone) === normalisePhone(borrower.phone)) errors.kinPhone = "Use the next of kin's own number, not the client's.";
  return errors;
}

/** Online form: the person's details plus how they know the client */
export function guarantorErrors(guarantor: GuarantorDraft): FieldErrors<GuarantorDraft> {
  const errors: FieldErrors<GuarantorDraft> = personErrors(guarantor);
  if (!guarantor.relationship.trim()) errors.relationship = "Say how they know the client, e.g. sister, friend, landlord.";
  return errors;
}

/** A guarantor can't be the client or the other guarantor. */
export function sameAsError(nationalId: string, others: { nationalId: string; who: string }[]) {
  const id = normaliseNationalId(nationalId);
  const match = others.find((other) => id && normaliseNationalId(other.nationalId) === id);
  return match ? `This is the same NIN as ${match.who}. A guarantor must be a different person.` : undefined;
}
