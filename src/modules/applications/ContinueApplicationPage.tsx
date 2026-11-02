import { Link, useParams } from "react-router";
import { useApplicationDraft } from "../../api/applications";
import { ApiError } from "../../api/client";
import { NewApplicationPage } from "./NewApplicationPage";
import styles from "./NewApplication.module.css";

/** Continue a paper draft (including one an approver sent back): the New application steps, filled in. */
export function ContinueApplicationPage() {
  const { applicationId = "" } = useParams();
  const { data: draft, isPending, error } = useApplicationDraft(applicationId);

  if (isPending) return <div className={styles.pageLoading} aria-busy="true" aria-label="Opening the draft" />;
  if (error || !draft) {
    const message = error instanceof ApiError && error.status !== 500 ? error.message : "The draft couldn't be opened. Try again.";
    return (
      <>
        <h1 className={styles.title}>Continue {applicationId}</h1>
        <div className={styles.card}>
          <p className={styles.stepIntro} role="alert">
            {message} <Link to={`/applications/${applicationId}`}>Back to {applicationId}</Link>
          </p>
        </div>
      </>
    );
  }
  return <NewApplicationPage key={draft.id} draft={draft} />;
}
