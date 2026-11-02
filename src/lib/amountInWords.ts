// Amounts written out, as on Tamu's payment agreement and guarantor consent ("in words and figures").

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const restWords = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
  return [hundreds ? `${ONES[hundreds]} hundred` : "", restWords].filter(Boolean).join(" and ");
}

/** 3130000 -> "Three million, one hundred and thirty thousand shillings" */
export function amountInWords(amount: number) {
  const scales = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ] as const;
  let rest = Math.round(amount);
  const parts: string[] = [];
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${belowThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(belowThousand(rest));
  const words = parts.join(", ") || "zero";
  return `${words[0].toUpperCase()}${words.slice(1)} shillings`;
}

