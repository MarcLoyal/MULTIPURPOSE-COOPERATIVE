const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (remainder > 0) {
    if (remainder < 20) parts.push(ONES[remainder]);
    else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones > 0 ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens]);
    }
  }
  return parts.join(" ");
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const groups: string[] = [];
  let remaining = n;
  let scaleIndex = 0;
  while (remaining > 0) {
    const group = remaining % 1000;
    if (group > 0) {
      groups.unshift(`${threeDigitsToWords(group)}${SCALES[scaleIndex] ? ` ${SCALES[scaleIndex]}` : ""}`);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex++;
  }
  return groups.join(" ");
}

/**
 * Converts a peso amount to the "words and figures" phrasing a
 * disbursement voucher or check is traditionally written with, e.g.
 * 1234.5 -> "One Thousand Two Hundred Thirty Four Pesos and 50/100".
 * Supports amounts up to the trillions, which is far beyond anything
 * this app's actual transactions reach — the ceiling exists only so a
 * pathological input fails loudly (see the thrown RangeError) instead
 * of silently producing a truncated, wrong-looking voucher.
 */
export function amountToPesoWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`amountToPesoWords: amount must be a non-negative finite number, got ${amount}`);
  }
  if (amount >= 1e15) {
    throw new RangeError(`amountToPesoWords: amount ${amount} is too large to render in words`);
  }
  const pesos = Math.floor(amount + 1e-6);
  const centavos = Math.round((amount - pesos) * 100);
  const pesoWords = integerToWords(pesos);
  return `${pesoWords} Peso${pesos === 1 ? "" : "s"} and ${String(centavos).padStart(2, "0")}/100`;
}
