import { useId, useState } from "react";
import { useSystemSettings } from "../../api/settings";
import { ApiError } from "../../api/client";
import { useSendText } from "../../api/texts";
import { Dialog } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
import { firstName } from "../../lib/format";
import { overdueText, SMS_MAX_LENGTH, smsSegments } from "../../lib/sms";
import styles from "./ArrearsPage.module.css";

/** Texts the client of a late loan. The wording is suggested and can be changed before sending. */
export interface TextTarget {
  loanId: string;
  clientName: string;
  phone: string;
  /** 0 when the money is due today rather than late */
  daysLate: number;
  /** UGX due now */
  amount: number;
}

export function SendTextDialog({ target, onClose }: { target: TextTarget; onClose: () => void }) {
  const textId = useId();
  const showToast = useToast();
  const send = useSendText(target.loanId);
  const brand = useSystemSettings().data?.business.shortName ?? "";
  const [message, setMessage] = useState(() => overdueText(brand, target.clientName, target.loanId, target.daysLate, target.amount));
  const text = message.trim();

  const submit = () => {
    if (!text) return;
    send
      .mutateAsync({ message: text })
      .then(() => {
        showToast({ message: `Text sent to ${firstName(target.clientName)}` });
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  const error = send.error instanceof ApiError ? send.error.message : send.error ? "That didn't go through. Try again." : null;
  return (
    <Dialog
      title="Send a text"
      subtitle={`${target.clientName} · ${target.phone}`}
      submitLabel="Send text"
      submittingLabel="Sending…"
      submitting={send.isPending}
      submitDisabled={!text || message.length > SMS_MAX_LENGTH}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <label htmlFor={textId} className={styles.dialogLabel}>
        Message
      </label>
      <textarea id={textId} className={styles.textBox} rows={5} value={message} maxLength={SMS_MAX_LENGTH} onChange={(event) => setMessage(event.target.value)} />
      <p className={styles.count}>
        {message.length} characters · {smsSegments(message)} {smsSegments(message) === 1 ? "text" : "texts"}
      </p>
    </Dialog>
  );
}
