import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/Button";
import { firstName, greeting } from "../lib/format";
import { useAnnounce } from "../modules/dashboard/useAnnounce";
import { TodaySummary } from "../modules/dashboard/TodaySummary";
import { Worklist } from "../modules/dashboard/Worklist";
import { RecordPaymentDialog } from "../modules/payments/RecordPaymentDialog";
import { PortfolioSection } from "../modules/portfolio/PortfolioSection";
import styles from "./DashboardPage.module.css";

/** Which Record payment dialog is open: undefined = closed; null loanId = choose a borrower. */
type PaymentDialogState = { loanId: string | null } | undefined;

export function DashboardPage() {
  const { user, can } = useAuth();
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState>();
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const announce = useAnnounce();

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1>
            {greeting()}, {firstName(user.name)}
          </h1>
          <p className={styles.subtitle}>
            {today} · {user.branch} market
          </p>
        </div>
        {can("payments.record") && (
          <Button className={styles.recordPayment} onClick={() => setPaymentDialog({ loanId: null })}>
            Record payment
          </Button>
        )}
      </div>

      <TodaySummary />
      <Worklist onRecordPayment={(loanId) => setPaymentDialog({ loanId: loanId ?? null })} announce={announce} />
      <PortfolioSection announce={announce} />

      {paymentDialog && (
        <RecordPaymentDialog
          loanId={paymentDialog.loanId ?? undefined}
          onClose={() => setPaymentDialog(undefined)}
          onRecorded={announce}
        />
      )}
    </>
  );
}
