// The demo's sample data, generated from the current rules so every number on screen adds up:
// - clients with the client's fields (gender, address, shop / premises, next of kin, other phone);
// - loans made from the loan products (one month long by default), each with its real repayment
//   schedule and payments that follow the client's habits (on time, often late, or stopped paying);
// - each client's earlier loans, repaid in full, before the current one;
// - applications at every stage, with guarantors and their relationship to the client.
// A fixed seed makes it the same every time. Import this module before reading any sample data.
import type { LoanPayment, LoanProduct, PaymentMethod, RepaymentSchedule } from "../api/types";
import { paymentDate, summariseTerms } from "../lib/repaymentSchedule";
import { borrowerDetails } from "./borrowerProfiles";
import { borrowers, type MockBorrower } from "./borrowerDirectory";
import { applications, loans, officers, OFFICER_IDS, type MockApplication } from "./fixtures";
import { pastLoans } from "./loanHistory";
import { seedLoanPayments } from "./loanPayments";
import { loanProducts, pricingOf } from "./systemSettings";

// ---------- Randomness and dates ----------

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(20261102);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
const digits = (count: number) => Array.from({ length: count }, () => Math.floor(random() * 10)).join("");
const letters = (count: number) => Array.from({ length: count }, () => String.fromCharCode(65 + Math.floor(random() * 26))).join("");
const roundTo = (amount: number, step: number) => Math.round(amount / step) * step;

const TODAY = new Date().toLocaleDateString("en-CA");
const day = (offset: number) => paymentDate(TODAY, "daily", offset);
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);
const isoAt = (date: string, hour: number, minute: number) => new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const ago = (days: number, hour = 10) => isoAt(day(-days), hour, between(0, 59));

// ---------- People ----------

const FEMALE_NAMES = ["Aisha", "Agnes", "Annet", "Betty", "Brenda", "Christine", "Diana", "Doreen", "Esther", "Fatuma", "Florence", "Grace", "Harriet", "Joan", "Joyce", "Juliet", "Lillian", "Margaret", "Mercy", "Patience", "Phiona", "Prossy", "Rebecca", "Rose", "Ruth", "Shamim", "Stella", "Sylvia", "Winnie", "Zaituni"];
const MALE_NAMES = ["Allan", "Arthur", "Brian", "Charles", "Collins", "Daniel", "Denis", "Derrick", "Edward", "Emmanuel", "Gerald", "Hakim", "Hassan", "Henry", "Isaac", "Ivan", "John", "Joseph", "Julius", "Kenneth", "Martin", "Moses", "Nicholas", "Patrick", "Paul", "Peter", "Robert", "Ronald", "Samuel", "Simon"];
const SURNAMES = ["Ainembabazi", "Akello", "Atuhaire", "Auma", "Babirye", "Byaruhanga", "Kasozi", "Kato", "Kiggundu", "Kizito", "Lubega", "Mugisha", "Mukasa", "Mwesige", "Nabirye", "Nakato", "Nakimuli", "Nalwoga", "Namutebi", "Nansubuga", "Nantongo", "Ochieng", "Okello", "Opio", "Ssebunya", "Ssemanda", "Tumusiime", "Turyahikayo", "Waiswa", "Wasswa"];
const ADDRESSES = ["Kisenyi, Kampala Central", "Kawempe, Kampala", "Nakawa, Kampala", "Ntinda, Kampala", "Kireka, Wakiso", "Bwaise, Kawempe", "Katwe, Makindye", "Mengo, Rubaga", "Kasubi, Rubaga", "Nateete, Rubaga", "Wandegeya, Kampala", "Kalerwe, Kawempe", "Banda, Nakawa", "Bweyogerere, Wakiso", "Mukono town", "Seeta, Mukono", "Kyebando, Kawempe", "Kiwatule, Nakawa", "Makindye, Kampala", "Kansanga, Makindye", "Najjera, Wakiso", "Namuwongo, Makindye"];
const OCCUPATIONS = ["Market vendor", "Tailor", "Hairdresser", "Shop owner", "Food seller", "Boda boda rider", "Mechanic", "Fruit seller", "Butcher", "Fish monger", "Charcoal seller", "Phone accessories seller"];
const PREMISES = ["Owino market, stall {n}", "Nakasero market, stall {n}", "Kikuubo Lane, shop {n}", "Kalerwe market, stall {n}", "Nakawa market, block C {n}", "Wandegeya, plot {n}", "Ntinda shopping centre, shop {n}", "Kireka stage, kiosk {n}", "Bwaise trading centre, shop {n}", "Katwe junction, workshop {n}", "Kasubi market, stall {n}", "Mengo, Kabaka Anjagala Rd, shop {n}"];
const KIN_RELATIONSHIPS = ["Spouse", "Sister", "Brother", "Mother", "Father", "Cousin", "Aunt", "Uncle"];
const GUARANTOR_RELATIONSHIPS = ["Sister", "Brother", "Friend", "Workmate", "Neighbour", "Cousin", "Landlord", "Spouse"];
const PHONE_PREFIXES = ["0772", "0701", "0756", "0782", "0774", "0703", "0758", "0779", "0751", "0785"];

const usedNames = new Set<string>();
function personName(gender: "female" | "male") {
  let name = "";
  do name = `${pick(gender === "female" ? FEMALE_NAMES : MALE_NAMES)} ${pick(SURNAMES)}`;
  while (usedNames.has(name));
  usedNames.add(name);
  return name;
}
const phone = () => `${pick(PHONE_PREFIXES)} ${digits(3)} ${digits(3)}`;
/** Ugandan NIN: CM (male) or CF (female), 10 digits, 2 letters */
const nin = (gender: "female" | "male") => `C${gender === "female" ? "F" : "M"}${digits(10)}${letters(2)}`;

function newPerson() {
  const gender = random() < 0.58 ? "female" : "male";
  const name = personName(gender);
  const kinGender = random() < 0.5 ? "female" : "male";
  return {
    gender: gender as "female" | "male",
    name,
    nin: nin(gender),
    phone: phone(),
    secondaryPhone: random() < 0.45 ? phone() : null,
    area: pick(ADDRESSES),
    premises: pick(PREMISES).replace("{n}", String(between(1, 60))),
    occupation: random() < 0.85 ? pick(OCCUPATIONS) : "",
    nextOfKin: { name: `${pick(kinGender === "female" ? FEMALE_NAMES : MALE_NAMES)} ${name.split(" ")[1]}`, phone: phone(), relationship: pick(KIN_RELATIONSHIPS) },
  };
}

export function guarantorPair(borrowerName: string) {
  return [0, 1].map(() => {
    const gender = random() < 0.5 ? "female" : "male";
    return { fullName: personName(gender), nationalId: nin(gender), phone: phone(), relationship: pick(GUARANTOR_RELATIONSHIPS) };
  }).filter((g) => g.fullName !== borrowerName);
}

// ---------- Loans ----------

const activeProduct = (schedule: RepaymentSchedule) => loanProducts.find((p) => p.status === "active" && p.repaymentSchedule === schedule)!;
const preferredSchedule = (): RepaymentSchedule => {
  const draw = random();
  return draw < 0.25 ? "daily" : draw < 0.8 ? "weekly" : "monthly";
};

/** steady: pays on time · late: often a few days late · slipped: fell far behind, then caught up (earlier loans) · stopped: stopped paying */
type Habit = "steady" | "late" | "slipped" | "stopped";
const PAYOUT_BY = ["Moses Okot", "Joan Nansubuga"];
const METHOD_WEIGHTS: PaymentMethod[] = ["MTN MoMo", "MTN MoMo", "MTN MoMo", "Airtel Money", "Airtel Money", "Cash"];

interface SimulatedLoan {
  product: LoanProduct;
  principal: number;
  disbursedOn: string;
  firstPaymentOn: string;
  numberOfPayments: number;
  instalment: number;
  totalRepayable: number;
  payments: Omit<LoanPayment, "id" | "canEdit" | "edits">[];
  paid: number;
  /** Instalments not yet paid, in order */
  unpaid: { dueOn: string; amount: number }[];
  mostDaysLate: number;
  lastPaidOn: string | null;
}

/** How long (in days) a product's loan runs, for spacing loans out */
const lengthInDays = (product: LoanProduct) => product.numberOfPayments * { daily: 1, weekly: 7, monthly: 30 }[product.repaymentSchedule];

/**
 * A loan from payout to today: its schedule, and the payments the client made (none today yet:
 * today's instalments are still to collect). "stopped" clients pay `stopAfter` instalments, then nothing.
 */
function simulateLoan(product: LoanProduct, principal: number, disbursedOn: string, habit: Habit, method: PaymentMethod, recordedBy: string, stopAfter = Infinity): SimulatedLoan {
  const numberOfPayments = product.numberOfPayments;
  const firstPaymentOn = paymentDate(disbursedOn, product.repaymentSchedule, 1);
  const terms = summariseTerms({ amount: principal, repaymentSchedule: product.repaymentSchedule, firstPaymentOn, numberOfPayments, pricing: pricingOf(product) });
  const payments: SimulatedLoan["payments"] = [];
  const unpaid: SimulatedLoan["unpaid"] = [];
  let paid = 0;
  let mostDaysLate = 0;
  let lastPaidOn: string | null = null;
  let behind = false;
  for (let index = 0; index < numberOfPayments; index++) {
    const dueOn = paymentDate(firstPaymentOn, product.repaymentSchedule, index);
    const amount = index === numberOfPayments - 1 ? terms.finalInstalment : terms.instalment;
    const delay =
      habit === "steady" ? (random() < 0.85 ? 0 : 1) : habit === "late" ? between(0, product.repaymentSchedule === "daily" ? 3 : 9) : habit === "slipped" ? between(15, 40) : between(0, 4);
    // Paid in order, never before the previous one
    const paidOn: string = [paymentDate(dueOn, "daily", delay), lastPaidOn ?? ""].sort().at(-1)!;
    if (behind || index >= stopAfter || paidOn >= TODAY) {
      behind = true;
      unpaid.push({ dueOn, amount });
      continue;
    }
    mostDaysLate = Math.max(mostDaysLate, daysBetween(dueOn, paidOn));
    lastPaidOn = paidOn;
    paid += amount;
    const paymentMethod = random() < 0.8 ? method : pick(METHOD_WEIGHTS);
    const stamp = paidOn.slice(2).replace(/-/g, "");
    payments.push({
      paidAt: isoAt(paidOn, between(8, 17), between(0, 59)),
      amount,
      method: paymentMethod,
      reference: paymentMethod === "Cash" ? null : `${paymentMethod === "MTN MoMo" ? "MP" : "AT"}${stamp}.${digits(4)}`,
      recordedBy,
    });
  }
  return { product, principal, disbursedOn, firstPaymentOn, numberOfPayments, instalment: terms.instalment, totalRepayable: terms.totalRepayable, payments, paid, unpaid, mostDaysLate, lastPaidOn };
}

const clampAmount = (product: LoanProduct, amount: number) => Math.min(product.amount.max, Math.max(product.amount.min, roundTo(amount, 50_000)));

// ---------- Clients and their loans ----------

/** How many clients each officer looks after */
const PORTFOLIO_SIZES: Record<string, number> = { [OFFICER_IDS.sharon]: 42, [OFFICER_IDS.joel]: 38, [OFFICER_IDS.sarah]: 36, [OFFICER_IDS.peter]: 36, [OFFICER_IDS.ruth]: 32 };

interface Draft {
  person: ReturnType<typeof newPerson>;
  officerId: string;
  registeredOn: string;
  history: SimulatedLoan[];
  current: (SimulatedLoan & { habit: Habit }) | null;
}

function buildBorrower(officerId: string): Draft {
  const person = newPerson();
  const officerName = officers.find((o) => o.id === officerId)!.name;
  const product = activeProduct(preferredSchedule());
  const method = pick(METHOD_WEIGHTS);
  const draw = random();
  const habit: Habit = draw < 0.8 ? "steady" : draw < 0.92 ? "late" : "stopped";
  const length = lengthInDays(product);

  // The current loan: in progress for most; a few have repaid and not borrowed again yet
  let current: Draft["current"] = null;
  let anchor: string; // the earlier loans end before this date
  if (random() < 0.1) {
    anchor = day(-between(3, 45));
  } else {
    const ageDays = habit === "stopped" ? between(length + 5, length + 130) : habit === "late" ? between(Math.round(length * 0.4), length + 20) : between(1, Math.max(1, length - 1));
    const disbursedOn = day(-ageDays);
    const principal = clampAmount(product, product.amount.min + random() * (product.amount.max - product.amount.min) * 0.35);
    const stopAfter = habit === "stopped" ? between(0, Math.max(0, product.numberOfPayments - 2)) : Infinity;
    current = { ...simulateLoan(product, principal, disbursedOn, habit, method, officerName, stopAfter), habit };
    anchor = disbursedOn;
  }

  // Earlier loans, repaid in full, one after another (repeat clients tend to borrow a bit more each time)
  const history: SimulatedLoan[] = [];
  let next = anchor;
  let principal = clampAmount(product, (current?.principal ?? product.amount.min * 2) / (1.1 + random() * 0.3));
  // Long-standing clients have up to a year of loans behind them
  for (let count = random() < 0.25 ? 0 : between(1, 9); count > 0; count--) {
    const pastProduct = random() < 0.85 ? product : activeProduct(preferredSchedule());
    // Most repaid on time; now and then one fell far behind before it was cleared
    const pastHabit: Habit = random() < 0.05 ? "slipped" : habit === "stopped" ? "late" : habit;
    const disbursedOn = paymentDate(next, "daily", -(lengthInDays(pastProduct) + (pastHabit === "slipped" ? 45 : 3) + between(1, 7)));
    const loan = simulateLoan(pastProduct, clampAmount(pastProduct, principal), disbursedOn, pastHabit, method, officerName);
    if (loan.unpaid.length) break; // (would run into today: no room for more history)
    history.unshift(loan);
    next = disbursedOn;
    principal = principal / (1.1 + random() * 0.25);
  }
  const firstLoan = history[0] ?? current;
  const registeredOn = paymentDate(firstLoan?.disbursedOn ?? anchor, "daily", -between(2, 20));
  return { person, officerId, registeredOn, history, current };
}

/** People who've only applied so far (registered with their application) */
function newApplicant(officerId: string, registeredDaysAgo: number): Draft {
  return { person: newPerson(), officerId, registeredOn: day(-registeredDaysAgo), history: [], current: null };
}

const drafts: Draft[] = [];
for (const officer of officers) for (let i = 0; i < PORTFOLIO_SIZES[officer.id]; i++) drafts.push(buildBorrower(officer.id));

// ---------- Applications ----------

interface ApplicationPlan {
  officerId: string;
  status: MockApplication["status"];
  daysAgo: number;
  /** "new": registered with this application; "repeat": a client who has repaid and applies again; "online-new": not registered until they submit the online form */
  who: "new" | "repeat" | "online-new";
  missing?: string;
  returned?: { reason: string; note: string };
  rejected?: string;
}

const { sharon, joel, sarah, peter, ruth } = OFFICER_IDS;
const PLANS: ApplicationPlan[] = [
  { officerId: peter, status: "rejected", daysAgo: 9, who: "new", rejected: "Income doesn't cover the repayments for this amount." },
  { officerId: sharon, status: "rejected", daysAgo: 8, who: "new", rejected: "One guarantor is already guaranteeing two other loans." },
  { officerId: sarah, status: "approved", daysAgo: 6, who: "repeat" },
  { officerId: sharon, status: "approved", daysAgo: 5, who: "new" },
  { officerId: joel, status: "approved", daysAgo: 4, who: "repeat" },
  { officerId: ruth, status: "draft", daysAgo: 4, who: "new", returned: { reason: "Signature missing", note: "Guarantor 2 didn't sign the consent page. Get it signed and upload the PDF again." } },
  { officerId: peter, status: "submitted", daysAgo: 4, who: "new" },
  { officerId: ruth, status: "submitted", daysAgo: 3, who: "repeat" },
  { officerId: joel, status: "submitted", daysAgo: 3, who: "new" },
  { officerId: sarah, status: "submitted", daysAgo: 2, who: "new" },
  { officerId: sharon, status: "submitted", daysAgo: 2, who: "repeat" },
  { officerId: peter, status: "draft", daysAgo: 2, who: "new", missing: "Guarantor details missing" },
  { officerId: joel, status: "draft", daysAgo: 1.5, who: "online-new", missing: "Waiting for the client to complete it online" },
  { officerId: sharon, status: "draft", daysAgo: 1, who: "new", missing: "Signed application PDF missing" },
  { officerId: sharon, status: "draft", daysAgo: 1, who: "new", missing: "Guarantor consent missing" },
  { officerId: sharon, status: "draft", daysAgo: 0.2, who: "online-new", missing: "Waiting for the client to complete it online" },
];

/** Applicants and their applications, in the order they were made */
const planned = PLANS.map((plan) => {
  if (plan.who === "repeat") {
    const draft = drafts.find((d) => d.officerId === plan.officerId && !d.current && d.history.length && !(d as { applying?: boolean }).applying);
    if (draft) {
      (draft as { applying?: boolean }).applying = true;
      return { plan, draft };
    }
  }
  if (plan.who === "online-new") return { plan, draft: null };
  const draft = newApplicant(plan.officerId, Math.ceil(plan.daysAgo));
  if (plan.status !== "rejected") drafts.push(draft); // people turned down for good aren't registered as clients
  return { plan, draft };
});

// ---------- Numbering and saving ----------

// Loans are numbered in the order they were paid out
const allLoans = drafts.flatMap((draft) => [...draft.history.map((loan) => ({ draft, loan, current: false })), ...(draft.current ? [{ draft, loan: draft.current, current: true }] : [])]);
allLoans.sort((a, b) => a.loan.disbursedOn.localeCompare(b.loan.disbursedOn));
const loanIds = new Map(allLoans.map((entry, index) => [entry.loan, `TL-${String(index + 1).padStart(4, "0")}`]));

// Clients are numbered in the order they registered
const registered = drafts.slice().sort((a, b) => a.registeredOn.localeCompare(b.registeredOn));
const borrowerIds = new Map(registered.map((draft, index) => [draft, `B-${String(index + 1).padStart(4, "0")}`]));

for (const draft of registered) {
  const id = borrowerIds.get(draft)!;
  const { person } = draft;
  const borrower: MockBorrower = {
    id,
    name: person.name,
    phone: person.phone,
    area: person.area,
    nin: person.nin,
    officerId: draft.officerId,
    registeredOn: draft.registeredOn,
    currentLoanId: draft.current ? loanIds.get(draft.current)! : null,
    applicationId: null,
    clearedLoans: draft.history.length,
  };
  borrowers.push(borrower);

  let loanTerms = null;
  if (draft.current) {
    const loan = draft.current;
    const loanId = loanIds.get(loan)!;
    const overdue = loan.unpaid.filter((instalment) => instalment.dueOn < TODAY);
    const daysPastDue = overdue.length ? daysBetween(overdue[0].dueOn, TODAY) : 0;
    const longOverdue = daysPastDue > 60 && random() < 0.6;
    loans.push({
      id: loanId,
      borrowerName: person.name,
      phone: person.phone,
      area: person.area,
      officerId: draft.officerId,
      outstandingBalance: loan.totalRepayable - loan.paid,
      daysPastDue,
      arrearsAmount: overdue.reduce((sum, instalment) => sum + instalment.amount, 0),
      payout: { method: random() < 0.75 ? "MTN MoMo" : "Airtel Money", reference: `MP${loan.disbursedOn.slice(2).replace(/-/g, "")}.${digits(4)}`, by: pick(PAYOUT_BY), paidOn: loan.disbursedOn },
      // Long-overdue loans handed to the recovery team
      ...(longOverdue
        ? { recovery: { since: ago(daysPastDue - 60 - between(0, 10), 15), by: "Moses Okot", byId: "u-moses", reason: random() < 0.6 ? "Long overdue" : "Can't be reached", note: random() < 0.5 ? "Not found at the shop on the last two visits." : null } }
        : {}),
    });
    loanTerms = {
      product: loan.product.name,
      productId: loan.product.id,
      principal: loan.principal,
      totalRepayable: loan.totalRepayable,
      repaymentSchedule: loan.product.repaymentSchedule,
      disbursedOn: loan.disbursedOn,
      schedule: { firstPaymentOn: loan.firstPaymentOn, numberOfPayments: loan.numberOfPayments, instalment: loan.instalment, paidAtStart: loan.paid },
    };
  }
  borrowerDetails.set(id, { premises: person.premises, occupation: person.occupation, secondaryPhone: person.secondaryPhone, nextOfKin: person.nextOfKin, gender: person.gender, loanTerms });

  for (const loan of draft.history)
    pastLoans.push({
      id: loanIds.get(loan)!,
      borrowerId: id,
      product: loan.product.name,
      productId: loan.product.id,
      principal: loan.principal,
      totalRepayable: loan.totalRepayable,
      repaymentSchedule: loan.product.repaymentSchedule,
      disbursedOn: loan.disbursedOn,
      clearedOn: loan.lastPaidOn ?? loan.disbursedOn,
      schedule: { firstPaymentOn: loan.firstPaymentOn, numberOfPayments: loan.numberOfPayments, instalment: loan.instalment },
      mostDaysLate: loan.mostDaysLate,
    });
}
pastLoans.sort((a, b) => a.disbursedOn.localeCompare(b.disbursedOn));

for (const { loan } of allLoans) {
  const loanId = loanIds.get(loan)!;
  seedLoanPayments(loanId, loan.payments.map((payment, index) => ({ ...payment, id: `PAY-${loanId.slice(3)}-${index + 1}` })));
}

// Applications, numbered in the order they were started
planned.forEach(({ plan, draft }, index) => {
  const id = `APP-${301 + index}`;
  const borrower = draft ? borrowers.find((b) => b.id === borrowerIds.get(draft)) : undefined;
  const pastProduct = draft?.history.at(-1)?.product;
  const product = pastProduct && random() < 0.8 ? pastProduct : activeProduct(preferredSchedule());
  const amount = clampAmount(product, (draft?.history.at(-1)?.principal ?? product.amount.min * 2) * (1.1 + random() * 0.3));
  const createdAt = ago(plan.daysAgo, 9);
  const created = createdAt.slice(0, 10);
  const firstPaymentOn = [paymentDate(created, product.repaymentSchedule, 1), day(1)].sort().at(-1)!;
  const name = draft?.person.name ?? "New client (online)";
  const submitted = plan.status !== "draft" || !!plan.returned;
  const guarantors = plan.who === "online-new" || plan.missing === "Guarantor details missing" ? undefined : guarantorPair(name);
  const application: MockApplication = {
    id,
    borrowerName: name,
    phone: draft?.person.phone ?? "",
    amount,
    purpose: "",
    officerId: plan.officerId,
    status: plan.status,
    missing: plan.status === "draft" && !plan.returned ? (plan.missing ?? null) : null,
    borrowerId: borrower?.id ?? null,
    terms: { productId: product.id, amount, repaymentSchedule: product.repaymentSchedule, firstPaymentOn, numberOfPayments: product.numberOfPayments, pricing: pricingOf(product) },
    ...(plan.who === "online-new" ? { route: "online" as const } : {}),
    ...(guarantors ? { guarantors } : {}),
    createdAt,
    ...(submitted ? { submittedAt: ago(Math.max(0.1, plan.daysAgo - 0.6), 14) } : {}),
    ...(plan.status === "approved" ? { decided: { by: "Joan Nansubuga", byId: "u-joan", at: ago(Math.max(0.05, plan.daysAgo - 1.5), 11) } } : {}),
    ...(plan.status === "rejected" ? { decided: { by: "Moses Okot", byId: "u-moses", at: ago(plan.daysAgo - 1, 12) }, returned: { reason: "Not eligible", note: plan.rejected!, by: "Moses Okot", at: ago(plan.daysAgo - 1, 12) } } : {}),
    ...(plan.returned ? { returned: { ...plan.returned, by: "Joan Nansubuga", at: ago(plan.daysAgo - 2, 15) } } : {}),
  };
  applications.push(application);
  if (borrower) borrower.applicationId = id;
});
