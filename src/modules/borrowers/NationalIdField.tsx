import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { useRevealNationalId } from "../../api/borrowers";
import { useAuth } from "../../auth/AuthContext";
import { Icon } from "../../components/ui/Icon";
import styles from "./BorrowerProfilePage.module.css";

interface NationalIdFieldProps {
  borrowerId: string;
  /** e.g. "CM••••••••••KL", from the profile */
  masked: string;
}

/**
 * The client's National ID number, masked. "Show" asks the server for the full number (the
 * server records every request in the audit log) and masks it again after the time the server
 * allows, or straight away when the user hides it, switches tab or leaves the page.
 */
export function NationalIdField({ borrowerId, masked }: NationalIdFieldProps) {
  const reveal = useRevealNationalId(borrowerId);
  const { can } = useAuth();
  const [revealed, setRevealed] = useState<{ nationalId: string; secondsLeft: number } | null>(null);
  const { reset } = reveal;

  const hide = () => {
    setRevealed(null);
    reset(); // drop the number from the mutation state too
  };

  // Count down, then mask again
  useEffect(() => {
    if (!revealed) return;
    if (revealed.secondsLeft <= 0) {
      setRevealed(null);
      reset();
      return;
    }
    const timer = window.setTimeout(() => setRevealed((current) => current && { ...current, secondsLeft: current.secondsLeft - 1 }), 1000);
    return () => window.clearTimeout(timer);
  }, [revealed, reset]);

  // Mask it as soon as the page is hidden (another tab, screen locked, app switched)
  useEffect(() => {
    if (!revealed) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        setRevealed(null);
        reset();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [revealed, reset]);

  const show = () =>
    reveal.mutate(undefined, {
      onSuccess: (result) => setRevealed({ nationalId: result.nationalId, secondsLeft: result.visibleForSeconds }),
    });

  const error = reveal.error instanceof ApiError ? reveal.error.message : reveal.error ? "The ID number couldn't be shown. Try again." : null;

  return (
    <>
      <span className={styles.nationalId}>
        <span className={styles.nationalIdValue} aria-live="polite">
          {revealed ? revealed.nationalId : <span aria-label="National ID number hidden">{masked}</span>}
        </span>
        {can("borrowers.nationalId") && (
          <button
            type="button"
            className={styles.revealButton}
            onClick={revealed ? hide : show}
            disabled={reveal.isPending}
            aria-label={revealed ? "Hide National ID number" : "Show National ID number"}
            title={revealed ? "Hide" : "Show the full number (recorded in the audit log)"}
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={17} strokeWidth={1.8} />
          </button>
        )}
      </span>
      {error ? (
        <span role="alert" className={`${styles.fieldHint} ${styles.fieldError}`}>
          {error}
        </span>
      ) : (
        revealed && <span className={styles.fieldHint}>Hides in {revealed.secondsLeft}s · this view is logged</span>
      )}
    </>
  );
}
