/**
 * Import the 2024/2025 season from the CSVs recovered from the PDF export of
 * the original spreadsheet.
 *
 * The grids were rebuilt by coordinate extraction (the PDF collapses empty
 * cells, so plain text loses the alignment) and verified two ways: each
 * player's game count matches the sheet's own Asistencia column, and every
 * weekly column sums to its Total row.
 *
 * Payment dates are unknowable — the sheet overwrote '*' with '4' when someone
 * settled up, keeping no record of when. Imported payments are stamped with the
 * game date and flagged in the note, so they are never mistaken for real
 * settlement dates.
 *
 * Usage: npm run seed [-- --season "2024/2025" --reset]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, tx } from '../src/db/index.js';
import * as repo from '../src/repo.js';
import type { ExclusionKind } from '../src/domain/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '../../data/seed');

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SEASON = flag('season', '2024/2025')!;
const RESET = args.includes('--reset');

function parseCsv(file: string): string[][] {
  return readFileSync(join(seedDir, file), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.length)
    .map((line) => {
      const out: string[] = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') quoted = false;
          else cur += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out;
    });
}

/**
 * Sheet headers are `D/MM` with the season starting in September, so months
 * 8-12 belong to the first calendar year and 1-7 to the second.
 */
function toIsoDate(header: string, startYear: number): string {
  const [d, m] = header.split('/').map((x) => Number(x));
  const year = m >= 8 ? startYear : startYear + 1;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const num = (s: string): number | null => {
  const v = Number(s.trim().replace(',', '.'));
  return s.trim() && Number.isFinite(v) ? v : null;
};

function main() {
  const pagos = parseCsv('pagos.csv');
  const fuera = parseCsv('fueradeconvocatoria.csv');
  const startYear = Number(SEASON.slice(0, 4));

  if (RESET) {
    const existing = repo.listSeasons().find((s) => s.name === SEASON);
    if (existing) {
      db().prepare('DELETE FROM seasons WHERE id = ?').run(existing.id);
      console.log(`Removed existing season ${SEASON}`);
    }
  }

  let season = repo.listSeasons().find((s) => s.name === SEASON);
  if (season) {
    console.log(`Season ${SEASON} already imported (id ${season.id}). Use --reset to replace.`);
    return;
  }

  season = repo.createSeason({
    name: SEASON,
    starts_on: toIsoDate(pagos[0][1], startYear),
    ends_on: toIsoDate(pagos[0][pagos[0].length - 1], startYear),
  });

  // Seniority: the '# Temporadas' column of the Puntos tab. Not in the grid
  // CSVs, so it is transcribed here. Caro's sheet value was hand-edited to
  // 12.309 against a formula that yields 7.309 for 13 seasons; the season count
  // is kept and the curve recomputed. See docs/domain-model/data-quality.md
  const seniority: Record<string, number> = {
    'Antonio C': 13, Fer: 2, Nacho: 1, Emma: 2, 'Álvaro C': 1, Víctor: 3,
    'Álvaro B': 13, Iker: 3, Miguel: 13, 'Pablo Tri': 8, 'Jorge G': 8,
    Moran: 2, Adam: 2, 'Álvaro R': 10, Alberto: 6, Joaquín: 3, Roberto: 3,
    Gon: 9, Pablo: 2, Caro: 13, Alex: 2, 'Pablo Silvage': 1, Dani: 7,
  };

  const header = pagos[0];
  const perHead = Math.round(season.price_cents / season.slots); // 400 cents

  tx(() => {
    // Games. The Total row is 0 for weeks that were never played — but the
    // 'Bis' column's total was simply left blank despite 13 players paying it,
    // so fall back to whether anyone has an entry in the column.
    const totals = pagos[1];
    const games = new Map<number, number>(); // csv column -> game id
    const dateOf = (col: number) => (header[col] === 'Bis' ? header[col - 1] : header[col]);
    for (let col = 1; col < header.length; col++) {
      const label = header[col] === 'Bis' ? 'Bis' : null;
      // 'Bis' is a replay of the previous week and carries no date of its own.
      const dateHeader = label ? header[col - 1] : header[col];
      const total = num(totals[col]);
      const anyEntries = pagos.slice(2).some((r) => r[col]?.trim());
      const status = (total !== null && total > 0) || (total === null && anyEntries)
        ? 'played'
        : 'cancelled';
      const game = repo.createGame(season!.id, toIsoDate(dateHeader, startYear), label, status);
      games.set(col, game.id);
    }

    // Players and their payments.
    for (const row of pagos.slice(2)) {
      const name = row[0].trim();
      if (!name || name === 'Total') continue;
      const player = repo.addPlayer(season!.id, name, seniority[name] ?? 1);

      for (let col = 1; col < header.length; col++) {
        const cell = row[col]?.trim();
        if (!cell) continue;
        const gameId = games.get(col)!;
        const value = num(cell);

        if (value !== null && value > 0) {
          // Paid. Values above one share cover guests.
          const guests = Math.max(0, Math.round(value * 100 / perHead) - 1);
          repo.setParticipation(gameId, player.id, {
            signed_up: true,
            played: true,
            paid_cents: Math.round(value * 100),
            paid_on: toIsoDate(dateOf(col), startYear),
            guests,
            note: 'imported: settlement date unknown',
          });
        } else if (cell.includes('*')) {
          // Played, never settled. This is the debt the '*' encoded.
          repo.setParticipation(gameId, player.id, {
            signed_up: true,
            played: true,
            paid_cents: 0,
            paid_on: null,
            note: 'imported: unpaid (*)',
          });
        }
      }
    }

    // Exclusion marks. This sheet has no 'Bis' column, so map by date text.
    const fh = fuera[0];
    const colByHeader = new Map<string, number>();
    for (let col = 1; col < header.length; col++) {
      if (header[col] !== 'Bis') colByHeader.set(header[col], col);
    }
    const kindOf = (cell: string): ExclusionKind | null =>
      cell === 'D' ? 'mercy' : cell === '2' ? 'demoted' : cell === '1' ? 'points' : null;

    for (const row of fuera.slice(1)) {
      const name = row[0].trim();
      // This sheet carries its own Total row; it is not a player.
      if (!name || name === 'Total') continue;
      const player = repo.addPlayer(season!.id, name, seniority[name] ?? 1);
      for (let col = 1; col < fh.length; col++) {
        const kind = kindOf(row[col]?.trim() ?? '');
        if (!kind) continue;
        const pagosCol = colByHeader.get(fh[col]);
        if (pagosCol === undefined) continue;
        const gameId = games.get(pagosCol)!;
        repo.setExclusion(gameId, player.id, kind);
        repo.setParticipation(gameId, player.id, { signed_up: true });
      }
    }
  });

  repo.activateSeason(season.id);

  const table = repo.standings(season.id);
  console.log(`\nImported ${SEASON} (season id ${season.id})`);
  console.log(`${repo.listGames(season.id).length} games, ${table.length} players\n`);
  console.log('  #  jugón             puntos   asis  fuera  antig   deuda');
  table.slice(0, 12).forEach((s, i) => {
    console.log(
      `${String(i + 1).padStart(3)}  ${s.name.padEnd(16)} ${s.points.toFixed(2).padStart(7)}` +
        ` ${String(s.paidGames).padStart(6)} ${String(s.exclusions).padStart(6)}` +
        ` ${s.seniority.toFixed(2).padStart(6)} ${(s.debtCents / 100).toFixed(2).padStart(7)} €`,
    );
  });
}

main();
