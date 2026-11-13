import { useCallback, useState } from "react";
import { NAVIGATION } from "../../app/navigation";
import { useAuth } from "../../auth/AuthContext";
import { Icon, type IconName } from "../../components/ui/Icon";
import { MenuSheet, MenuSheetButton, type MenuSheetItem } from "../../components/ui/MenuSheet";
import styles from "./LoansMenu.module.css";

const LOAN_PAGES = NAVIGATION.find((item) => item.label === "Loans")?.children ?? [];

/** What each loan page is for, and its picture */
const PAGE_INFO: Record<string, { icon: IconName; text: string }> = {
  "/loans/to-disburse": { icon: "send", text: "Approved and waiting to be paid out" },
  "/loans/active": { icon: "loans", text: "Being repaid right now" },
  "/loans/recovery": { icon: "warning", text: "Handed to the recovery team" },
  "/loans/cleared": { icon: "check", text: "Fully repaid" },
  "/loans/all": { icon: "document", text: "Every loan, whatever its status" },
};

/**
 * Phones only: a "Switch" pill at the top of every Loans page that slides up a sheet with the other loan pages
 * (what each one is for) and, where the page has one, the CSV download. Wider screens have the sidebar instead.
 */
export function LoansMenu({ current, onDownload, downloadDisabled }: { current: string; onDownload?: () => void; downloadDisabled?: boolean }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const items: MenuSheetItem[] = LOAN_PAGES.filter((page) => !page.requires || can(page.requires)).map((page) => ({
    to: page.to!,
    label: page.label,
    icon: PAGE_INFO[page.to!]?.icon ?? "loans",
    text: PAGE_INFO[page.to!]?.text ?? "",
  }));

  return (
    <div className={styles.anchor}>
      <button type="button" className={styles.pill} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className={styles.stack} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        Switch
        <Icon name="chevronDown" size={14} strokeWidth={2.2} />
      </button>
      {open && (
        <MenuSheet
          title="Loans"
          hint={`You're on ${current}. Where to?`}
          items={items}
          onClose={close}
          footer={
            onDownload && (
              <MenuSheetButton
                icon="upload"
                disabled={downloadDisabled}
                onClick={() => {
                  close();
                  onDownload();
                }}
              >
                Download this list as CSV
              </MenuSheetButton>
            )
          }
        />
      )}
    </div>
  );
}
