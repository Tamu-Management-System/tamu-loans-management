import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import { useDocumentPreview, useDownloadDocument } from "../../../api/borrowers";
import { useAuth } from "../../../auth/AuthContext";
import type { DocumentFile } from "../../../api/types";
import { Dialog } from "../../../components/ui/Dialog";
import { describeFile } from "./documentFormat";
import styles from "./Documents.module.css";

/** Only these are rendered in the page; anything else can only be downloaded. */
const PREVIEWABLE = ["image/jpeg", "image/png", "application/pdf"];

interface DocumentPreviewDialogProps {
  title: string;
  document: DocumentFile;
  /** A loan form (agreement or consent): says whether it was scanned or completed online */
  isForm: boolean;
  onClose: () => void;
}

/**
 * Shows a document inside the app. The file is fetched with the session and shown from memory
 * (a blob: URL that's released on close), never from a direct link to the file.
 */
export function DocumentPreviewDialog({ title, document, isForm, onClose }: DocumentPreviewDialogProps) {
  const preview = useDocumentPreview(document.id);
  const download = useDownloadDocument();
  const canDownload = useAuth().can("documents.download");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // The server's type must be one we expect and allow, or the file isn't rendered
  const fileType = preview.data?.type;
  const canRender = !!fileType && fileType === document.contentType && PREVIEWABLE.includes(fileType);

  useEffect(() => {
    if (!preview.data || !canRender) return;
    const url = URL.createObjectURL(preview.data);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [preview.data, canRender]);

  const loadError = preview.error instanceof ApiError ? preview.error.message : preview.error ? "The document couldn't be opened. Try again." : null;
  const downloadError = download.error instanceof ApiError ? download.error.message : download.error ? "The download didn't work. Try again." : null;

  return (
    <Dialog
      size="large"
      title={title}
      subtitle={describeFile(document, isForm)}
      submitLabel="Download"
      submittingLabel="Downloading…"
      submitting={download.isPending}
      error={downloadError}
      submitDisabled={!canDownload}
      onSubmit={() => download.mutate(document)}
      cancelLabel="Close"
      onClose={onClose}
    >
      <div className={styles.preview}>
        {loadError ? (
          <p className={styles.previewMessage} role="alert">
            {loadError}
          </p>
        ) : preview.isPending ? (
          <div className={styles.previewLoading} aria-busy="true" aria-label="Opening the document" />
        ) : !canRender ? (
          <p className={styles.previewMessage}>This file can't be shown here. Download it to open it.</p>
        ) : objectUrl && document.contentType === "application/pdf" ? (
          <iframe className={styles.previewFrame} src={objectUrl} title={title} />
        ) : objectUrl ? (
          <img className={styles.previewImage} src={objectUrl} alt={title} />
        ) : null}
      </div>
      <p className={styles.previewNote}>Viewing and downloading are recorded in the audit log.</p>
    </Dialog>
  );
}
