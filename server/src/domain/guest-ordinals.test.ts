import { describe, expect, it } from 'vitest';
import { GuestOrdinals } from './guest-ordinals.js';

describe('GuestOrdinals', () => {
  const lines = [
    { position: 9, player_id: null, host_player_id: 2 },
    { position: 5, player_id: null, host_player_id: 1 },
    { position: 7, player_id: null, host_player_id: 1 },
    { position: 6, player_id: 30, host_player_id: 1 },
  ];
  const ordinals = new GuestOrdinals(lines);

  it('numbers the anonymous plus-ones of one host by position', () => {
    expect(ordinals.keyOf(-5)).toEqual({ hostPlayerId: 1, ordinal: 1 });
    expect(ordinals.keyOf(-7)).toEqual({ hostPlayerId: 1, ordinal: 2 });
  });

  it('restarts at one for another host', () => {
    expect(ordinals.keyOf(-9)).toEqual({ hostPlayerId: 2, ordinal: 1 });
  });

  it('leaves a real player as that player, and counts named guests out', () => {
    expect(ordinals.keyOf(30)).toEqual({ playerId: 30 });
    expect(ordinals.keys()).toHaveLength(3);
  });

  it('refuses a line that holds no anonymous plus-one', () => {
    expect(() => ordinals.keyOf(-6)).toThrow();
  });
});
