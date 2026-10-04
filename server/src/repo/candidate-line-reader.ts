import type {
  CandidateLine,
  CandidateLinks,
} from './candidate-line-repository.js';

/** Checks the candidate lines a client sends before anything reads them. */
export class CandidateLineReader {
  read(raw: unknown): CandidateLine[] {
    if (!Array.isArray(raw)) throw new Error('lines must be a list');
    return raw.map(item => this.readLine(item));
  }

  private readLine(item: unknown): CandidateLine {
    if (typeof item !== 'object' || item === null) {
      throw new Error('each line must be { text, links? }');
    }
    const { text, links } = item as { text?: unknown; links?: unknown };
    if (typeof text !== 'string') throw new Error('a line needs its text');
    return links === undefined
      ? { text }
      : { text, links: this.readLinks(links) };
  }

  private readLinks(raw: unknown): CandidateLinks {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('links must be { name?, host? }');
    }
    const { name, host } = raw as { name?: unknown; host?: unknown };
    const links: CandidateLinks = {};
    for (const [key, value] of [
      ['name', name],
      ['host', host],
    ] as const) {
      if (value === undefined) continue;
      if (!Number.isInteger(value))
        throw new Error(`${key} must be a player id`);
      links[key] = value as number;
    }
    return links;
  }
}
