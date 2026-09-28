// Formatting - All amounts are integer cents; formatting happens here and nowhere else.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** 4999 → "$49.99"; -7500 → "-$75.00" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Compact form for chart labels: 125000 → "$1,250" */
export function formatCentsCompact(cents: number): string {
  return usdCompact.format(cents / 100);
}

/** Signed form for net/delta values: 92500 → "+$925.00"; -2500 → "-$25.00" */
export function formatSignedCents(cents: number): string {
  return `${cents < 0 ? '-' : '+'}${usd.format(Math.abs(cents) / 100)}`;
}

// ── Dates (UTC everywhere — matches the API's month boundaries) ──────────

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const longMonth = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2025-06-10T00:00:00.000Z" → "Jun 10" */
export function formatDateShort(iso: string): string {
  return shortDate.format(new Date(iso));
}

// ── Months ("YYYY-MM" strings) ───────────────────────────────────────────
// Zero-padded YYYY-MM compares correctly as a plain string:
// "2025-06" < "2025-07" — no date math needed for ordering checks.

export function isValidMonthString(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function currentMonthString(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2025-06" → "June 2025" */
export function monthLabel(month: string): string {
  return longMonth.format(new Date(`${month}-01T00:00:00Z`));
}

/** addMonths("2025-01", -1) → "2024-12" */
export function addMonths(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 1 → "1st", 2 → "2nd", 21 → "21st", 11 → "11th" */
export function ordinalDay(day: number): string {
  const rem10 = day % 10;
  const rem100 = day % 100;
  if (rem10 === 1 && rem100 !== 11) return `${day}st`;
  if (rem10 === 2 && rem100 !== 12) return `${day}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${day}rd`;
  return `${day}th`;
}
