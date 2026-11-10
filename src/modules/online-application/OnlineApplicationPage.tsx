import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { ApiError } from "../../api/client";
import { useOnlineApplicationForm, useSubmitOnlineApplication, type OnlineApplicationUpload } from "../../api/onlineApplication";
import type { GuarantorDetails, OnlineApplicationForm } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { FormSkeleton } from "./FormSkeleton";
import { formatLongDate, formatUGX } from "../../lib/format";
import { normalisePhone } from "../../lib/phone";
import {
  borrowerErrors,
  EMPTY_BORROWER,
  EMPTY_GUARANTOR,
  guarantorErrors,
  normaliseNationalId,
  sameAsError,
  type BorrowerDraft,
  type FieldErrors,
  type GuarantorDraft,
  type PersonDraft,
} from "../applications/applicationValidation";
import { AgreementWording, ConsentWording } from "./FormWording";
import { BorrowerExtraFields, GuarantorFields, PersonFields } from "../applications/ApplicationFields";
import { IdPhotoInput, type IdPhoto } from "../applications/IdPhotoInput";
import styles from "./OnlineApplication.module.css";

type Step = "welcome" | "borrower" | "guarantor1" | "guarantor2" | "sign" | "done";
const NUMBERED_STEPS: { step: Step; label: string }[] = [
  { step: "borrower", label: "Your details" },
  { step: "guarantor1", label: "Guarantor 1" },
  { step: "guarantor2", label: "Guarantor 2" },
  { step: "sign", label: "Review and agree" },
];
const FREQUENCY = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" } as const;
type Signer = "borrower" | "guarantor1" | "guarantor2";
type GuarantorIdPhotos = { front: IdPhoto | null; back: IdPhoto | null };

const LINK_PROBLEMS: Record<string, { title: string; text: string }> = {
  invalid: { title: "This link isn't valid", text: "Check that you opened the whole link, or ask your loan officer to send it again." },
  used: { title: "Already submitted", text: "This application has been sent to Tamu, so the link no longer works. Your loan officer will contact you." },
  replaced: { title: "There's a newer link", text: "Your loan officer sent you a newer link for this application. Please use that one." },
  expired: { title: "This link has expired", text: "Links only work for a limited time. Ask your loan officer to send you a new one." },
};

/**
 * The online loan application (Tamu's digital alternative to the paper forms). The loan officer
 * sends this link to the client, e.g. on WhatsApp. The client fills in their own details and
 * both guarantors' details, adds photos of their National ID, and all three tick a box to agree
 * (their ID photos are the proof of who they are, so nobody has to draw a signature).
 * The link works once: it stops working as soon as the form is submitted, or when it expires.
 */
export function OnlineApplicationPage() {
  const { token = "" } = useParams();
  const { data: form, isPending, error } = useOnlineApplicationForm(token);

  // The business name from Settings → Business details (until the form loads, the app's name)
  const lender = form?.lender ?? "Tamu Loans";
  useEffect(() => {
    document.title = `Loan application · ${lender}`;
  }, [lender]);

  let content: ReactNode;
  if (isPending) content = <FormSkeleton />;
  else if (error) {
    const reason = error instanceof ApiError ? ((error.body as { reason?: string } | undefined)?.reason ?? "invalid") : "unknown";
    content = reason === "unknown" ? <Problem title="Something went wrong" text="The application couldn't open. Check your internet connection and open the link again." /> : <Problem {...(LINK_PROBLEMS[reason] ?? LINK_PROBLEMS.invalid)} />;
  } else content = <ApplicationSteps token={token} form={form} />;

  return (
    <div className={styles.page}>
      <main className={styles.main}>{content}</main>
    </div>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <section className={`${styles.card} ${styles.centered}`} aria-labelledby="link-problem">
      <span className={`${styles.statusIcon} ${styles.statusIconWarning}`} aria-hidden="true">
        <Icon name="warning" size={26} strokeWidth={1.8} />
      </span>
      <h1 id="link-problem">{title}</h1>
      <p className={styles.lead}>{text}</p>
    </section>
  );
}

function ApplicationSteps({ token, form }: { token: string; form: OnlineApplicationForm }) {
  const submit = useSubmitOnlineApplication(token);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [borrower, setBorrower] = useState<BorrowerDraft>(EMPTY_BORROWER);
  const [guarantors, setGuarantors] = useState<[GuarantorDraft, GuarantorDraft]>([{ ...EMPTY_GUARANTOR }, { ...EMPTY_GUARANTOR }]);
  const [idFront, setIdFront] = useState<IdPhoto | null>(null);
  const [idBack, setIdBack] = useState<IdPhoto | null>(null);
  // Each guarantor's National ID, front and back
  const [guarantorIds, setGuarantorIds] = useState<[GuarantorIdPhotos, GuarantorIdPhotos]>([{ front: null, back: null }, { front: null, back: null }]);
  const [agreed, setAgreed] = useState<Record<Signer, boolean>>({ borrower: false, guarantor1: false, guarantor2: false });
  const [showErrors, setShowErrors] = useState(false);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);

  // Free the ID photo previews when the form closes
  const photos = useRef<(IdPhoto | null)[]>([]);
  photos.current = [idFront, idBack, ...guarantorIds.flatMap((ids) => [ids.front, ids.back])];
  useEffect(() => () => photos.current.forEach((photo) => photo && URL.revokeObjectURL(photo.previewUrl)), []);

  // Warn before leaving with details filled in (nothing is saved until it's submitted)
  const started = step !== "welcome" && step !== "done";
  useEffect(() => {
    if (!started) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [started]);

  const goTo = (next: Step) => {
    // Changing details after agreeing means agreeing again
    if (step === "sign" && next !== "done") {
      setAgreed({ borrower: false, guarantor1: false, guarantor2: false });
    }
    setShowErrors(false);
    setStep(next);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  // ----- Errors per step -----
  const borrowerFieldErrors: FieldErrors<BorrowerDraft> = borrowerErrors(borrower);
  const photoErrors = { front: idFront ? undefined : "Take a photo of the front of your National ID.", back: idBack ? undefined : "Take a photo of the back of your National ID." };
  const guarantorPhotoErrors = guarantorIds.map((ids) => ({ front: ids.front ? undefined : "Take a photo of the front of their National ID.", back: ids.back ? undefined : "Take a photo of the back of their National ID." }));
  const guarantorFieldErrors = guarantors.map((guarantor, index) => {
    const errors = guarantorErrors(guarantor);
    const others = [{ nationalId: borrower.nationalId, who: "the client" }, ...(index === 1 ? [{ nationalId: guarantors[0].nationalId, who: "guarantor 1" }] : [])];
    const duplicate = sameAsError(guarantor.nationalId, others);
    return duplicate && !errors.nationalId ? { ...errors, nationalId: duplicate } : errors;
  });
  const stepValid = {
    borrower: Object.keys(borrowerFieldErrors).length === 0 && !photoErrors.front && !photoErrors.back,
    guarantor1: Object.keys(guarantorFieldErrors[0]).length === 0 && !guarantorPhotoErrors[0].front && !guarantorPhotoErrors[0].back,
    guarantor2: Object.keys(guarantorFieldErrors[1]).length === 0 && !guarantorPhotoErrors[1].front && !guarantorPhotoErrors[1].back,
    sign: (["borrower", "guarantor1", "guarantor2"] as Signer[]).every((signer) => agreed[signer]),
  };

  const next = (current: "borrower" | "guarantor1" | "guarantor2", to: Step) => {
    if (!stepValid[current]) {
      setShowErrors(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [data-invalid='true']")?.focus());
      return;
    }
    goTo(to);
  };

  const send = () => {
    if (!stepValid.sign || !idFront || !idBack || guarantorIds.some((ids) => !ids.front || !ids.back)) {
      setShowErrors(true);
      return;
    }
    const clean = (person: PersonDraft): PersonDraft => ({ fullName: person.fullName.trim().replace(/\s+/g, " "), nationalId: normaliseNationalId(person.nationalId), phone: normalisePhone(person.phone)! });
    const cleanGuarantor = (guarantor: GuarantorDraft): GuarantorDetails => ({ ...clean(guarantor), relationship: guarantor.relationship.trim() });
    submit.mutate(
      {
        details: {
          borrower: {
            ...clean(borrower),
            gender: borrower.gender || "female",
            secondaryPhone: normalisePhone(borrower.secondaryPhone),
            email: borrower.email.trim().toLowerCase() || null,
            area: borrower.area.trim(),
            premises: borrower.premises.trim(),
            occupation: borrower.occupation.trim(),
            nextOfKin: { name: borrower.kinName.trim().replace(/\s+/g, " ") || null, phone: normalisePhone(borrower.kinPhone) },
          },
          guarantors: [cleanGuarantor(guarantors[0]), cleanGuarantor(guarantors[1])],
          // Each person ticked the box; the server records when
          consent: { borrower: true, guarantor1: true, guarantor2: true },
        },
        idFront: idFront.blob,
        idBack: idBack.blob,
        guarantorIds: guarantorIds.map((ids) => ({ front: ids.front!.blob, back: ids.back!.blob })) as OnlineApplicationUpload["guarantorIds"],
      },
      {
        onSuccess: () => goTo("done"),
        onError: (error) => {
          if (error instanceof ApiError && (error.status === 410 || error.status === 404)) setLinkProblem((error.body as { reason?: string } | undefined)?.reason ?? "invalid");
        },
      },
    );
  };

  if (linkProblem) return <Problem {...(LINK_PROBLEMS[linkProblem] ?? LINK_PROBLEMS.invalid)} />;

  if (step === "welcome") {
    const { terms } = form;
    return (
      <section className={styles.card} aria-labelledby="welcome-heading">
        <p className={styles.eyebrow}>{form.reference}</p>
        <h1 id="welcome-heading" ref={headingRef} tabIndex={-1}>
          Your loan application
        </h1>
        <p className={styles.lead}>Your loan officer has prepared this loan for you. Fill in your details and your two guarantors' details, then all three of you tick a box on this phone to agree.</p>
        <dl className={styles.terms}>
          <div>
            <dt>Loan amount</dt>
            <dd>{formatUGX(terms.amount)}</dd>
          </div>
          <div>
            <dt>Interest ({terms.interestLabel})</dt>
            <dd>{formatUGX(terms.interest)}</dd>
          </div>
          {terms.fee > 0 && (
            <div>
              <dt>Fee ({terms.feeCollection === "deducted" ? "taken from the payout" : "added to the repayments"})</dt>
              <dd>{formatUGX(terms.fee)}</dd>
            </div>
          )}
          <div className={styles.termsTotal}>
            <dt>Total to repay</dt>
            <dd>{formatUGX(terms.totalRepayable)}</dd>
          </div>
          <div>
            <dt>Payments</dt>
            <dd>
              {terms.numberOfPayments && terms.instalment
                ? `${terms.numberOfPayments} ${FREQUENCY[terms.repaymentSchedule].toLowerCase()} × ${formatUGX(terms.instalment)}`
                : FREQUENCY[terms.repaymentSchedule]}
            </dd>
          </div>
          <div>
            <dt>First payment</dt>
            <dd>{formatLongDate(terms.firstPaymentOn)}</dd>
          </div>
          <div>
            <dt>Last payment</dt>
            <dd>{formatLongDate(terms.lastPaymentOn)}</dd>
          </div>
        </dl>
        <h2 className={styles.subheading}>You will need</h2>
        <ul className={styles.checklist}>
          <li>Your National ID card, to take photos of both sides</li>
          <li>Your two guarantors with you, with their National ID cards, to give their details and agree</li>
          <li>About 10 minutes</li>
        </ul>
        <Button className={styles.primaryButton} onClick={() => goTo("borrower")}>
          Start
        </Button>
        <p className={styles.footnote}>This link works once and expires on {formatLongDate(form.expiresAt)}. Don't share it with anyone else.</p>
      </section>
    );
  }

  if (step === "done") {
    return (
      <section className={`${styles.card} ${styles.centered}`} aria-labelledby="done-heading">
        <span className={`${styles.statusIcon} ${styles.statusIconSuccess}`} aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2.2} />
        </span>
        <h1 id="done-heading" ref={headingRef} tabIndex={-1}>
          Application sent
        </h1>
        <p className={styles.lead}>
          {form.lender} has received your application {form.reference}. Your loan officer will review it and contact you on {normalisePhone(borrower.phone)}.
        </p>
        <p className={styles.footnote}>For your security, this link no longer works. You can close this page.</p>
      </section>
    );
  }

  const stepIndex = NUMBERED_STEPS.findIndex((s) => s.step === step);
  const progress = (
    <div className={styles.progress}>
      <p className={styles.eyebrow}>
        Step {stepIndex + 1} of {NUMBERED_STEPS.length} · {form.reference}
      </p>
      <div className={styles.progressTrack} role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={NUMBERED_STEPS.length} aria-valuenow={stepIndex + 1}>
        {NUMBERED_STEPS.map((s, index) => (
          <span key={s.step} className={index <= stepIndex ? styles.progressDone : ""} />
        ))}
      </div>
    </div>
  );

  if (step === "borrower") {
    const errors = showErrors ? borrowerFieldErrors : {};
    return (
      <section className={styles.card} aria-labelledby="step-heading">
        {progress}
        <h1 id="step-heading" ref={headingRef} tabIndex={-1}>
          Your details
        </h1>
        <p className={styles.lead}>As on your National ID. The loan is paid to your phone number.</p>
        <PersonFields person={borrower} onChange={(changes) => setBorrower((current) => ({ ...current, ...changes }))} errors={errors} phoneLabel="Phone number (mobile money)" />
        <BorrowerExtraFields borrower={borrower} onChange={(changes) => setBorrower((current) => ({ ...current, ...changes }))} errors={errors} you />
        <h2 className={styles.subheading}>Photos of your National ID</h2>
        <p className={styles.hint}>Place the card on a flat surface in good light, with all four corners showing.</p>
        <div className={styles.photoPair}>
          <IdPhotoInput label="Front" value={idFront} onChange={setIdFront} error={showErrors ? photoErrors.front : undefined} />
          <IdPhotoInput label="Back" value={idBack} onChange={setIdBack} error={showErrors ? photoErrors.back : undefined} />
        </div>
        <StepActions onBack={() => goTo("welcome")} onNext={() => next("borrower", "guarantor1")} />
      </section>
    );
  }

  if (step === "guarantor1" || step === "guarantor2") {
    const index = step === "guarantor1" ? 0 : 1;
    const errors = showErrors ? guarantorFieldErrors[index] : {};
    const setId = (side: "front" | "back", photo: IdPhoto | null) =>
      setGuarantorIds((current) => {
        const copy: [GuarantorIdPhotos, GuarantorIdPhotos] = [{ ...current[0] }, { ...current[1] }];
        copy[index] = { ...copy[index], [side]: photo };
        return copy;
      });
    const update = (changes: Partial<GuarantorDraft>) =>
      setGuarantors((current) => {
        const copy: [GuarantorDraft, GuarantorDraft] = [{ ...current[0] }, { ...current[1] }];
        copy[index] = { ...copy[index], ...changes };
        return copy;
      });
    return (
      <section className={styles.card} aria-labelledby="step-heading">
        {progress}
        <h1 id="step-heading" ref={headingRef} tabIndex={-1}>
          Guarantor {index + 1}
        </h1>
        <p className={styles.lead}>A guarantor agrees to pay the loan if you don't. They will tick a box to agree on this phone at the end.</p>
        <GuarantorFields guarantor={guarantors[index]} onChange={update} errors={errors} />
        <h2 className={styles.subheading}>Photos of their National ID</h2>
        <div className={styles.photoPair}>
          <IdPhotoInput label="Front" value={guarantorIds[index].front} onChange={(photo) => setId("front", photo)} error={showErrors ? guarantorPhotoErrors[index].front : undefined} />
          <IdPhotoInput label="Back" value={guarantorIds[index].back} onChange={(photo) => setId("back", photo)} error={showErrors ? guarantorPhotoErrors[index].back : undefined} />
        </div>
        <StepActions onBack={() => goTo(index === 0 ? "borrower" : "guarantor1")} onNext={() => next(step, index === 0 ? "guarantor2" : "sign")} />
      </section>
    );
  }

  // Review and agree: each person ticks a box (their National ID photos are on file as proof of who they are)
  const signBlock = (signer: Signer, name: string, title: string, agreement: string, wording: ReactNode) => {
    const missing = showErrors && !agreed[signer];
    return (
      <section className={styles.signBlock} aria-labelledby={`sign-${signer}`} data-invalid={missing}>
        <h2 id={`sign-${signer}`} className={styles.subheading}>
          {title}: {name}
        </h2>
        {signer !== "borrower" && <p className={styles.handOver}>Hand the phone to {name.split(" ")[0]}.</p>}
        {wording}
        <label className={styles.agree}>
          <input type="checkbox" checked={agreed[signer]} onChange={(event) => setAgreed((current) => ({ ...current, [signer]: event.target.checked }))} />
          <span>{agreement}</span>
        </label>
        {missing && <span className={styles.fieldError}>Tick the box to agree.</span>}
      </section>
    );
  };

  const serverError = submit.error && !(submit.error instanceof ApiError && (submit.error.status === 410 || submit.error.status === 404))
    ? submit.error instanceof ApiError ? submit.error.message : "The application couldn't be sent. Check your internet connection and try again."
    : null;

  return (
    <section className={styles.card} aria-labelledby="step-heading">
      {progress}
      <h1 id="step-heading" ref={headingRef} tabIndex={-1}>
        Review and agree
      </h1>
      <p className={styles.lead}>Check the details. If something is wrong, go back and fix it before you agree. Each person ticks their own box; no signature is needed.</p>

      <dl className={styles.review}>
        <ReviewPerson title="You" person={borrower} extra={`${borrower.gender === "male" ? "Male" : "Female"} · ${borrower.area} · ${borrower.premises}${borrower.kinName.trim() ? ` · Next of kin ${borrower.kinName}` : ""}`} onEdit={() => goTo("borrower")} />
        <ReviewPerson title="Guarantor 1" person={guarantors[0]} extra={`${guarantors[0].relationship} · ID photos added`} onEdit={() => goTo("guarantor1")} />
        <ReviewPerson title="Guarantor 2" person={guarantors[1]} extra={`${guarantors[1].relationship} · ID photos added`} onEdit={() => goTo("guarantor2")} />
      </dl>

      {signBlock("borrower", borrower.fullName, "Client", "I have read and agree to this payment agreement.", <AgreementWording form={form} borrower={borrower} guarantors={guarantors} />)}
      {signBlock("guarantor1", guarantors[0].fullName, "Guarantor 1", `I agree to guarantee this loan to ${borrower.fullName}.`, <ConsentWording form={form} borrower={borrower} guarantor={guarantors[0]} />)}
      {signBlock("guarantor2", guarantors[1].fullName, "Guarantor 2", `I agree to guarantee this loan to ${borrower.fullName}.`, <ConsentWording form={form} borrower={borrower} guarantor={guarantors[1]} />)}

      {serverError && (
        <p className={styles.submitError} role="alert">
          {serverError}
        </p>
      )}
      {showErrors && !stepValid.sign && (
        <p className={styles.submitError} role="alert">
          All three people need to tick their box.
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => goTo("guarantor2")} disabled={submit.isPending}>
          Back
        </Button>
        <Button onClick={send} disabled={submit.isPending}>
          {submit.isPending ? "Sending…" : "Submit application"}
        </Button>
      </div>
      <p className={styles.footnote}>Once you submit, this link stops working.</p>
    </section>
  );
}

function ReviewPerson({ title, person, extra, onEdit }: { title: string; person: PersonDraft; extra?: string; onEdit: () => void }) {
  return (
    <div className={styles.reviewPerson}>
      <dt>{title}</dt>
      <dd>
        <b>{person.fullName}</b>
        <span>
          NIN {normaliseNationalId(person.nationalId)} · {normalisePhone(person.phone)}
        </span>
        {extra && <span>{extra}</span>}
      </dd>
      <button type="button" className={styles.textButton} onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
        Edit
      </button>
    </div>
  );
}

function StepActions({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className={styles.actions}>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
      <Button onClick={onNext}>Next</Button>
    </div>
  );
}
