import type { NameStripper } from './name-stripper.js';

export type Team = 'claros' | 'oscuros';

export interface TeamLine {
  team: Team;
  line: string;
  /** 1-based over every content line, both teams, in paste order. */
  position: number;
}

/** Words that head each team's list; `Blancos` is the other name for `Claros`. */
const HEADINGS: Record<Team, readonly string[]> = {
  claros: ['claros', 'blancos'],
  oscuros: ['oscuros'],
};

const NO_LETTERS = /^[^a-zA-Zà-ÿÀ-Ÿ]*$/;

/** Splits a pasted team list into its two teams' lines. */
export class TeamListParser {
  constructor(private readonly stripper: NameStripper) {}

  /**
   * Headings (`Claros` or `Blancos` / `Oscuros`, optionally ending in `:`, in either order) switch the team; lines
   * with no letters are separators and dropped; everything else is a player.
   * A player line before the first heading is an error, never a guess.
   */
  splitByTeam(rawText: string): TeamLine[] {
    const lines: TeamLine[] = [];
    let team: Team | null = null;
    for (const raw of rawText.split(/\r?\n/)) {
      const line = this.stripper.strip(raw);
      const heading = this.headingOf(line);
      if (heading) {
        team = heading;
      } else if (!NO_LETTERS.test(line)) {
        if (!team) {
          throw new Error(`Línea antes de "Claros" u "Oscuros": ${line}`);
        }
        lines.push({ team, line, position: lines.length + 1 });
      }
    }
    return lines;
  }

  private headingOf(line: string): Team | null {
    const word = line.replace(/\s*:$/, '');
    for (const team of ['claros', 'oscuros'] as const) {
      if (
        HEADINGS[team].some(
          heading =>
            word.localeCompare(heading, 'es', { sensitivity: 'base' }) === 0
        )
      ) {
        return team;
      }
    }
    return null;
  }
}
