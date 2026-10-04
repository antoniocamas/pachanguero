import { describe, expect, it } from 'vitest';
import { GuestSlotAllocator } from './guest-slot-allocator.js';

describe('GuestSlotAllocator', () => {
  const allocator = new GuestSlotAllocator();

  it("fills the open slots with the earliest guests (the organiser's example)", () => {
    // 11 regulars, 4 guests: Adri (8), Álvaro +1 (12), Juan (13), Rubén (14).
    const guests = [
      { position: 8 },
      { position: 12 },
      { position: 13 },
      { position: 14 },
    ];
    const { calledUp, excluded } = allocator.allocate(11, guests, 14);
    expect(calledUp.map(g => g.position)).toEqual([8, 12, 13]);
    expect(excluded.map(g => g.position)).toEqual([14]);
  });

  it('orders by position whatever order the guests arrive in', () => {
    const { calledUp, excluded } = allocator.allocate(
      13,
      [{ position: 20 }, { position: 9 }],
      14
    );
    expect(calledUp).toEqual([{ position: 9 }]);
    expect(excluded).toEqual([{ position: 20 }]);
  });

  it('calls up every guest when there is room for all', () => {
    const { calledUp, excluded } = allocator.allocate(
      10,
      [{ position: 3 }, { position: 5 }],
      14
    );
    expect(calledUp).toHaveLength(2);
    expect(excluded).toEqual([]);
  });

  it('calls up nobody when regulars fill every slot', () => {
    const { calledUp, excluded } = allocator.allocate(
      14,
      [{ position: 3 }],
      14
    );
    expect(calledUp).toEqual([]);
    expect(excluded).toHaveLength(1);
  });
});
