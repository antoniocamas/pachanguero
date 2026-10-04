import type Database from 'better-sqlite3';

/** Who the organiser said a line's name, or the host it names, is. */
export interface CandidateLinks {
  name?: number;
  host?: number;
}

/** One line of a candidate list: what was pasted and any choice made on it. */
export interface CandidateLine {
  text: string;
  links?: CandidateLinks;
  /** This line registered the name as its host's guest. */
  introduced?: true;
}

/** The lines of each game's saved candidate list, in order. */
export class CandidateLineRepository {
  constructor(private readonly conn: Database.Database) {}

  list(gameId: number): CandidateLine[] {
    return (
      this.conn
        .prepare(
          `SELECT text, name_player_id, host_player_id, introduced FROM candidate_lines
            WHERE game_id = ? ORDER BY position`
        )
        .all(gameId) as {
        text: string;
        name_player_id: number | null;
        host_player_id: number | null;
        introduced: number;
      }[]
    ).map(r => {
      const line: CandidateLine = { text: r.text };
      const links: CandidateLinks = {};
      if (r.name_player_id !== null) links.name = r.name_player_id;
      if (r.host_player_id !== null) links.host = r.host_player_id;
      if (Object.keys(links).length) line.links = links;
      if (r.introduced) line.introduced = true;
      return line;
    });
  }

  /** A save wholly replaces the previous list. */
  replaceAll(gameId: number, lines: readonly CandidateLine[]): void {
    this.conn.transaction(() => {
      this.conn
        .prepare('DELETE FROM candidate_lines WHERE game_id = ?')
        .run(gameId);
      const insert = this.conn.prepare(
        `INSERT INTO candidate_lines
           (game_id, position, text, name_player_id, host_player_id, introduced)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      lines.forEach((line, i) =>
        insert.run(
          gameId,
          i + 1,
          line.text,
          line.links?.name ?? null,
          line.links?.host ?? null,
          line.introduced ? 1 : 0
        )
      );
    })();
  }
}
