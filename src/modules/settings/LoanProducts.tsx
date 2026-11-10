import { useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { useLoanProducts, useSaveLoanProduct, useSetLoanProductOffered, useSystemSettings } from "../../api/settings";
import type { LoanProduct, ProductLimits, RepaymentSchedule, SaveLoanProductRequest } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatCompactAmount, formatDate, formatUGX } from "../../lib/format";
import { describeLength, latePenalty, ONE_MONTH_OF_PAYMENTS, summariseTerms } from "../../lib/repaymentSchedule";
import { NumberField, Segmented, SettingRow, SettingsGroup } from "./SettingsForm";
import styles from "./Settings.module.css";

const SCHEDULES: { value: RepaymentSchedule; label: string; unit: string }[] = [
  { value: "daily", label: "Daily", unit: "days" },
  { value: "weekly", label: "Weekly", unit: "weeks" },
  { value: "monthly", label: "Monthly", unit: "months" },
];
const scheduleLabel = (schedule: RepaymentSchedule) => SCHEDULES.find((s) => s.value === schedule)!.label;

/** A late fee rule in two short lines: "1% a day" / "after 2 days · up to 10%" */
function shortPenalty(rule: LoanProduct["penalty"]) {
  if (rule.type === "none") return { main: "None", detail: null };
  const charge = rule.type === "percent" ? `${rule.value}%` : formatUGX(rule.value);
  return { main: `${charge} ${rule.per === "day" ? "a day" : "per missed payment"}`, detail: rule.graceDays ? `after ${rule.graceDays} day${rule.graceDays === 1 ? "" : "s"}` : null };
}

/** Settings → Loan products: what officers choose from on a new application. */
export function LoanProductsSection() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: products, isPending, isError, refetch } = useLoanProducts();
  const [showArchived, setShowArchived] = useState(false);
  const shown = (products ?? []).filter((product) => (product.status === "archived") === showArchived);
  const count = (archived: boolean) => products?.filter((product) => (product.status === "archived") === archived).length ?? 0;

  return (
    <section aria-labelledby="products-heading">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="products-heading">Loan products</h2>
          <p className={styles.subtitle}>Officers pick one on every new application; it sets the interest, fees, limits and late fees</p>
        </div>
        {can("settings.products") && (
          <Link to="/settings/products/new" className={styles.primaryLink}>
            New product
          </Link>
        )}
      </div>

      <div className={styles.pills} role="group" aria-label="Products">
        <button type="button" aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>
          On offer <span className={styles.pillCount}>{count(false)}</span>
        </button>
        <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived(true)}>
          Not offered <span className={styles.pillCount}>{count(true)}</span>
        </button>
      </div>

      {isError ? (
        <div className={styles.card}>
          <p className={styles.message} role="alert">
            Loan products couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        </div>
      ) : isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading loan products" />
      ) : shown.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.message}>{showArchived ? "Every product is on offer." : "No products on offer. Officers can't start applications until there's one."}</p>
        </div>
      ) : (
        <div className={styles.card}>
          <table className={styles.productTable}>
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>INTEREST</th>
                <th>AMOUNT</th>
                <th>FEES</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((product) => {
                const late = shortPenalty(product.penalty);
                return (
                  <tr key={product.id} onClick={() => navigate(`/settings/products/${product.id}`)}>
                    <td>
                      <Link to={`/settings/products/${product.id}`} className={styles.productName} onClick={(event) => event.stopPropagation()}>
                        {product.name}
                      </Link>
                      <span className={styles.secondary}>
                        {scheduleLabel(product.repaymentSchedule)} · {describeLength(product.repaymentSchedule, product.numberOfPayments)} · {product.inUse} open
                      </span>
                    </td>
                    <td data-label="Interest">
                      {product.interest.ratePercent}%<span className={styles.secondary}>{product.interest.per === "loan" ? "of the amount" : `a ${product.interest.per}`}</span>
                    </td>
                    <td data-label="Amount">
                      UGX {formatCompactAmount(product.amount.min)} – {formatCompactAmount(product.amount.max)}
                    </td>
                    <td data-label="Fees">
                      {product.fee.type === "none" ? "No fee" : `${product.fee.type === "percent" ? `${product.fee.value}%` : formatUGX(product.fee.value)} fee ${product.fee.collection === "deducted" ? "from payout" : "with repayments"}`}
                      <span className={styles.secondary}>Late: {late.main.toLowerCase()}{late.detail ? `, ${late.detail}` : ""}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const BLANK_PRODUCT: SaveLoanProductRequest = {
  name: "",
  description: "",
  repaymentSchedule: "weekly",
  // Nothing is pre-filled: the admin sets every number, and the checks below say what is missing
  interest: { ratePercent: 0, per: "week" },
  amount: { min: 0, max: 0 },
  numberOfPayments: ONE_MONTH_OF_PAYMENTS.weekly,
  fee: { type: "none", value: 0, collection: "added" },
  penalty: { type: "none", value: 0, per: "missed-payment", graceDays: 0 },
};

/** What's wrong with a product, or null (the API checks the same) */
function productProblem(p: SaveLoanProductRequest, limits: ProductLimits) {
  if (p.name.trim().length < 3) return "Give the product a name.";
  if (p.interest.ratePercent < 0 || p.interest.ratePercent > limits.maxInterestPercent[p.interest.per]) return `Interest: 0 to ${limits.maxInterestPercent[p.interest.per]}%${p.interest.per === "loan" ? "" : ` a ${p.interest.per}`}.`;
  if (p.amount.min < limits.smallestLoan) return `The smallest loan must be at least ${formatUGX(limits.smallestLoan)}.`;
  if (p.amount.max < p.amount.min) return "The biggest loan can't be smaller than the smallest.";
  if (p.amount.max > limits.biggestLoan) return `The biggest loan can be up to ${formatUGX(limits.biggestLoan)}.`;
  if (!Number.isInteger(p.numberOfPayments) || p.numberOfPayments < 1 || p.numberOfPayments > limits.maxPayments) return `Loan length: ${1} to ${limits.maxPayments} payments.`;
  if (p.fee.type === "percent" && p.fee.value > limits.maxFeePercent) return `The fee can be up to ${limits.maxFeePercent}%.`;
  if (p.fee.type === "fixed" && p.fee.value >= p.amount.min) return "A fixed fee must be less than the smallest loan.";
  if (p.penalty.type === "percent" && p.penalty.value > limits.maxLateFeePercent) return `Late fees can be up to ${limits.maxLateFeePercent}% of the overdue amount.`;
  if (p.penalty.graceDays > limits.maxGraceDays) return `Grace days: 0 to ${limits.maxGraceDays}.`;
  return null;
}

/** /settings/products/new (?from=<id> to copy) and /settings/products/:productId */
export function LoanProductEditor() {
  const { productId } = useParams();
  const [searchParams] = useSearchParams();
  const { data: products, isPending, isError, refetch } = useLoanProducts();
  const { data: settings } = useSystemSettings();

  const breadcrumb = (current: string) => (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <Link to="/settings/products">Loan products</Link>
      <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
      <span aria-current="page">{current}</span>
    </nav>
  );
  if (isError)
    return (
      <>
        {breadcrumb("Product")}
        <p className={styles.message} role="alert">
          The product couldn't load.{" "}
          <button type="button" className={styles.linkButton} onClick={() => refetch()}>
            Try again
          </button>
        </p>
      </>
    );
  if (isPending || !settings) return <div className={styles.loading} aria-busy="true" aria-label="Loading the product" />;
  const product = productId ? products.find((p) => p.id === productId) : undefined;
  if (productId && !product)
    return (
      <>
        {breadcrumb("Product")}
        <p className={styles.message}>This product doesn't exist.</p>
      </>
    );
  const copyOf = !product ? products.find((p) => p.id === searchParams.get("from")) : undefined;
  return (
    <>
      {breadcrumb(product?.name ?? "New product")}
      <ProductForm key={product?.id ?? `new-${copyOf?.id ?? ""}`} product={product ?? null} copyOf={copyOf} limits={settings.loanRules.productLimits} />
    </>
  );
}

function ProductForm({ product, copyOf, limits }: { product: LoanProduct | null; copyOf: LoanProduct | undefined; limits: ProductLimits }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const { can } = useAuth();
  const canEdit = can("settings.products");
  const save = useSaveLoanProduct();
  const setOffered = useSetLoanProductOffered();
  const ids = { name: useId(), description: useId(), rate: useId(), minAmount: useId(), maxAmount: useId(), length: useId(), fee: useId(), penalty: useId(), grace: useId() };
  const start = product ?? copyOf;
  const [form, setForm] = useState<SaveLoanProductRequest>(() => {
    if (!start) return BLANK_PRODUCT;
    const { name, description, repaymentSchedule, interest, amount, numberOfPayments, fee, penalty } = start;
    return structuredClone({ name: product ? name : `${name} (copy)`, description, repaymentSchedule, interest, amount, numberOfPayments, fee, penalty });
  });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof SaveLoanProductRequest>(key: K, value: SaveLoanProductRequest[K]) => setForm((before) => ({ ...before, [key]: value }));
  const problem = productProblem(form, limits);
  const scheduleLocked = !!product && product.inUse > 0;
  const unit = SCHEDULES.find((s) => s.value === form.repaymentSchedule)!.unit;

  // A worked example, so the admin sees what a client would pay
  const [exampleAmount, setExampleAmount] = useState<number | null>(null);
  const amount = Math.min(form.amount.max, Math.max(form.amount.min, exampleAmount ?? (Math.round((form.amount.min + form.amount.max) / 2 / 100_000) * 100_000 || form.amount.min)));
  const payments = Math.max(1, form.numberOfPayments);
  const example = useMemo(() => {
    if (problem && problem !== "Give the product a name.") return null;
    const pricing = { productName: form.name, interestRatePercent: form.interest.ratePercent, interestPer: form.interest.per, fee: form.fee };
    const summary = summariseTerms({ amount, repaymentSchedule: form.repaymentSchedule, firstPaymentOn: new Date().toLocaleDateString("en-CA"), numberOfPayments: payments, pricing });
    const lateFee = latePenalty(form.penalty, { overdue: summary.instalment, daysLate: 7, missedPayments: 1, principal: amount });
    return { summary, lateFee };
  }, [form, amount, payments, problem]);

  const submit = () => {
    setTouched(true);
    if (problem) return;
    save
      .mutateAsync({ productId: product?.id ?? null, ...form })
      .then((saved) => {
        showToast({ message: product ? `${saved.name} is saved. New applications use the change.` : `${saved.name} is on offer.` });
        navigate("/settings/products");
      })
      .catch(() => undefined);
  };
  const toggleOffered = () =>
    product &&
    setOffered
      .mutateAsync({ productId: product.id, offered: product.status === "archived" })
      .then(() => showToast({ message: product.status === "archived" ? `${product.name} is on offer again.` : `${product.name} is no longer offered. Its open loans carry on as agreed.` }))
      .catch((err) => showToast({ message: err instanceof ApiError ? err.message : "That didn't go through. Try again." }));

  const error = save.error instanceof ApiError ? save.error.message : save.error ? "The product couldn't be saved. Try again." : null;
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className={styles.sectionHeader}>
        <div>
          <h2>
            {product ? product.name : "New product"}
            {product?.status === "archived" && <span className={`${styles.chip} ${styles.chipNeutral} ${styles.headingChip}`}>Not offered</span>}
          </h2>
          <p className={styles.subtitle}>{product ? "Changes apply to new applications only. Open loans keep the terms they were given." : "Set the terms officers can offer."}</p>
          {product && (
            <p className={styles.metaLine}>
              {product.inUse} open loans and applications · Last changed {formatDate(product.updatedAt)} by {product.updatedBy}
            </p>
          )}
        </div>
        {product && canEdit && (
          <div className={styles.headerActions}>
            <Link to={`/settings/products/new?from=${encodeURIComponent(product.id)}`} className={styles.secondaryLinkButton}>
              Copy
            </Link>
            <Button variant="secondary" onClick={toggleOffered} disabled={setOffered.isPending}>
              {product.status === "archived" ? "Offer again" : "Stop offering"}
            </Button>
          </div>
        )}
      </div>

      <div className={styles.productLayout}>
        <fieldset className={`${styles.settingsFieldset} ${styles.formLayout}`} disabled={!canEdit}>
          <SettingsGroup title="Product">
            <SettingRow label="Name" htmlFor={ids.name} description="Officers and clients see this.">
              <input id={ids.name} className={styles.textInput} value={form.name} onChange={(event) => set("name", event.target.value)} maxLength={40} autoComplete="off" autoFocus={!product} />
            </SettingRow>
            <SettingRow label="Who it's for" htmlFor={ids.description}>
              <input id={ids.description} className={styles.textInput} value={form.description} onChange={(event) => set("description", event.target.value)} maxLength={120} placeholder="e.g. Market traders who earn daily" autoComplete="off" />
            </SettingRow>
            <SettingRow label="Repaid" description={scheduleLocked ? "Fixed while loans use it. Copy the product to change it." : "How often the client pays."}>
              {scheduleLocked ? (
                <span className={styles.lockedValue}>{scheduleLabel(form.repaymentSchedule)}</span>
              ) : (
                <Segmented
                  label="Repaid"
                  value={form.repaymentSchedule}
                  // Switching how often it's repaid resets the length to one month of payments
                  onChange={(value) => setForm((before) => ({ ...before, repaymentSchedule: value, numberOfPayments: ONE_MONTH_OF_PAYMENTS[value] }))}
                  options={SCHEDULES.map(({ value, label }) => ({ value, label }))}
                />
              )}
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Interest">
            <SettingRow label="Rate" htmlFor={ids.rate} description={form.interest.per === "loan" ? "Charged once on the amount borrowed." : `Charged for every ${form.interest.per} the loan runs.`}>
              <span className={styles.controlStack}>
                <NumberField id={ids.rate} value={form.interest.ratePercent} onChange={(ratePercent) => set("interest", { ...form.interest, ratePercent })} min={0} max={limits.maxInterestPercent[form.interest.per]} unit="%" allowDecimal />
                <Segmented
                  label="Interest charged"
                  value={form.interest.per}
                  onChange={(per) => set("interest", { ...form.interest, per })}
                  options={[
                    { value: "day", label: "Per day" },
                    { value: "week", label: "Per week" },
                    { value: "month", label: "Per month" },
                    { value: "loan", label: "Once" },
                  ]}
                />
              </span>
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Limits" description="Officers can't offer anything outside these.">
            <SettingRow label="Amount" htmlFor={ids.minAmount}>
              <span className={styles.rangeControl}>
                <NumberField id={ids.minAmount} label="Smallest amount" value={form.amount.min} onChange={(min) => set("amount", { ...form.amount, min })} min={limits.smallestLoan} max={limits.biggestLoan} step={50_000} unit="UGX" unitBefore wide />
                <span aria-hidden="true">to</span>
                <NumberField id={ids.maxAmount} label="Biggest amount" value={form.amount.max} onChange={(max) => set("amount", { ...form.amount, max })} min={form.amount.min} max={limits.biggestLoan} step={50_000} unit="UGX" unitBefore wide />
              </span>
            </SettingRow>
            <SettingRow label="Loan length" htmlFor={ids.length} description={`The client makes ${form.numberOfPayments} ${form.repaymentSchedule} payment${form.numberOfPayments === 1 ? "" : "s"}.`}>
              <NumberField id={ids.length} value={form.numberOfPayments} onChange={(value) => set("numberOfPayments", value)} min={1} max={limits.maxPayments} unit={unit} />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Fee" description="A one-off charge when the loan is paid out, e.g. a processing fee.">
            <SettingRow label="Fee" htmlFor={ids.fee}>
              <span className={styles.controlStack}>
                <Segmented
                  label="Fee"
                  value={form.fee.type}
                  onChange={(type) => set("fee", { ...form.fee, type, value: type === "none" ? 0 : form.fee.value })}
                  options={[
                    { value: "none", label: "None" },
                    { value: "percent", label: "% of amount" },
                    { value: "fixed", label: "Fixed" },
                  ]}
                />
                {form.fee.type !== "none" && (
                  <NumberField id={ids.fee} value={form.fee.value} onChange={(value) => set("fee", { ...form.fee, value })} min={0} max={form.fee.type === "percent" ? 20 : form.amount.min - 1} unit={form.fee.type === "percent" ? "%" : "UGX"} unitBefore={form.fee.type === "fixed"} wide={form.fee.type === "fixed"} allowDecimal={form.fee.type === "percent"} />
                )}
              </span>
            </SettingRow>
            {form.fee.type !== "none" && (
              <SettingRow label="Collected" description={form.fee.collection === "deducted" ? "The client receives the amount less the fee." : "The client receives the full amount and repays the fee with the instalments."}>
                <Segmented
                  label="Fee collected"
                  value={form.fee.collection}
                  onChange={(collection) => set("fee", { ...form.fee, collection })}
                  options={[
                    { value: "deducted", label: "From the payout" },
                    { value: "added", label: "With the repayments" },
                  ]}
                />
              </SettingRow>
            )}
          </SettingsGroup>

          <SettingsGroup title="Late fees" description="Charged when an instalment isn't paid on time, as Tamu's agreement allows.">
            <SettingRow label="Late fee" htmlFor={ids.penalty}>
              <span className={styles.controlStack}>
                <Segmented
                  label="Late fee"
                  value={form.penalty.type}
                  onChange={(type) => set("penalty", { ...form.penalty, type, value: type === "none" ? 0 : form.penalty.value || (type === "percent" ? 5 : 5_000) })}
                  options={[
                    { value: "none", label: "None" },
                    { value: "percent", label: "% of overdue" },
                    { value: "fixed", label: "Fixed" },
                  ]}
                />
                {form.penalty.type !== "none" && (
                  <NumberField id={ids.penalty} value={form.penalty.value} onChange={(value) => set("penalty", { ...form.penalty, value })} min={0} max={form.penalty.type === "percent" ? 20 : 10_000_000} unit={form.penalty.type === "percent" ? "%" : "UGX"} unitBefore={form.penalty.type === "fixed"} wide={form.penalty.type === "fixed"} allowDecimal={form.penalty.type === "percent"} />
                )}
              </span>
            </SettingRow>
            {form.penalty.type !== "none" && (
              <>
                <SettingRow label="Charged">
                  <Segmented
                    label="Late fee charged"
                    value={form.penalty.per}
                    onChange={(per) => set("penalty", { ...form.penalty, per })}
                    options={[
                      { value: "missed-payment", label: "Once per missed payment" },
                      { value: "day", label: "Every day late" },
                    ]}
                  />
                </SettingRow>
                <SettingRow label="Grace period" htmlFor={ids.grace} description="Days after the due date before anything is charged.">
                  <NumberField id={ids.grace} value={form.penalty.graceDays} onChange={(graceDays) => set("penalty", { ...form.penalty, graceDays })} min={0} max={30} unit="days" />
                </SettingRow>
              </>
            )}
          </SettingsGroup>
        </fieldset>

        <aside className={styles.preview} aria-label="Example loan">
          <h3>Example loan</h3>
          {example ? (
            <>
              <label className={styles.previewAmount}>
                <span>Borrowing</span>
                <NumberField label="Example amount" value={amount} onChange={setExampleAmount} min={form.amount.min} max={form.amount.max} step={50_000} unit="UGX" unitBefore wide />
              </label>
              <p className={styles.previewTerms}>
                {payments} {form.repaymentSchedule} payment{payments === 1 ? "" : "s"}
              </p>
              <dl className={styles.previewFigures}>
                <div>
                  <dt>Interest</dt>
                  <dd>{formatUGX(example.summary.interest)}</dd>
                </div>
                {example.summary.fee > 0 && (
                  <div>
                    <dt>Fee ({form.fee.collection === "deducted" ? "from payout" : "repaid"})</dt>
                    <dd>{formatUGX(example.summary.fee)}</dd>
                  </div>
                )}
                <div>
                  <dt>Client receives</dt>
                  <dd>{formatUGX(example.summary.payout)}</dd>
                </div>
                <div className={styles.previewTotal}>
                  <dt>Total to repay</dt>
                  <dd>{formatUGX(example.summary.totalRepayable)}</dd>
                </div>
                <div>
                  <dt>Each payment</dt>
                  <dd>{formatUGX(example.summary.instalment)}</dd>
                </div>
                <div>
                  <dt>Late fee (7 days)</dt>
                  <dd>{example.lateFee > 0 ? formatUGX(example.lateFee) : "None"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className={styles.previewEmpty}>Fix the terms to see an example.</p>
          )}
        </aside>
      </div>

      {canEdit && (
        <div className={styles.formFooter}>
          {((touched && problem) || error) && (
            <p className={styles.formError} role="alert">
              {(touched && problem) || error}
            </p>
          )}
          <div className={styles.formButtons}>
            <Button variant="secondary" onClick={() => navigate("/settings/products")}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : product ? "Save changes" : "Create product"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
