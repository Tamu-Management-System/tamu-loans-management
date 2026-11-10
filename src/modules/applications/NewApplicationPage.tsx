import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useCreateApplication, useGuarantorCheck, useUpdateApplication } from "../../api/applications";
import { useBorrowerList, useBorrowerProfile } from "../../api/borrowers";
import { ApiError } from "../../api/client";
import type { ApplicationDraft, BorrowerStatus, DocumentFile, GuarantorDetails, LoanProduct, NewApplicationResult, NewBorrowerDetails, RepaymentSchedule } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { formatLongDate, formatUGX, toDateInputValue } from "../../lib/format";
import { normalisePhone } from "../../lib/phone";
import { describeInterest, describeLength, summariseTerms } from "../../lib/repaymentSchedule";
import { useLoanProducts, useSystemSettings } from "../../api/settings";
import { BorrowerStatusChip } from "../borrowers/BorrowerStatusChip";
import { describeFile } from "../borrowers/documents/documentFormat";
import { BorrowerExtraFields, PersonFields, TextField } from "./ApplicationFields";
import {
  borrowerErrors,
  EMPTY_BORROWER,
  EMPTY_GUARANTOR,
  normaliseNationalId,
  personErrors,
  sameAsError,
  type BorrowerDraft,
  type FieldErrors,
  type GuarantorDraft,
  type PersonDraft,
} from "./applicationValidation";
import styles from "./NewApplication.module.css";

type Route = "paper" | "online";
type StepId = "borrower" | "terms" | "route" | "details" | "guarantors" | "signed" | "review";
const STEP_LABELS: Record<StepId, string> = {
  borrower: "Client",
  terms: "Loan terms",
  route: "Paper or online",
  details: "Client details",
  guarantors: "Guarantors",
  signed: "Signed forms",
  review: "Review",
};
const PAPER_STEPS: StepId[] = ["borrower", "terms", "route", "details", "guarantors", "signed", "review"];
const ONLINE_STEPS: StepId[] = ["borrower", "terms", "route"];
/** Continuing a paper draft: the client and the route are already set */
const EDIT_STEPS: StepId[] = ["terms", "details", "guarantors", "signed", "review"];
const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** A client chosen in step 1, or someone new. */
type Chosen = { kind: "existing"; id: string; name: string; phone: string; area: string; status: BorrowerStatus } | { kind: "new" };

/** Why an existing client can't start a new application, or null. */
function blockedReason(borrower: { name: string; status: BorrowerStatus; currentLoanId?: string | null; applicationId?: string | null; applicationStatus?: string }, oneLoanAtATime = true) {
  if (oneLoanAtATime && (borrower.status === "active" || borrower.status === "in-arrears")) return `Still repaying ${borrower.currentLoanId ?? "a loan"}. A new loan can start once it's cleared.`;
  if (borrower.status === "applicant" && borrower.applicationStatus !== "rejected") return `Application ${borrower.applicationId ?? ""} is already in progress.`.replace("  ", " ");
  return null;
}

/** The earliest first payment: the day the application is made. */
const todayDate = () => toDateInputValue(new Date());

/** The draft's guarantors, padded to two. */
const draftGuarantors = (draft: ApplicationDraft): [GuarantorDraft, GuarantorDraft] => [{ ...EMPTY_GUARANTOR, ...draft.guarantors[0] }, { ...EMPTY_GUARANTOR, ...draft.guarantors[1] }];

/** The first payment date that suits the frequency (tomorrow, in a week, or in a month), within the product's window. */
function defaultFirstPayment(schedule: RepaymentSchedule, withinDays?: number) {
  const date = new Date();
  if (schedule === "daily") date.setDate(date.getDate() + 1);
  else if (schedule === "weekly") date.setDate(date.getDate() + 7);
  else date.setMonth(date.getMonth() + 1);
  if (withinDays === undefined) return toDateInputValue(date);
  const latest = new Date();
  latest.setDate(latest.getDate() + withinDays);
  return toDateInputValue(date > latest ? latest : date);
}

/** The latest first payment, from the window in Settings → Loan rules; undefined until settings have loaded. */
const latestFirstPayment = (withinDays: number | undefined) => {
  if (withinDays === undefined) return undefined;
  const date = new Date();
  date.setDate(date.getDate() + withinDays);
  return toDateInputValue(date);
};

const pricingOf = (product: LoanProduct) => ({ productName: product.name, interestRatePercent: product.interest.ratePercent, interestPer: product.interest.per, fee: product.fee });

/**
 * New application (user flow, phase 3). The officer finds the client (or starts with someone
 * new), sets the loan terms, and chooses how the forms are completed:
 * - paper: they type in the details from the signed forms and upload the forms as one PDF;
 * - online: the client fills in everything and the three people tick a box to agree, through a link the officer sends.
 */
export function NewApplicationPage({ draft }: { draft?: ApplicationDraft } = {}) {
  const navigate = useNavigate();
  const showToast = useToast();
  const [searchParams] = useSearchParams();
  const presetBorrowerId = searchParams.get("borrowerId");
  const create = useCreateApplication();
  const update = useUpdateApplication(draft?.id ?? "");
  const saving = create.isPending || update.isPending;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Continuing a draft starts from what was saved (a first payment date now in the past is moved on)
  const [step, setStep] = useState<StepId>(draft ? "terms" : "borrower");
  const [chosen, setChosen] = useState<Chosen | null>(draft ? { kind: "existing", id: draft.borrower.id, name: draft.borrower.name, phone: draft.borrower.phone, area: draft.borrower.area, status: "applicant" } : null);
  const [amount, setAmount] = useState(draft ? String(draft.terms.amount) : "");
  // Loan products (Settings): what's on offer, plus a draft's own product even if it's since been withdrawn
  const { data: allProducts } = useLoanProducts();
  const loanRules = useSystemSettings().data?.loanRules;
  const oneLoanAtATime = loanRules?.oneOpenLoanPerBorrower ?? true;
  const purposes = loanRules?.loanPurposes ?? [];
  const [purpose, setPurpose] = useState(draft?.terms.purpose ?? "");
  const [productId, setProductId] = useState<string | null>(draft?.terms.productId ?? null);
  const products = (allProducts ?? []).filter((p) => p.status === "active" || p.id === draft?.terms.productId);
  const product = products.find((p) => p.id === productId);
  const schedule: RepaymentSchedule = product?.repaymentSchedule ?? draft?.terms.repaymentSchedule ?? "weekly";
  const [firstPaymentOn, setFirstPaymentOn] = useState(
    draft && draft.terms.firstPaymentOn >= todayDate() ? draft.terms.firstPaymentOn : defaultFirstPayment(draft?.terms.repaymentSchedule ?? "weekly", loanRules?.firstPaymentWithinDays[draft?.terms.repaymentSchedule ?? "weekly"]),
  );
  const [firstPaymentEdited, setFirstPaymentEdited] = useState(!!draft);
  const [route, setRoute] = useState<Route | null>(draft ? "paper" : null);
  const [newBorrower, setNewBorrower] = useState<BorrowerDraft>(EMPTY_BORROWER);
  const [guarantors, setGuarantors] = useState<[GuarantorDraft, GuarantorDraft]>(draft ? draftGuarantors(draft) : [{ ...EMPTY_GUARANTOR }, { ...EMPTY_GUARANTOR }]);
  const [signedPdf, setSignedPdf] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<NewApplicationResult | null>(null);

  // Started from a client's "New loan": skip the search
  const preset = useBorrowerProfile(presetBorrowerId ?? "");
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !preset.data) return;
    presetApplied.current = true;
    const b = preset.data;
    if (!blockedReason({ name: b.name, status: b.status, currentLoanId: b.currentLoan?.id, applicationId: b.application?.id, applicationStatus: b.application?.status }, oneLoanAtATime)) {
      setChosen({ kind: "existing", id: b.id, name: b.name, phone: b.phone, area: b.area, status: b.status });
      setStep("terms");
    }
  }, [preset.data, oneLoanAtATime]);

  // The chosen client's profile (premises, masked NIN) for the paper route
  const chosenProfile = useBorrowerProfile(chosen?.kind === "existing" ? chosen.id : "");

  // Nothing is saved until the officer saves a draft or submits
  const dirty = (!!chosen || !!draft) && !result;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ----- Terms -----
  const amountValue = Number(amount.replace(/\D/g, "")) || 0;
  const earliest = todayDate();
  const termErrors: { product?: string; amount?: string; purpose?: string; firstPaymentOn?: string } = {};
  // The product sets how long the loan runs
  const paymentsValue = product?.numberOfPayments ?? 0;
  const latest = latestFirstPayment(product ? loanRules?.firstPaymentWithinDays[product.repaymentSchedule] : undefined);
  if (!product) termErrors.product = "Choose a loan product.";
  if (!purposes.includes(purpose)) termErrors.purpose = "Choose what the loan is for.";
  if (amountValue <= 0) termErrors.amount = "Enter the amount to lend.";
  else if (product && (amountValue < product.amount.min || amountValue > product.amount.max)) termErrors.amount = `${product.name}: ${formatUGX(product.amount.min)} to ${formatUGX(product.amount.max)}.`;
  if (!firstPaymentOn || firstPaymentOn < earliest) termErrors.firstPaymentOn = "Choose today or a later date.";
  else if (latest && firstPaymentOn > latest) termErrors.firstPaymentOn = `${product!.name}: the first payment must be by ${formatLongDate(latest)}.`;
  const termsValid = Object.keys(termErrors).length === 0;
  const pricing = product ? pricingOf(product) : undefined;
  const summary = termsValid && pricing ? summariseTerms({ amount: amountValue, repaymentSchedule: schedule, firstPaymentOn, numberOfPayments: paymentsValue, pricing }) : null;

  // ----- Paper route checks -----
  const isNew = chosen?.kind === "new";
  const detailErrors: FieldErrors<BorrowerDraft> = isNew ? borrowerErrors(newBorrower) : {};
  const guarantorFieldErrors = guarantors.map((guarantor, index) => {
    // Paper route: the relationship is on the signed consent, so officers don't type it
    const errors = personErrors(guarantor);
    const others = [...(isNew ? [{ nationalId: newBorrower.nationalId, who: "the client" }] : []), ...(index === 1 ? [{ nationalId: guarantors[0].nationalId, who: "guarantor 1" }] : [])];
    const duplicate = sameAsError(guarantor.nationalId, others);
    return duplicate && !errors.nationalId ? { ...errors, nationalId: duplicate } : errors;
  });
  // A guarantor already on an active loan can't guarantee another: asked as soon as the National ID is complete
  const guarantorChecks = [
    useGuarantorCheck(normaliseNationalId(guarantors[0].nationalId), Object.keys(personErrors(guarantors[0])).every((key) => key !== "nationalId")),
    useGuarantorCheck(normaliseNationalId(guarantors[1].nationalId), Object.keys(personErrors(guarantors[1])).every((key) => key !== "nationalId")),
  ];
  const guarantorBlocks = guarantorChecks.map((check) => (check.data && !check.data.canGuarantee ? check.data.message : null));
  // A draft may keep the signed PDF it already has
  const pdfError = !signedPdf && draft?.signedApplication ? undefined : !signedPdf ? "Upload the signed forms as one PDF." : signedPdf.type !== "application/pdf" ? "This isn't a PDF." : signedPdf.size > MAX_PDF_BYTES ? "The PDF is larger than 5 MB." : undefined;
  const stepValid: Record<StepId, boolean> = {
    borrower: !!chosen,
    terms: termsValid,
    route: !!route,
    details: !isNew || Object.keys(detailErrors).length === 0,
    guarantors: guarantorFieldErrors.every((errors) => Object.keys(errors).length === 0) && guarantorBlocks.every((block) => !block),
    signed: !pdfError,
    review: true,
  };
  // A draft only needs to say who the client is
  const draftReady = !isNew || Object.keys(personErrors(newBorrower)).length === 0;

  const steps = draft ? EDIT_STEPS : route === "online" ? ONLINE_STEPS : PAPER_STEPS;
  const stepIndex = steps.indexOf(step);

  const goTo = (next: StepId) => {
    create.reset();
    update.reset();
    setShowErrors(false);
    setStep(next);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  const next = () => {
    if (!stepValid[step]) {
      setShowErrors(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("main [aria-invalid='true']")?.focus());
      return;
    }
    goTo(steps[stepIndex + 1]);
  };

  const cleanPerson = (person: PersonDraft): PersonDraft => ({ fullName: person.fullName.trim().replace(/\s+/g, " "), nationalId: normaliseNationalId(person.nationalId), phone: normalisePhone(person.phone) ?? person.phone.trim() });
  const cleanGuarantor = (guarantor: GuarantorDraft): GuarantorDetails => ({ ...cleanPerson(guarantor), relationship: "" });
  const cleanBorrower = (borrower: BorrowerDraft): NewBorrowerDetails => ({
    ...cleanPerson(borrower),
    gender: borrower.gender || "female",
    secondaryPhone: normalisePhone(borrower.secondaryPhone),
    email: borrower.email.trim().toLowerCase() || null,
    area: borrower.area.trim(),
    premises: borrower.premises.trim(),
    occupation: borrower.occupation.trim(),
    nextOfKin: { name: borrower.kinName.trim().replace(/\s+/g, " ") || null, phone: normalisePhone(borrower.kinPhone) },
  });
  const send = (asRoute: Route, submit: boolean) => {
    if (!chosen || !termsValid) return;
    if (draft) {
      // Confirm from the request itself, so nothing depends on this page still being shown
      update
        .mutateAsync({
          application: {
            terms: { productId, amount: amountValue, purpose, repaymentSchedule: schedule, firstPaymentOn, numberOfPayments: paymentsValue },
            guarantors: guarantors.filter((g) => Object.keys(personErrors(g)).length === 0).map(cleanGuarantor),
            submit,
          },
          signedApplication: signedPdf && !pdfError ? signedPdf : null,
        })
        .then(() => {
          showToast({ message: submit ? `${draft.id} ${draft.returned ? "resubmitted" : "submitted"} for approval.` : `${draft.id} saved.` });
          navigate(`/applications/${draft.id}`);
        })
        .catch(() => undefined /* shown above the buttons */);
      return;
    }
    create.mutate(
      {
        application: {
          borrowerId: chosen.kind === "existing" ? chosen.id : null,
          terms: { productId, amount: amountValue, purpose, repaymentSchedule: schedule, firstPaymentOn, numberOfPayments: paymentsValue },
          route: asRoute,
          submit,
          ...(asRoute === "paper"
            ? {
                newBorrower: isNew ? cleanBorrower(newBorrower) : undefined,
                guarantors: guarantors.filter((g) => Object.keys(personErrors(g)).length === 0).map(cleanGuarantor),
              }
            : {}),
        },
        signedApplication: asRoute === "paper" && !pdfError ? signedPdf : null,
      },
      {
        onSuccess: (created) => {
          if (asRoute === "online") {
            setResult(created);
            window.scrollTo({ top: 0 });
            return;
          }
          showToast({ message: submit ? `${created.id} submitted for approval.` : `${created.id} saved as a draft.` });
          navigate(`/borrowers/${created.borrowerId}?tab=documents`);
        },
      },
    );
  };

  const saveError = create.error ?? update.error;
  const serverError = saveError instanceof ApiError ? saveError.message : saveError ? "The application couldn't be saved. Try again." : null;
  const borrowerName = chosen?.kind === "existing" ? chosen.name : newBorrower.fullName.trim() || "New client";

  if (result?.onlineLink) return <OnlineLinkReady result={result} borrowerName={chosen?.kind === "existing" ? chosen.name : null} />;

  // ----- Step content -----
  let content: ReactNode;
  if (step === "borrower") {
    content = (
      <BorrowerStep
        presetProblem={preset.data && !chosen ? blockedReason({ name: preset.data.name, status: preset.data.status, currentLoanId: preset.data.currentLoan?.id, applicationId: preset.data.application?.id, applicationStatus: preset.data.application?.status }, oneLoanAtATime) : null}
        presetName={preset.data?.name}
        chosen={chosen}
        onChoose={(choice) => {
          setChosen(choice);
          goTo("terms");
        }}
      />
    );
  } else if (step === "terms") {
    const errors = showErrors ? termErrors : {};
    content = (
      <>
        <fieldset className={styles.fieldset}>
          <legend>Loan product</legend>
          {allProducts && products.length === 0 ? (
            <p className={styles.error}>No loan products are on offer. Ask an admin to set one up in Settings → Loan products.</p>
          ) : (
            <div className={styles.products} role="radiogroup" aria-label="Loan product">
              {products.map((option) => (
                <label key={option.id} className={`${styles.product} ${productId === option.id ? styles.productSelected : ""}`}>
                  <input
                    type="radio"
                    name="product"
                    value={option.id}
                    checked={productId === option.id}
                    onChange={() => {
                      setProductId(option.id);
                      const optionLatest = latestFirstPayment(loanRules?.firstPaymentWithinDays[option.repaymentSchedule]);
                      if (!firstPaymentEdited || (optionLatest && firstPaymentOn > optionLatest)) setFirstPaymentOn(defaultFirstPayment(option.repaymentSchedule, loanRules?.firstPaymentWithinDays[option.repaymentSchedule]));
                    }}
                  />
                  <b>{option.name}</b>
                  <span>
                    {describeInterest({ interestRatePercent: option.interest.ratePercent, interestPer: option.interest.per })} · {formatUGX(option.amount.min)}–{formatUGX(option.amount.max)}
                  </span>
                  <span>
                    {describeLength(option.repaymentSchedule, option.numberOfPayments)}
                    {option.fee.type !== "none" && ` · fee ${option.fee.type === "percent" ? `${option.fee.value}%` : formatUGX(option.fee.value)}`}
                  </span>
                </label>
              ))}
            </div>
          )}
          {errors.product && <span className={styles.error}>{errors.product}</span>}
        </fieldset>
        <AmountField value={amount} onChange={setAmount} error={errors.amount} hint={product ? `${formatUGX(product.amount.min)} to ${formatUGX(product.amount.max)}` : undefined} />
        <PurposeField value={purpose} onChange={setPurpose} purposes={purposes} error={errors.purpose} />
        <div className={styles.pair}>
          <DateField
            label="First payment"
            value={firstPaymentOn}
            min={earliest}
            max={latest}
            onChange={(value) => {
              setFirstPaymentOn(value);
              setFirstPaymentEdited(true);
            }}
            error={errors.firstPaymentOn}
          />
          <div className={styles.dateField}>
            <span className={styles.fixedLabel}>Loan length</span>
            <p className={styles.fixedValue}>{product ? `${describeLength(schedule, product.numberOfPayments)} · ${product.numberOfPayments} ${schedule} payment${product.numberOfPayments === 1 ? "" : "s"}` : "Set by the loan product"}</p>
          </div>
        </div>
        {summary && (
          <div className={styles.calculation} aria-live="polite">
            <div>
              <span>Interest ({pricing && describeInterest(pricing)})</span>
              <b>{formatUGX(summary.interest)}</b>
            </div>
            {summary.fee > 0 && (
              <div>
                <span>Fee ({pricing!.fee.collection === "deducted" ? "taken from the payout" : "added to the repayments"})</span>
                <b>{formatUGX(summary.fee)}</b>
              </div>
            )}
            {summary.payout !== amountValue && (
              <div>
                <span>Client receives</span>
                <b>{formatUGX(summary.payout)}</b>
              </div>
            )}
            <div>
              <span>Total to repay</span>
              <b>{formatUGX(summary.totalRepayable)}</b>
            </div>
            <div>
              <span>Each payment</span>
              <b>
                {paymentsValue} × {formatUGX(summary.instalment)}
                {summary.finalInstalment !== summary.instalment && <small> (last {formatUGX(summary.finalInstalment)})</small>}
              </b>
            </div>
            <div>
              <span>Last payment</span>
              <b>{formatLongDate(summary.lastPaymentOn)}</b>
            </div>
          </div>
        )}
      </>
    );
  } else if (step === "route") {
    content = (
      <>
        <div className={styles.options} role="radiogroup" aria-label="How the forms are completed">
          <RouteOption
            selected={route === "paper"}
            onSelect={() => setRoute("paper")}
            icon="document"
            title="Paper forms"
            text="The client and guarantors fill in and sign the printed forms. You type in their details and upload the signed forms with their ID copies as one PDF."
          />
          <RouteOption
            selected={route === "online"}
            onSelect={() => setRoute("online")}
            icon="link"
            title="Online link"
            text="For a client with a smartphone. You send a link (e.g. on WhatsApp); they fill in their own and their guarantors' details, and all three tick a box to agree on the phone."
          />
        </div>
        {showErrors && !route && <p className={styles.error}>Choose paper forms or an online link.</p>}
        {route === "online" && isNew && <p className={styles.note}>They'll fill in their own details, and they'll join your portfolio when they submit.</p>}
      </>
    );
  } else if (step === "details") {
    if (isNew) {
      const errors = showErrors ? detailErrors : {};
      content = (
        <>
          <p className={styles.stepIntro}>As on the payment agreement and the National ID. Their ID copy is in the signed PDF, so no photos are needed here.</p>
          <PersonFields person={newBorrower} onChange={(changes) => setNewBorrower((current) => ({ ...current, ...changes }))} errors={errors} phoneLabel="Phone number (mobile money)" />
          <BorrowerExtraFields borrower={newBorrower} onChange={(changes) => setNewBorrower((current) => ({ ...current, ...changes }))} errors={errors} />
        </>
      );
    } else {
      const profile = chosenProfile.data;
      content = (
        <>
          <p className={styles.stepIntro}>Already registered. Check these match the forms.</p>
          <dl className={styles.facts}>
            <Fact label="Full name">{profile?.name ?? "…"}</Fact>
            <Fact label="National ID">{profile?.nationalIdMasked ?? "…"}</Fact>
            <Fact label="Phone (mobile money)">{profile?.phone ?? "…"}</Fact>
            <Fact label="Address (Location)">{profile?.area ?? "…"}</Fact>
            <Fact label="Shop / premises">{profile?.premises ?? "…"}</Fact>
          </dl>
          <p className={styles.note}>
            Something different on the forms? Update it with Edit details on{" "}
            {chosen?.kind === "existing" && (
              <Link to={`/borrowers/${chosen.id}`} target="_blank" rel="noopener">
                their profile
              </Link>
            )}{" "}
            (a new mobile money number needs a second person's approval).
          </p>
        </>
      );
    }
  } else if (step === "guarantors") {
    content = (
      <>
        <p className={styles.stepIntro}>Both guarantors, as written on the payment agreement and their consents.</p>
        <div className={styles.guarantors}>
          {guarantors.map((guarantor, index) => (
            <section key={index} className={styles.guarantor} aria-labelledby={`guarantor-${index + 1}`}>
              <h3 id={`guarantor-${index + 1}`} className={styles.guarantorHeading}>
                Guarantor {index + 1}
              </h3>
              <PersonFields
                person={guarantor}
                phoneLabel="Phone number"
                onChange={(changes) =>
                  setGuarantors((current) => {
                    const copy: [GuarantorDraft, GuarantorDraft] = [{ ...current[0] }, { ...current[1] }];
                    copy[index] = { ...copy[index], ...changes };
                    return copy;
                  })
                }
                // The "already on an active loan" warning shows as soon as the ID is complete, under the ID number
                errors={{ ...(showErrors ? guarantorFieldErrors[index] : {}), ...(guarantorBlocks[index] ? { nationalId: guarantorBlocks[index]! } : {}) }}
              />
            </section>
          ))}
        </div>
      </>
    );
  } else if (step === "signed") {
    content = <SignedPdfStep file={signedPdf} current={draft?.signedApplication ?? null} onChange={setSignedPdf} error={showErrors ? pdfError : undefined} />;
  } else {
    content = (
      <dl className={styles.review}>
        <ReviewRow title="Client" onEdit={() => goTo(isNew ? "details" : "borrower")}>
          <b>{borrowerName}</b>
          {isNew ? (
            <span>
              NIN {normaliseNationalId(newBorrower.nationalId)} · {normalisePhone(newBorrower.phone)} · {newBorrower.gender === "male" ? "Male" : "Female"} · {newBorrower.area} · {newBorrower.premises} {newBorrower.kinName.trim() && <> · Next of kin {newBorrower.kinName}{normalisePhone(newBorrower.kinPhone) && ` (${normalisePhone(newBorrower.kinPhone)})`}</>}
            </span>
          ) : (
            <span>
              {chosen?.kind === "existing" && `${chosen.id} · ${chosen.phone} · ${chosen.area}`}
            </span>
          )}
        </ReviewRow>
        <ReviewRow title="Loan" onEdit={() => goTo("terms")}>
          <b>
            {formatUGX(amountValue)}
            {product && ` · ${product.name}`}
            {purpose && ` · ${purpose}`}
          </b>
          {summary && (
            <span>
              {paymentsValue} {schedule} payment{paymentsValue === 1 ? "" : "s"} of {formatUGX(summary.instalment)} · {formatLongDate(firstPaymentOn)} to {formatLongDate(summary.lastPaymentOn)} · total {formatUGX(summary.totalRepayable)}
            </span>
          )}
        </ReviewRow>
        {guarantors.map((guarantor, index) => (
          <ReviewRow key={index} title={`Guarantor ${index + 1}`} onEdit={() => goTo("guarantors")}>
            <b>{guarantor.fullName}</b>
            <span>
              NIN {normaliseNationalId(guarantor.nationalId)} · {normalisePhone(guarantor.phone)}
            </span>
          </ReviewRow>
        ))}
        <ReviewRow title="Signed forms" onEdit={() => goTo("signed")}>
          <b>{signedPdf?.name ?? (draft?.signedApplication ? "Current signed PDF (kept)" : "")}</b>
          <span>One PDF · {signedPdf ? `${Math.max(1, Math.round(signedPdf.size / 1024))} KB` : draft?.signedApplication ? `uploaded by ${draft.signedApplication.uploadedBy}` : ""}</span>
        </ReviewRow>
      </dl>
    );
  }

  const isPaperDetailStep = !!draft || (route === "paper" && stepIndex >= PAPER_STEPS.indexOf("details"));
  const primary =
    step === "route" && route === "online" ? (
      <Button onClick={() => (route ? send("online", false) : setShowErrors(true))} disabled={saving}>
        {saving ? "Creating…" : "Create and get link"}
      </Button>
    ) : step === "review" ? (
      <Button onClick={() => send("paper", true)} disabled={saving}>
        {saving ? "Submitting…" : draft?.returned ? "Resubmit for approval" : "Submit for approval"}
      </Button>
    ) : step !== "borrower" ? (
      // The terms need the loan products first
      <Button onClick={next} disabled={step === "terms" && !allProducts}>
        Next
      </Button>
    ) : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link to="/applications">Applications</Link>
        <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
        {draft ? (
          <>
            <Link to={`/applications/${draft.id}`}>{draft.id}</Link>
            <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
            <span aria-current="page">Continue</span>
          </>
        ) : (
          <span aria-current="page">New application</span>
        )}
      </nav>
      <h1 className={styles.title}>{draft ? `${draft.returned ? "Fix" : "Continue"} ${draft.id} · ${draft.borrower.name}` : "New application"}</h1>
      {draft?.returned && (
        <p className={styles.warning} role="note">
          <Icon name="warning" size={16} strokeWidth={1.9} />
          <span>
            <b>
              Sent back by {draft.returned.by}: {draft.returned.reason}.
            </b>
            {draft.returned.note && <> {draft.returned.note}</>}
          </span>
        </p>
      )}

      <ol className={styles.stepper} aria-label="Steps">
        {steps.map((id, index) => (
          <li key={id} className={index < stepIndex ? styles.stepDone : index === stepIndex ? styles.stepCurrent : ""} aria-current={index === stepIndex ? "step" : undefined}>
            <span className={styles.stepNumber}>{index < stepIndex ? <Icon name="check" size={13} strokeWidth={2.6} /> : index + 1}</span>
            <span className={styles.stepLabel}>{STEP_LABELS[id]}</span>
          </li>
        ))}
        {/* The rest depends on the route, so say so instead of showing steps that may not apply */}
        {!route && <li className={styles.stepMore}>More steps after you choose paper or online</li>}
      </ol>

      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="step-heading">
          <p className={styles.stepCount}>
            Step {stepIndex + 1}
            {route ? ` of ${steps.length}` : ""}
          </p>
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className={styles.stepHeading}>
            {STEP_LABELS[step]}
          </h2>
          {content}

          {serverError && (
            <p className={styles.serverError} role="alert">
              {serverError}
            </p>
          )}
          {step !== "borrower" && (
            <div className={styles.actions}>
              {stepIndex > 0 ? (
                <Button variant="secondary" onClick={() => goTo(steps[stepIndex - 1])} disabled={saving}>
                  Back
                </Button>
              ) : (
                <Link className={styles.cancelLink} to={draft ? `/applications/${draft.id}` : "/applications"}>
                  Cancel
                </Link>
              )}
              <span className={styles.actionsEnd}>
                {isPaperDetailStep && step !== "review" && (
                  <Button variant="secondary" onClick={() => (draftReady ? send("paper", false) : (setShowErrors(true), undefined))} disabled={saving} title={draftReady ? undefined : "Enter the client's name, NIN and phone first"}>
                    Save as draft
                  </Button>
                )}
                {primary}
              </span>
            </div>
          )}
          {isPaperDetailStep && !draftReady && showErrors && step !== "details" && <p className={styles.error}>To save a draft, first enter the client's name, NIN and phone.</p>}
        </section>

        <aside className={styles.summary} aria-label="Application summary">
          <h2>Summary</h2>
          <dl>
            <Fact label="Client">{chosen ? borrowerName : "—"}</Fact>
            <Fact label="Product">{product?.name ?? "—"}</Fact>
            <Fact label="Amount">{amountValue > 0 ? formatUGX(amountValue) : "—"}</Fact>
            <Fact label="Total to repay">{summary ? formatUGX(summary.totalRepayable) : "—"}</Fact>
            <Fact label="Payments">{summary ? `${paymentsValue} ${schedule} × ${formatUGX(summary.instalment)}` : "—"}</Fact>
            <Fact label="Dates">{summary ? `${formatLongDate(firstPaymentOn)} to ${formatLongDate(summary.lastPaymentOn)}` : "—"}</Fact>
            <Fact label="Forms">{route === "paper" ? "Paper, signed and scanned" : route === "online" ? "Online link" : "—"}</Fact>
          </dl>
        </aside>
      </div>
    </>
  );
}

function BorrowerStep({ chosen, onChoose, presetProblem, presetName }: { chosen: Chosen | null; onChoose: (choice: Chosen) => void; presetProblem: string | null; presetName?: string }) {
  const id = useId();
  const oneLoanAtATime = useSystemSettings().data?.loanRules.oneOpenLoanPerBorrower ?? true;
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  const searching = query.length >= 2;
  const { data, isFetching } = useBorrowerList({ query, status: null, officerId: null, sort: "name", order: "asc", page: 1 }, { enabled: searching });
  const results = searching ? (data?.items ?? []).slice(0, 6) : [];

  return (
    <>
      {presetProblem && (
        <p className={styles.warning} role="note">
          <Icon name="warning" size={16} strokeWidth={1.9} />
          <span>
            <b>{presetName}:</b> {presetProblem}
          </span>
        </p>
      )}
      <p className={styles.stepIntro}>Check whether they already borrow from Tamu, so their history stays together.</p>
      <label htmlFor={id} className={styles.search}>
        <Icon name="search" size={17} strokeWidth={1.8} />
        <input id={id} type="search" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search full National ID, phone or name" autoComplete="off" autoFocus />
      </label>
      {searching && (
        <ul className={styles.results} aria-label="Matching clients" aria-busy={isFetching}>
          {results.length === 0 && !isFetching && <li className={styles.noResults}>No registered client matches “{query}”.</li>}
          {results.map((borrower) => {
            const blocked = blockedReason({ name: borrower.name, status: borrower.status, currentLoanId: borrower.currentLoan?.id, applicationId: borrower.application?.id, applicationStatus: borrower.application?.status }, oneLoanAtATime);
            return (
              <li key={borrower.id} className={styles.result}>
                <span>
                  <b>{borrower.name}</b>
                  <span className={styles.resultMeta}>
                    {borrower.id} · {borrower.phone} · {borrower.area}
                  </span>
                  {blocked && <span className={styles.resultBlocked}>{blocked}</span>}
                </span>
                <BorrowerStatusChip status={borrower.status} daysPastDue={borrower.currentLoan?.daysPastDue} applicationStatus={borrower.application?.status} />
                <Button
                  variant="secondary"
                  size="small"
                  disabled={!!blocked}
                  onClick={() => onChoose({ kind: "existing", id: borrower.id, name: borrower.name, phone: borrower.phone, area: borrower.area, status: borrower.status })}
                  aria-label={`Choose ${borrower.name}`}
                >
                  {chosen?.kind === "existing" && chosen.id === borrower.id ? "Chosen" : "Choose"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.or}>
        <span>or</span>
      </div>
      <button type="button" className={styles.newBorrower} onClick={() => onChoose({ kind: "new" })}>
        <Icon name="person" size={20} strokeWidth={1.8} />
        <span>
          <b>New client</b>
          <span>Not registered yet. Their details come from the paper forms, or they fill them in online.</span>
        </span>
      </button>
    </>
  );
}

/** Amount in UGX, shown with thousands separators as it's typed. */
function AmountField({ value, onChange, error, hint }: { value: string; onChange: (value: string) => void; error?: string; hint?: string }) {
  const digits = value.replace(/\D/g, "");
  return (
    <TextField
      label="Amount to lend (UGX)"
      value={digits ? Number(digits).toLocaleString("en-US") : ""}
      onChange={(typed) => onChange(typed.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10))}
      error={error}
      inputMode="tel"
      hint={hint ?? (digits ? undefined : "e.g. 2,500,000")}
    />
  );
}

function PurposeField({ value, onChange, purposes, error }: { value: string; onChange: (value: string) => void; purposes: string[]; error?: string }) {
  const id = useId();
  return (
    <div className={styles.dateField}>
      <label htmlFor={id}>What the loan is for</label>
      <Select id={id} value={value} onChange={onChange} options={purposes.map((purpose) => ({ value: purpose, label: purpose }))} placeholder="Choose the purpose" />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

function DateField({ label, value, min, max, onChange, error }: { label: string; value: string; min: string; max?: string; onChange: (value: string) => void; error?: string }) {
  const id = useId();
  return (
    <div className={styles.dateField}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

function RouteOption({ selected, onSelect, icon, title, text }: { selected: boolean; onSelect: () => void; icon: "document" | "link"; title: string; text: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`${styles.option} ${selected ? styles.optionSelected : ""}`} onClick={onSelect}>
      <span className={styles.optionIcon}>
        <Icon name={icon} size={20} strokeWidth={1.8} />
      </span>
      <b>{title}</b>
      <span>{text}</span>
    </button>
  );
}

function SignedPdfStep({ file, current, onChange, error }: { file: File | null; current: DocumentFile | null; onChange: (file: File | null) => void; error?: string }) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <p className={styles.stepIntro}>The signed payment agreement, both guarantor consents and the National ID copies of all three people, scanned together into one PDF.</p>
      {current && !file && (
        <p className={styles.note}>
          Current: <b>{describeFile(current, true)}</b>. Keep it, or choose a new PDF below to replace it (the old one stays in the history).
        </p>
      )}
      <label
        htmlFor={id}
        className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""} ${error ? styles.dropZoneInvalid : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onChange(event.dataTransfer.files[0] ?? null);
        }}
      >
        <Icon name="upload" size={22} strokeWidth={1.8} />
        {file ? (
          <span>
            <b>{file.name}</b>
            <small>{Math.max(1, Math.round(file.size / 1024))} KB · choose another file</small>
          </span>
        ) : (
          <span>
            <b>Choose the PDF</b> or drop it here
            <small>All three pages, with every signature readable · up to 5 MB</small>
          </span>
        )}
        <input id={id} type="file" accept=".pdf,application/pdf" className={styles.fileInput} onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function ReviewRow({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className={styles.reviewRow}>
      <dt>{title}</dt>
      <dd>{children}</dd>
      <button type="button" className={styles.textButton} onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
        Edit
      </button>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** After creating an online application: the link to send. */
function OnlineLinkReady({ result, borrowerName }: { result: NewApplicationResult; borrowerName: string | null }) {
  const showToast = useToast();
  const id = useId();
  const link = result.onlineLink!;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      showToast({ message: "Link copied. Paste it into WhatsApp." });
    } catch {
      document.getElementById(id)?.focus();
      showToast({ message: "Copying isn't allowed here. Select the link and copy it." });
    }
  };
  return (
    <>
      <h1 className={styles.title}>New application</h1>
      <section className={`${styles.card} ${styles.ready}`} aria-labelledby="ready-heading">
        <span className={styles.readyIcon} aria-hidden="true">
          <Icon name="check" size={26} strokeWidth={2.2} />
        </span>
        <h2 id="ready-heading" className={styles.stepHeading}>
          {result.id} is ready to send
        </h2>
        <p className={styles.stepIntro}>
          Send this link to {borrowerName ?? "the client"}, e.g. on WhatsApp. They fill in their details and their two guarantors', and all three tick a box to agree on the phone.
        </p>
        <label htmlFor={id} className={styles.linkLabel}>
          Online link
        </label>
        <div className={styles.linkRow}>
          <input id={id} value={link.url} readOnly onFocus={(event) => event.target.select()} />
          <Button onClick={() => void copy()}>
            <Icon name="link" size={16} strokeWidth={1.9} />
            Copy link
          </Button>
        </div>
        <p className={styles.note}>It works once and expires on {formatLongDate(link.expiresAt)}. Don't post it anywhere public: anyone with the link can fill in the application.</p>
        <div className={styles.readyActions}>
          {result.borrowerId ? (
            <Link className={styles.linkButton} to={`/borrowers/${result.borrowerId}?tab=documents`}>
              Open {borrowerName}'s documents
            </Link>
          ) : (
            <Link className={styles.linkButton} to="/borrowers?status=applicant">
              Go to clients
            </Link>
          )}
          <Link className={styles.linkButton} to="/applications/new" state={{ startedAt: Date.now() }}>
            Start another application
          </Link>
        </div>
      </section>
    </>
  );
}
