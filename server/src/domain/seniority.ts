/**
 * Seniority points: veterans start ahead, but with diminishing returns so the
 * advantage flattens instead of locking newcomers out.
 *
 * Each season contributes `1 / (ln(n + 2) / ln 3)` and the total is the running
 * sum. Season 1 is worth exactly 1.0; thirteen seasons are worth 7.31, not 13.
 *
 * The legacy sheet held this as a lookup table on the `Aux` tab, read with
 * `INDIRECT("Aux!D" & F3)` — which silently breaks if a row is inserted. Here it
 * is a function, so it also extends past the 13 rows the table happened to have.
 */

/** What season number `n` alone contributes. */
export function seasonContribution(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 0;
  return 1 / (Math.log(n + 2) / Math.log(3));
}

/** Total seniority points for a player who has played `seasons` seasons. */
export function seniorityPoints(seasons: number): number {
  if (!Number.isFinite(seasons) || seasons < 1) return 0;
  let total = 0;
  for (let n = 1; n <= Math.floor(seasons); n++) {
    total += seasonContribution(n);
  }
  return total;
}
