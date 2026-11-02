// Earlier, fully repaid loans for the sample borrowers, so profiles have a history to show.
// Fixed seed, so every borrower always has the same past loans. Numbered TL-0001 upwards in
// the order they were disbursed (below the current loans' numbers).
import { borrowers } from "./borrowerDirectory";
import { borrowerDetails } from "./borrowerProfiles";

export interface MockPastLoan {
  id: string;
  borrowerId: string;
  product: string;
  principal: number;
  disbursedOn: string;
  clearedOn: string;
  mostDaysLate: number;
}

const PRODUCTS = ["Business loan", "School fees loan", "Asset loan"];
const DAY_MS = 86_400_000;

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(7310);
const roundTo = (amount: number, step: number) => Math.round(amount / step) * step;
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

function buildPastLoans(): MockPastLoan[] {
  const pastLoans: Omit<MockPastLoan, "id">[] = [];
  for (const borrower of borrowers) {
    const count = borrower.clearedLoans;
    if (!count) continue;
    const current = borrowerDetails.get(borrower.id)?.loanTerms;
    // Past loans fit between registering and the current loan (or a couple of weeks ago)
    const start = new Date(borrower.registeredOn).getTime();
    const end = current ? new Date(current.disbursedOn).getTime() - DAY_MS : Date.now() - 14 * DAY_MS;
    const slot = Math.max(DAY_MS, (end - start) / count);
    let principal = roundTo(300_000 + random() * 700_000, 50_000);
    for (let i = 0; i < count; i++) {
      const disbursed = start + i * slot + random() * slot * 0.1;
      // Each loan is repaid well before the next one starts
      const lastedDays = Math.max(1, Math.min((slot / DAY_MS) * 0.85, 60 + random() * 180));
      pastLoans.push({
        borrowerId: borrower.id,
        product: PRODUCTS[Math.floor(random() * PRODUCTS.length)],
        principal,
        disbursedOn: isoDate(disbursed),
        clearedOn: isoDate(disbursed + lastedDays * DAY_MS),
        mostDaysLate: random() < 0.72 ? 0 : 1 + Math.floor(random() * 25),
      });
      principal = roundTo(principal * (1.1 + random() * 0.4), 50_000); // repeat borrowers tend to borrow more
    }
  }
  return pastLoans
    .sort((a, b) => a.disbursedOn.localeCompare(b.disbursedOn))
    .map((loan, index) => ({ ...loan, id: `TL-${String(index + 1).padStart(4, "0")}` }));
}

export const pastLoans: MockPastLoan[] = buildPastLoans();
