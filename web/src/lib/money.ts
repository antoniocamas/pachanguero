/**
 * `400` cents → `4 €`, `350` → `3,5 €`, `375` → `3,75 €`: whole when whole,
 * with the decimals that are needed otherwise.
 */
export const euros = (cents: number): string => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `,${fraction}` : ''} €`;
};

const AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * What the organiser typed → cents, or `null` when it is not an amount.
 * Accepts `4`, `3,5`, `3.75` and an optional trailing `€`.
 */
export const parseEuros = (text: string): number | null => {
  const match = AMOUNT.exec(text.replace('€', '').trim());
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
};

/** What one player owes for a game: the season price split over its slots. */
export const shareCents = (priceCents: number, slots: number) =>
  Math.round(priceCents / slots);
