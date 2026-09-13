import { ExclusionHistory } from './exclusion-history.js';
import type {
  Contender,
  ConvocatoriaEntry,
  ConvocatoriaResult,
  SeasonRules,
} from './types.js';

interface Ranked extends Contender {
  index: number;
  wait: number;
  mercies: number;
  demotions: number;
}

/**
 * Builds the convocatoria for a game.
 *
 * 1. Sort sign-ups by points, descending. The top `slots` are provisionally in.
 * 2. Below the cut, anyone who has waited `gamesOutForMercy` games or more is a
 *    candidate for a mercy seat. Best candidate: longest wait, then fewest mercy
 *    seats already received, then highest points.
 * 3. To make room, demote from inside the cut, preferring whoever has never been
 *    demoted this season, then whichever end `demotionDirection` points at.
 * 4. Swap them, and label everyone.
 *
 * Ties on points are broken by name so the result is deterministic — the legacy
 * script left them to the engine's sort, which was not.
 */
export class ConvocatoriaBuilder {
  build(
    signups: Contender[],
    history: Map<number, ExclusionHistory>,
    rules: SeasonRules
  ): ConvocatoriaResult {
    const historyOf = (id: number): ExclusionHistory =>
      history.get(id) ?? new ExclusionHistory([]);

    const ranked: Ranked[] = [...signups]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'))
      .map((c, index) => ({
        ...c,
        index,
        wait: historyOf(c.playerId).waitCounter(rules),
        mercies: historyOf(c.playerId).mercyCount(),
        demotions: historyOf(c.playerId).demotionCount(),
      }));

    const oversubscribed = ranked.length > rules.slots;
    const order = [...ranked];
    const swaps: Array<{ promoted: number; demoted: number }> = [];

    if (oversubscribed && rules.mercySeats > 0) {
      const promotees = this.selectPromotees(order, rules);
      const demotees = this.selectDemotees(order, rules, promotees.length);

      // Pair them off in priority order, best candidate with first demotee.
      for (let i = 0; i < Math.min(promotees.length, demotees.length); i++) {
        const up = order.indexOf(promotees[i]);
        const down = order.indexOf(demotees[i]);
        [order[up], order[down]] = [order[down], order[up]];
        swaps.push({
          promoted: promotees[i].playerId,
          demoted: demotees[i].playerId,
        });
      }
    }

    const promotedIds = new Set(swaps.map(s => s.promoted));
    const demotedIds = new Set(swaps.map(s => s.demoted));

    const entries: ConvocatoriaEntry[] = order.map((player, i) => {
      const playing = i < rules.slots;
      let outcome: ConvocatoriaEntry['outcome'];
      if (promotedIds.has(player.playerId)) outcome = 'mercy';
      else if (demotedIds.has(player.playerId)) outcome = 'demoted';
      else outcome = playing ? 'called_up' : 'excluded';

      return {
        playerId: player.playerId,
        name: player.name,
        points: player.points,
        position: i + 1,
        outcome,
        waitCounter: player.wait,
        playing,
      };
    });

    return { entries, swaps, oversubscribed };
  }

  /** Candidates sit below the cut and have waited long enough. */
  private selectPromotees(order: Ranked[], rules: SeasonRules): Ranked[] {
    return order
      .slice(rules.slots)
      .filter(p => p.wait >= rules.gamesOutForMercy)
      .sort(
        (a, b) =>
          // Longest wait first.
          b.wait - a.wait ||
          // Then whoever has had fewest mercy seats.
          a.mercies - b.mercies ||
          // Then highest points (lowest index).
          a.index - b.index
      )
      .slice(0, rules.mercySeats);
  }

  /**
   * Demotees come from inside the cut. Preferring the never-demoted is a
   * preference, not an exclusion: if everyone inside has been demoted already it
   * will demote someone twice rather than fail.
   */
  private selectDemotees(
    order: Ranked[],
    rules: SeasonRules,
    needed: number
  ): Ranked[] {
    const bottomUp = rules.demotionDirection === 'bottom-up';
    return order
      .slice(0, rules.slots)
      .sort(
        (a, b) =>
          a.demotions - b.demotions ||
          (bottomUp ? b.index - a.index : a.index - b.index)
      )
      .slice(0, needed);
  }
}
