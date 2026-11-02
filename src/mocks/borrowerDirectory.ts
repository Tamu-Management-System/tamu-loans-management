// Sample borrower directory for the mock API. Starts from the named loans and applications
// in fixtures.ts, then fills each officer's portfolio with generated borrowers (fixed seed,
// so the data is the same every time) until the counts match the dashboard:
// 41 active loans for Sharon (8 in arrears), 186 for the branch (35 in arrears).
import { applications, loans, OFFICER_IDS, type MockLoan } from "./fixtures";

export type MockBorrowerStatus = "active" | "in-arrears" | "cleared" | "applicant";

export interface MockBorrower {
  id: string;
  name: string;
  phone: string;
  area: string;
  /** National ID number. Never sent in lists (see docs/security.md). */
  nin: string;
  officerId: string;
  /** ISO date */
  registeredOn: string;
  currentLoanId: string | null;
  applicationId: string | null;
  clearedLoans: number;
  /** Registered during the demo: only real data, no sample documents */
  addedInSession?: boolean;
}

/** Active loans and arrears per officer, matching the dashboard's figures. */
const PORTFOLIO_TARGETS: Record<string, { active: number; inArrears: number }> = {
  [OFFICER_IDS.sharon]: { active: 41, inArrears: 8 },
  [OFFICER_IDS.joel]: { active: 38, inArrears: 6 },
  [OFFICER_IDS.sarah]: { active: 36, inArrears: 6 },
  [OFFICER_IDS.peter]: { active: 37, inArrears: 7 },
  [OFFICER_IDS.ruth]: { active: 34, inArrears: 8 },
};
const CLEARED_PER_OFFICER = 3;

const FIRST_NAMES = ["Brian", "Patience", "Ivan", "Mercy", "Allan", "Juliet", "Henry", "Esther", "Isaac", "Florence", "Denis", "Agnes", "Emmanuel", "Doreen", "Fatuma", "Julius", "Annet", "Edward", "Brenda", "Nicholas", "Sylvia", "Harriet", "Christine", "Paul", "Simon", "Lillian", "Rose", "Collins", "Phiona", "Gerald", "Shamim", "Ronald", "Betty", "Arthur", "Diana", "Hakim", "Rebecca", "Martin", "Joan", "Derrick"];
const LAST_NAMES = ["Mugisha", "Nakato", "Okello", "Ssemanda", "Kato", "Nansubuga", "Byaruhanga", "Akello", "Ochieng", "Nalwoga", "Tumusiime", "Kiggundu", "Adong", "Waiswa", "Nabirye", "Kasozi", "Lubega", "Nantongo", "Kizito", "Auma", "Mwesige", "Ssebunya", "Atuhaire", "Opio", "Kemigisha", "Namutebi", "Wasswa", "Babirye", "Mukasa", "Nakimuli", "Ainembabazi", "Turyahikayo"];
const AREAS = ["Kawempe", "Nakawa", "Ntinda", "Kireka", "Bwaise", "Katwe", "Mengo", "Kasubi", "Nateete", "Wandegeya", "Kalerwe", "Owino market", "Kisenyi", "Banda", "Bweyogerere", "Mukono", "Seeta", "Kyebando", "Kiwatule", "Nakulabye", "Makindye", "Kansanga", "Kabalagala", "Najjera"];
const PHONE_PREFIXES = ["0772", "0701", "0756", "0782", "0774", "0703", "0758", "0779", "0751", "0785"];

/** Small seeded random number generator (mulberry32), so the sample data never changes. */
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(2026);
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const digits = (count: number) => Array.from({ length: count }, () => Math.floor(random() * 10)).join("");
const letters = (count: number) => Array.from({ length: count }, () => String.fromCharCode(65 + Math.floor(random() * 26))).join("");

/** Ugandan NIN shape: C + M/F + 2 digits + 8 digits + 2 letters (14 characters). */
const generateNin = () => `C${random() < 0.5 ? "M" : "F"}${digits(10)}${letters(2)}`;
const generatePhone = () => `${pick(PHONE_PREFIXES)} ${digits(3)} ${digits(3)}`;
const generateDate = (maxDaysAgo: number) => new Date(Date.now() - Math.floor(random() * maxDaysAgo) * 86_400_000).toISOString().slice(0, 10);
const roundTo = (amount: number, step: number) => Math.round(amount / step) * step;

const usedNames = new Set([...loans.map((loan) => loan.borrowerName), ...applications.map((app) => app.borrowerName)]);
function generateName() {
  let name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  while (usedNames.has(name)) name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  usedNames.add(name);
  return name;
}

function buildDirectory(): MockBorrower[] {
  const directory: Omit<MockBorrower, "id">[] = [];

  // Borrowers behind the named loans and applications used across the demo
  // (repeat borrowers: 1–3 earlier loans each, so their profiles show a track record)
  for (const loan of loans) {
    directory.push({ name: loan.borrowerName, phone: loan.phone, area: loan.area, nin: generateNin(), officerId: loan.officerId, registeredOn: generateDate(900), currentLoanId: loan.id, applicationId: null, clearedLoans: 1 + Math.floor(random() * 3) });
  }
  // (online links not completed yet, and rejected applicants, aren't borrowers)
  for (const app of applications) {
    if (app.status === "rejected" || (app.route === "online" && !app.borrowerId)) continue;
    directory.push({ name: app.borrowerName, phone: app.phone, area: pick(AREAS), nin: generateNin(), officerId: app.officerId, registeredOn: generateDate(10), currentLoanId: null, applicationId: app.id, clearedLoans: 0 });
  }

  // Generated borrowers to fill each officer's portfolio
  let nextLoanNumber = 2001;
  for (const [officerId, target] of Object.entries(PORTFOLIO_TARGETS)) {
    const officerLoans = loans.filter((loan) => loan.officerId === officerId);
    const missingArrears = target.inArrears - officerLoans.filter((loan) => loan.daysPastDue > 0).length;
    const missingCurrent = target.active - target.inArrears - officerLoans.filter((loan) => loan.daysPastDue === 0).length;

    const addLoanBorrower = (daysPastDue: number) => {
      const name = generateName();
      const balance = roundTo(300_000 + random() * 5_200_000, 10_000);
      const loan: MockLoan = {
        id: `TL-${nextLoanNumber++}`,
        borrowerName: name,
        phone: generatePhone(),
        area: pick(AREAS),
        officerId,
        outstandingBalance: balance,
        daysPastDue,
        ...(daysPastDue > 0 ? { arrearsAmount: roundTo(Math.min(balance, 150_000 + random() * 900_000), 10_000) } : {}),
      };
      loans.push(loan); // so search, Record payment and other endpoints see the same loans
      directory.push({ name, phone: loan.phone, area: loan.area, nin: generateNin(), officerId, registeredOn: generateDate(900), currentLoanId: loan.id, applicationId: null, clearedLoans: Math.floor(random() * 3) });
    };
    for (let i = 0; i < missingCurrent; i++) addLoanBorrower(0);
    for (let i = 0; i < missingArrears; i++) addLoanBorrower(1 + Math.floor(random() * 120));
    for (let i = 0; i < CLEARED_PER_OFFICER; i++) {
      directory.push({ name: generateName(), phone: generatePhone(), area: pick(AREAS), nin: generateNin(), officerId, registeredOn: generateDate(1100), currentLoanId: null, applicationId: null, clearedLoans: 1 + Math.floor(random() * 4) });
    }
  }

  // Repeat borrowers registered long enough ago to have repaid their earlier loans (about five months each)
  for (const borrower of directory) {
    // …and, for a late loan, before it was paid out (it's at least as many days old as it is late)
    const lateDays = borrower.currentLoanId ? (loans.find((l) => l.id === borrower.currentLoanId)?.daysPastDue ?? 0) : 0;
    const forHistory = borrower.clearedLoans ? 60 + borrower.clearedLoans * 150 + (borrower.name.length * 13) % 90 : 0;
    const earliestDaysAgo = Math.max(forHistory, lateDays > 0 ? lateDays + 21 + (borrower.name.length * 7) % 60 : 0);
    const registeredDaysAgo = (Date.now() - new Date(borrower.registeredOn).getTime()) / 86_400_000;
    if (registeredDaysAgo < earliestDaysAgo) borrower.registeredOn = new Date(Date.now() - earliestDaysAgo * 86_400_000).toISOString().slice(0, 10);
  }

  return directory
    .sort((a, b) => a.registeredOn.localeCompare(b.registeredOn))
    .map((borrower, index) => ({ ...borrower, id: `B-${String(index + 1).padStart(4, "0")}` }));
}

export const borrowers: MockBorrower[] = buildDirectory();

export function borrowerStatus(borrower: MockBorrower): MockBorrowerStatus {
  if (borrower.currentLoanId) {
    const loan = loans.find((l) => l.id === borrower.currentLoanId);
    if (loan && loan.outstandingBalance <= 0) return "cleared"; // paid off in this session
    return loan && loan.daysPastDue > 0 ? "in-arrears" : "active";
  }
  return borrower.applicationId ? "applicant" : "cleared";
}

/** The next borrower number, e.g. "B-0207". */
export const nextBorrowerId = () => `B-${String(Math.max(...borrowers.map((b) => Number(b.id.slice(2)))) + 1).padStart(4, "0")}`;
