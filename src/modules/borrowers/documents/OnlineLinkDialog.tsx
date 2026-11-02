import { useId } from "react";
import { Dialog, Field } from "../../../components/ui/Dialog";
import { formatDate } from "../../../lib/format";

interface OnlineLinkDialogProps {
  title: string;
  url: string;
  expiresAt: string;
  onClose: () => void;
}

/** Shown only when the browser blocks copying: the link to copy by hand and send on WhatsApp. */
export function OnlineLinkDialog({ title, url, expiresAt, onClose }: OnlineLinkDialogProps) {
  const id = useId();
  return (
    <Dialog title="Send this link" subtitle={title} submitLabel="Done" onSubmit={onClose} onClose={onClose} cancelLabel="Close">
      <Field label="Online link" htmlFor={id} hint={`Copy it into WhatsApp. It works once, until ${formatDate(expiresAt)}. Don't share it anywhere else.`}>
        <input id={id} value={url} readOnly onFocus={(event) => event.target.select()} autoFocus />
      </Field>
    </Dialog>
  );
}
