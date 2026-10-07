import type { MemberKey } from './types.js';

/** A share is identified by whose it is: a player, or the nth '+1' of a host. */
export class ShareKey {
  constructor(readonly member: MemberKey) {}

  /** `p:<playerId>` or `g:<hostPlayerId>:<ordinal>`. */
  toString(): string {
    return 'playerId' in this.member
      ? `p:${this.member.playerId}`
      : `g:${this.member.hostPlayerId}:${this.member.ordinal}`;
  }
}
