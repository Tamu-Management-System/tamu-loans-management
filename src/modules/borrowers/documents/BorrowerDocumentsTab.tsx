import { useState } from "react";
import { ApiError } from "../../../api/client";
import { useBorrowerDocuments, useCreateOnlineLink } from "../../../api/borrowers";
import type { DocumentFile, DocumentSlot } from "../../../api/types";
import { useAuth } from "../../../auth/AuthContext";
import { Icon } from "../../../components/ui/Icon";
import { useToast } from "../../../components/ui/Toast";
import { formatDate, formatRelativeDay } from "../../../lib/format";
import chipStyles from "../BorrowerStatusChip.module.css";
import { describeFile } from "./documentFormat";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";
import { OnlineLinkDialog } from "./OnlineLinkDialog";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import styles from "./Documents.module.css";


/** What a row says when there's nothing uploaded yet. */
function missingText(slot: DocumentSlot) {
  if (slot.onlineRequest) return `Online link sent ${formatRelativeDay(slot.onlineRequest.createdAt)} by ${slot.onlineRequest.createdBy} · not completed yet · link expires ${formatDate(slot.onlineRequest.expiresAt)}`;
  if (slot.canCompleteOnline) return "Not done yet: upload the signed forms scanned into one PDF, or send an online link";
  return slot.required ? "Not uploaded yet" : "Optional · not provided";
}

/**
 * The borrower's documents (Tamu's forms, loan-docs/): their ID copy, then for each loan or
 * application the guarantors (entered by the officer) and, as proof, the signed loan application:
 * the payment agreement and both guarantor consents in one PDF. It's either signed on paper and
 * scanned, or completed online through a link the officer sends (e.g. on WhatsApp). Nothing can
 * be deleted.
 */
export function BorrowerDocumentsTab({ borrowerId }: { borrowerId: string }) {
  const { can } = useAuth();
  const showToast = useToast();
  const { data, isPending, isError, refetch } = useBorrowerDocuments(borrowerId);
  const createLink = useCreateOnlineLink(borrowerId);
  const [viewing, setViewing] = useState<{ title: string; document: DocumentFile; isForm: boolean } | null>(null);
  const [uploading, setUploading] = useState<{ title: string; slot: DocumentSlot } | null>(null);
  const [linkToShare, setLinkToShare] = useState<{ title: string; url: string; expiresAt: string } | null>(null);
  const canManage = can("documents.upload");
  const canView = can("documents.view");
  const canLink = can("applications.onlineLink");

  const copyOnlineLink = (slot: DocumentSlot) => {
    const replacing = !!slot.onlineRequest;
    createLink.mutate(slot.key, {
      onSuccess: async (link) => {
        try {
          await navigator.clipboard.writeText(link.url);
          showToast({ message: `Link copied${replacing ? " (the earlier link no longer works)" : ""}. Paste it into WhatsApp; it works once, until ${formatDate(link.expiresAt)}.` });
        } catch {
          // Clipboard blocked: show the link so it can be copied by hand
          setLinkToShare({ title: slot.label, url: link.url, expiresAt: link.expiresAt });
        }
      },
      onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "The link couldn't be created. Try again." }),
    });
  };

  if (isError) {
    return (
      <div className={styles.card}>
        <p className={styles.message} role="alert">
          The documents couldn't load.{" "}
          <button type="button" className={styles.linkButton} onClick={() => refetch()}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (isPending) return <div className={styles.loading} aria-busy="true" aria-label="Loading documents" />;

  const missing = data.sections.flatMap((section) => section.slots.filter((slot) => slot.required && !slot.file).map((slot) => ({ section, slot })));

  return (
    <div className={styles.sections}>
      {missing.length > 0 && (
        <p className={styles.missingAlert} role="note">
          <Icon name="warning" size={16} strokeWidth={1.9} />
          <span>
            <b>{missing.length === 1 ? "1 required document is missing:" : `${missing.length} required documents are missing:`}</b>{" "}
            {missing.map(({ section, slot }) => `${slot.label}${section.id.includes("-") ? ` (${section.id})` : ""}`).join(", ")}.
          </span>
        </p>
      )}

      {/* Identity holds ID photos from the online form; paper borrowers' IDs are in the signed PDF, so hide it when empty */}
      {data.sections.filter((section) => section.id !== "identity" || section.slots.some((slot) => slot.file)).map((section) => {
        const missingHere = section.slots.filter((slot) => slot.required && !slot.file).length;
        return (
          <section key={section.id} className={styles.card} aria-labelledby={`documents-${section.id}`}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id={`documents-${section.id}`} className={styles.sectionTitle}>
                  {section.title}
                </h2>
                {section.subtitle && <p className={styles.sectionSubtitle}>{section.subtitle}</p>}
              </div>
              {missingHere > 0 && <span className={`${chipStyles.chip} ${chipStyles.chipDanger}`}>{missingHere} missing</span>}
            </div>

            {section.guarantors && (
              <dl className={styles.guarantors}>
                {section.guarantors.map((guarantor, index) => (
                  <div key={index} className={styles.guarantor}>
                    <dt>Guarantor {index + 1}</dt>
                    <dd>
                      <b>{guarantor.name}</b>
                      <span>
                        {guarantor.relationship ? `${guarantor.relationship} · ` : ""}ID {guarantor.nationalIdMasked} · {guarantor.phone}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <ul className={styles.rows}>
              {section.slots.map((slot) => {
                const title = slot.label;
                const file = slot.file;
                const isForm = slot.canCompleteOnline;
                return (
                  <li key={slot.key} className={styles.row}>
                    <span className={`${styles.fileIcon} ${!file ? styles.fileIconEmpty : ""}`} aria-hidden="true">
                      <Icon name={isForm || file?.contentType === "application/pdf" ? "document" : "image"} size={18} strokeWidth={1.8} />
                    </span>
                    <div className={styles.rowText}>
                      <span className={styles.rowTitle}>{title}</span>
                      {isForm && <span className={styles.rowDetail}>Payment agreement + both guarantor consents, in one PDF</span>}
                      <span className={`${styles.rowDetail} ${!file && slot.onlineRequest ? styles.rowDetailWaiting : ""}`}>{file ? describeFile(file, isForm) : missingText(slot)}</span>
                    </div>
                    <div className={styles.rowActions}>
                      {!file && slot.required && !slot.onlineRequest && <span className={`${chipStyles.chip} ${chipStyles.chipDanger}`}>Missing</span>}
                      {!file && slot.onlineRequest && <span className={`${chipStyles.chip} ${chipStyles.chipWarning}`}>Waiting</span>}
                      {file && canView && (
                        <button type="button" className={styles.actionButton} onClick={() => setViewing({ title, document: file, isForm })} aria-label={`View ${title}`}>
                          View
                        </button>
                      )}
                      {canLink && !file && isForm && (
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                          onClick={() => copyOnlineLink(slot)}
                          disabled={createLink.isPending && createLink.variables === slot.key}
                          aria-label={`Copy an online link for ${title}`}
                          title={slot.onlineRequest ? "Creates a new link; the earlier one stops working" : "For borrowers and guarantors with a smartphone"}
                        >
                          <Icon name="link" size={15} strokeWidth={1.9} />
                          {slot.onlineRequest ? "Copy new link" : "Copy online link"}
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className={file || isForm ? styles.actionButton : `${styles.actionButton} ${styles.actionButtonPrimary}`}
                          onClick={() => setUploading({ title, slot })}
                          aria-label={`${file ? "Replace" : "Upload"} ${title}`}
                        >
                          {file ? "Replace" : isForm ? "Upload signed PDF" : "Upload"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {viewing && <DocumentPreviewDialog title={viewing.title} document={viewing.document} isForm={viewing.isForm} onClose={() => setViewing(null)} />}
      {uploading && (
        <UploadDocumentDialog borrowerId={borrowerId} title={uploading.title} slot={uploading.slot} onClose={() => setUploading(null)} onUploaded={(message) => showToast({ message })} />
      )}
      {linkToShare && <OnlineLinkDialog {...linkToShare} onClose={() => setLinkToShare(null)} />}
    </div>
  );
}
