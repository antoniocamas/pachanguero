import type { NameStripper } from './name-stripper.js';

export type ParsedLine =
  | { position: number; kind: 'plain'; name: string }
  | { position: number; kind: 'hostAnnotated'; name: string; hostName: string }
  | { position: number; kind: 'plusOne'; hostName: string };

const PLUS_ONE = /\+\s*1\s*$/;
const HOST_ANNOTATION = /\(([^)]+)\)\s*$/;
const RESERVAS = /^reservas\b/i;
/** One symbol repeated five or more times: `-----`, `=====`, `_____`. */
const SEPARATOR = /^([^\p{L}\p{N}\s])\1{4,}$/u;

/** Reads a pasted candidate list, one line per candidate. */
export class CandidateLineParser {
  constructor(private readonly stripper: NameStripper) {}

  /**
   * Every candidate line of a paste, numbered from 1. The "Reservas" heading
   * and everything after it is dropped; so are blank lines and every group
   * heading — a separator line and the nearest non-blank line above it, which
   * is whatever the group is called ("Claros", "Equipo A"). None takes a number.
   */
  parseAll(text: string): ParsedLine[] {
    return this.texts(text).map((line, i) => this.parseStripped(line, i + 1));
  }

  /** The same candidate lines as `parseAll`, as cleaned text rather than parsed. */
  texts(text: string): string[] {
    const raw = text.split(/\r?\n/).map(l => l.trim());
    const reservas = raw.findIndex(l => RESERVAS.test(this.stripper.strip(l)));
    const lines = reservas === -1 ? raw : raw.slice(0, reservas);
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
      .filter(l => l !== '');
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
