import { useId, useState } from "react";
import { useRejectApplication } from "../../api/applications";
import { ApiError } from "../../api/client";
import type { ApplicationDetail, ApplicationRejectionReason } from "../../api/types";
import { Dialog, Field, RadioOption } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
import styles from "./ApplicationReviewPage.module.css";

const REASONS: { value: ApplicationRejectionReason; label: string; description: string }[] = [
  { value: "signature-missing", label: "Signature missing", description: "The client or a guarantor didn't sign somewhere." },
  { value: "details-mismatch", label: "Details don't match the forms", description: "What was typed in differs from the signed forms or the ID." },
  { value: "document-unclear", label: "Document unclear or incomplete", description: "Pages missing, or the scan or photo can't be read." },
  { value: "other", label: "Something else to fix", description: "Explain in the note." },
  { value: "not-eligible", label: "Not eligible", description: "The officer sees why and decides whether to close the application." },
];

/** Sends the application back to the officer with the reason. They fix it and resubmit it, or close it. */
export function RejectApplicationDialog({ application, onClose }: { application: ApplicationDetail; onClose: () => void }) {
  const noteId = useId();
  const showToast = useToast();
  const reject = useRejectApplication(application.id);
  const [reason, setReason] = useState<ApplicationRejectionReason | null>(null);
  const [note, setNote] = useState("");
  const noteRequired = reason === "other" || reason === "not-eligible";

  const submit = () => {
    if (!reason || (noteRequired && !note.trim())) return;
    // The decision panel (and this dialog) go away once it's decided, so confirm from the request itself
    reject
      .mutateAsync({ reason, note: note.trim() || null })
      .then(() => {
        showToast({ message: `${application.id} sent back to ${application.officer.name}.` });
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  const error = reject.error instanceof ApiError ? reject.error.message : reject.error ? "That didn't go through. Try again." : null;
  return (
    <Dialog
      title={`Send back ${application.id}`}
      subtitle={`${application.borrower.name} · ${application.officer.name}`}
      submitLabel="Send back"
      submittingLabel="Sending back…"
      submitting={reject.isPending}
      submitDisabled={!reason || (noteRequired && !note.trim())}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <div role="radiogroup" aria-label="Reason">
        {REASONS.map((option) => (
          <RadioOption key={option.value} name="reason" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} label={option.label} description={option.description} />
        ))}
      </div>
      <Field
        label={noteRequired ? "Note" : "Note (optional)"}
        htmlFor={noteId}
        hint={`${application.officer.name} sees the reason and this note. They fix the application and submit it again, or close it.`}
      >
        <textarea id={noteId} className={styles.note} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Guarantor 2 didn't sign the consent page" />
      </Field>
    </Dialog>
  );
}
