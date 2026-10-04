import type { NameStripper } from './name-stripper.js';

export type ParsedLine =
  | { position: number; kind: 'plain'; name: string }
  | { position: number; kind: 'hostAnnotated'; name: string; hostName: string }
  | { position: number; kind: 'plusOne'; hostName: string };

const PLUS_ONE = /\+\s*1\s*$/;
const HOST_ANNOTATION = /\(([^)]+)\)\s*$/;
const RESERVAS = /^reservas\b/i;

/** Reads a pasted candidate list, one line per candidate. */
export class CandidateLineParser {
  constructor(private readonly stripper: NameStripper) {}

  /**
   * Every candidate line of a paste, numbered from 1. The "Reservas" heading
   * and everything after it is dropped; blank lines take no number.
   */
  parseAll(text: string): ParsedLine[] {
    const cleaned = text.split(/\r?\n/).map(l => this.stripper.strip(l));
    const reservas = cleaned.findIndex(l => RESERVAS.test(l));
    const candidates = (
      reservas === -1 ? cleaned : cleaned.slice(0, reservas)
    ).filter(l => l !== '');
    return candidates.map((line, i) => this.parseStripped(line, i + 1));
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
