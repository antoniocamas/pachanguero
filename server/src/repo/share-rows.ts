import type { MemberKey } from '../domain/types.js';

/** The columns a debt and a payment have in common. */
export interface ShareRow {
  game_id: number;
  holder_player_id: number;
  beneficiary_player_id: number | null;
  guest_ordinal: number | null;
  amount_cents: number;
}

/** Reads and writes the member a share row is for. */
export class ShareRowMember {
  keyOf(row: ShareRow): MemberKey {
    return row.beneficiary_player_id !== null
      ? { playerId: row.beneficiary_player_id }
      : { hostPlayerId: row.holder_player_id, ordinal: row.guest_ordinal! };
  }

  /** Beneficiary column, then guest-ordinal column. */
  columnsOf(member: MemberKey): [number | null, number | null] {
    return 'playerId' in member
      ? [member.playerId, null]
      : [null, member.ordinal];
  }
}
