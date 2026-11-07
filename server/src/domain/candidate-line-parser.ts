import type { NameStripper } from './name-stripper.js';

export type ParsedLine =
  | { position: number; kind: 'plain'; name: string }
  | { position: number; kind: 'hostAnnotated'; name: string; hostName: string }
  | { position: number; kind: 'plusOne'; hostName: string };

const PLUS_ONE = /\+\s*1\s*$/;
const HOST_ANNOTATION = /\(([^)]+)\)\s*$/;
/** The "Reservas" heading alone on its line, colon optional. */
const RESERVAS = /^reservas\s*:?$/i;
/** A day and month (`26/10`) or a time (`22:00`): the game's header, never a name. */
const WHEN = /\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}:\d{2}\b/;
/** One symbol repeated five or more times: `-----`, `=====`, `_____`. */
const SEPARATOR = /^([^\p{L}\p{N}\s])\1{4,}$/u;

/** Reads a pasted candidate list, one line per candidate. */
export class CandidateLineParser {
  constructor(private readonly stripper: NameStripper) {}

  /**
   * Every candidate line of a paste, numbered from 1. Dropped, taking no
   * number: blank lines, the "Reservas" heading (the names beneath it stay
   * candidates, after the ones above), a line with a date or a time (the game's
   * header, "Lunes, 26/10 22:00, Samaranch.") and every group heading — a
   * separator line and the nearest non-blank line above it, which is whatever
   * the group is called ("Claros", "Equipo A").
   */
  parseAll(text: string): ParsedLine[] {
    return this.texts(text).map((line, i) => this.parseStripped(line, i + 1));
  }

  /** The same candidate lines as `parseAll`, as cleaned text rather than parsed. */
  texts(text: string): string[] {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const dropped = new Set<number>();
    lines.forEach((line, i) => {
      if (!SEPARATOR.test(line)) return;
      dropped.add(i);
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j] !== '') {
          dropped.add(j);
          break;
        }
      }
    });
    return lines
      .filter((_, i) => !dropped.has(i))
      .map(l => this.stripper.strip(l))
      .filter(l => l !== '' && !RESERVAS.test(l) && !WHEN.test(l));
  }

  parse(rawLine: string, position: number): ParsedLine {
    return this.parseStripped(this.stripper.strip(rawLine), position);
  }

  private parseStripped(line: string, position: number): ParsedLine {
    if (PLUS_ONE.test(line)) {
      return {
        position,
        kind: 'plusOne',
        hostName: this.stripper.strip(line.replace(PLUS_ONE, '')),
      };
    }
    const annotation = HOST_ANNOTATION.exec(line);
    if (annotation) {
      return {
        position,
        kind: 'hostAnnotated',
        name: this.stripper.strip(line.slice(0, annotation.index)),
        hostName: this.stripper.strip(annotation[1]),
      };
    }
    return { position, kind: 'plain', name: line };
  }
}
