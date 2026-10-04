/**
 * Fills the slots regulars leave open with guests, earliest arrival first.
 * Only meaningful when regulars alone fit within the slots.
 */
export class GuestSlotAllocator {
  allocate<G extends { position: number }>(
    regularsCount: number,
    guests: readonly G[],
    slots: number
  ): { calledUp: G[]; excluded: G[] } {
    const openSlots = Math.max(0, slots - regularsCount);
    const sorted = [...guests].sort((a, b) => a.position - b.position);
    return {
      calledUp: sorted.slice(0, openSlots),
      excluded: sorted.slice(openSlots),
    };
  }
}
