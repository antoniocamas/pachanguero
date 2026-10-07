import type { Debt, MemberKey } from '../api';

/** `p:<playerId>` or `g:<hostPlayerId>:<ordinal>`: the same key the server uses. */
export const keyOf = (member: MemberKey): string =>
  'playerId' in member
    ? `p:${member.playerId}`
    : `g:${member.hostPlayerId}:${member.ordinal}`;

/** The member a debt or a payment is for. */
export const memberOf = (
  share: Pick<
    Debt,
    'beneficiary_player_id' | 'holder_player_id' | 'guest_ordinal'
  >
): MemberKey =>
  share.beneficiary_player_id !== null
    ? { playerId: share.beneficiary_player_id }
    : { hostPlayerId: share.holder_player_id, ordinal: share.guest_ordinal! };
