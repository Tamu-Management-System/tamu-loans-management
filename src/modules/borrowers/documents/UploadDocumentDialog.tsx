import { useId, useState, type DragEvent } from "react";
import { ApiError } from "../../../api/client";
import { useUploadDocument } from "../../../api/borrowers";
import type { DocumentSlot } from "../../../api/types";
import { Dialog } from "../../../components/ui/Dialog";
import { Icon } from "../../../components/ui/Icon";
import { formatFileSize } from "./documentFormat";
import styles from "./Documents.module.css";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

interface UploadDocumentDialogProps {
  borrowerId: string;
  /** Shown in the title, e.g. "National ID · front" or "Guarantor 1 · Grace Kato" */
  title: string;
  slot: DocumentSlot;
  onClose: () => void;
  onUploaded: (message: string) => void;
}

/** Checks what we can before sending; the server checks the real file type again. */
function problemWith(file: File, pdfOnly: boolean) {
  if (pdfOnly && file.type !== "application/pdf") return "Upload the signed forms scanned into one PDF.";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Choose a JPEG, PNG or PDF file.";
  if (file.size > MAX_BYTES) return `This file is ${formatFileSize(file.size)}. The limit is 5 MB.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}

/** Uploads a missing document or replaces the current one (which is kept as an earlier version). */
export function UploadDocumentDialog({ borrowerId, title, slot, onClose, onUploaded }: UploadDocumentDialogProps) {
  const inputId = useId();
  const upload = useUploadDocument(borrowerId);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const replacing = !!slot.file;
  // The loan application is several signed pages merged into one PDF
  const pdfOnly = slot.canCompleteOnline;
  const problem = file ? problemWith(file, pdfOnly) : null;

  const choose = (chosen: File | undefined) => {
    if (chosen) {
      setFile(chosen);
      upload.reset();
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const submit = () => {
    if (!file || problem) return;
    upload.mutate({ slotKey: slot.key, file }, { onSuccess: () => { onUploaded(`${title} ${replacing ? "replaced" : "uploaded"}.`); onClose(); } });
  };

  const serverError = upload.error instanceof ApiError ? upload.error.message : upload.error ? "The upload didn't work. Try again." : null;

  return (
    <Dialog
      title={`${replacing ? "Replace" : "Upload"} ${title}`}
      subtitle={pdfOnly ? "The signed agreement and both guarantor consents, scanned into one PDF (up to 5 MB)" : "JPEG, PNG or PDF, up to 5 MB"}
      submitLabel={replacing ? "Replace" : "Upload"}
      submittingLabel="Uploading…"
      submitting={upload.isPending}
      submitDisabled={!file || !!problem}
      error={problem ?? serverError}
      onSubmit={submit}
      onClose={onClose}
    >
      <label
        htmlFor={inputId}
        className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" size={22} strokeWidth={1.8} />
        {file ? (
          <span>
            <b>{file.name}</b>
            <span className={styles.dropZoneHint}>{formatFileSize(file.size)} · choose another file</span>
          </span>
        ) : (
          <span>
            <b>Choose a file</b> or drop it here
            <span className={styles.dropZoneHint}>{pdfOnly ? "All three pages, with every signature readable" : "A clear photo or scan, all four corners showing"}</span>
          </span>
        )}
        <input id={inputId} type="file" accept={pdfOnly ? ".pdf,application/pdf" : ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"} className={styles.fileInput} onChange={(event) => choose(event.target.files?.[0])} />
      </label>
      {replacing && <p className={styles.replaceNote}>The current file (version {slot.file!.version}) is kept in the history; nothing is deleted.</p>}
    </Dialog>
  );
}
