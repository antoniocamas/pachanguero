import type { Debt, MemberKey } from '../api';
import { keyOf, memberOf } from './shares';

/** Each share once: a debt is one row, so a share held by another is never counted twice. */
const distinct = (debts: readonly Debt[]): Debt[] => [
  ...new Map(debts.map(d => [keyOf(memberOf(d)), d])).values(),
];

/** The shares a player answers for, their own and other people's. */
export const heldBy = (debts: readonly Debt[], playerId: number): Debt[] =>
  distinct(debts).filter(d => d.holder_player_id === playerId);

/** What a player owes for the shares they hold. */
export const holdsCents = (debts: readonly Debt[], playerId: number): number =>
  heldBy(debts, playerId).reduce((sum, d) => sum + d.amount_cents, 0);

/** What the whole game still owes, each share once. */
export const outstandingCents = (debts: readonly Debt[]): number =>
  distinct(debts).reduce((sum, d) => sum + d.amount_cents, 0);

/** The debt of one member's share, if it is still owed. */
export const debtOf = (
  debts: readonly Debt[],
  member: MemberKey
): Debt | undefined => debts.find(d => keyOf(memberOf(d)) === keyOf(member));
