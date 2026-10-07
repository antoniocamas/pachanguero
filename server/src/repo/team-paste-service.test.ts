import { beforeEach, describe, expect, it } from 'vitest';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { NameStripper } from '../domain/name-stripper.js';
import { TeamListParser } from '../domain/team-list-parser.js';
import { AliasRepository } from './alias-repository.js';
import { GameFlow } from './game-flow-test-support.js';
import { LineResolver } from './line-resolver.js';
import { PlayerRegistrar } from './player-registrar.js';
import { TeamAssignmentService } from './team-assignment-service.js';
import { TeamPasteService } from './team-paste-service.js';

describe('TeamPasteService', () => {
  let flow: GameFlow;
  let aliases: AliasRepository;
  let service: TeamPasteService;
  let gameId: number;
  let ids: number[];

  const names = (from: number, to: number) =>
    ids
      .slice(from, to)
      .map(id => flow.players.nameOf(id))
      .join('\n');
  const paste = (claros: string, oscuros: string) =>
    `Claros\n-----\n${claros}\nOscuros\n-----\n${oscuros}`;
  const standardPaste = () => paste(names(0, 7), names(7, 14));
  const rowOf = (playerId: number) =>
    flow.participations.list(gameId).find(p => p.player_id === playerId)!;
  const snapshot = () =>
    JSON.stringify([
      flow.participations.list(gameId).map(({ team: _team, ...rest }) => rest),
      flow.exclusionRows(gameId),
    ]);

  beforeEach(() => {
    flow = new GameFlow();
    aliases = new AliasRepository(flow.conn);
    ({ gameId, playerIds: ids } = flow.gameWithSignups('2026-10-07', 14));
    const lines = new LineResolver(
      flow.players,
      aliases,
      new PlayerRegistrar(flow.players, aliases)
    );
    const assignments = new TeamAssignmentService(
      flow.lifecycle,
      flow.convocatorias,
      flow.participations,
      flow.players,
      flow.conn
    );
    const stripper = new NameStripper();
    service = new TeamPasteService(
      flow.lifecycle,
      assignments,
      lines,
      new TeamListParser(stripper),
      new CandidateLineParser(stripper)
    );
  });

  it('is refused until the game is played', () => {
    flow.confirmed(gameId);

    expect(() => service.paste(gameId, standardPaste())).toThrow(
      'Marca el partido como jugado antes de pegar los equipos'
    );
  });

  describe('in a played game', () => {
    beforeEach(() => flow.played(gameId));

    it('gives each member the team of their line and changes nothing else', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: ids[0] }],
        payerPlayerId: ids[0],
      });
      const before = snapshot();

      const result = service.paste(gameId, standardPaste());

      expect(result.matched).toHaveLength(14);
      expect(rowOf(ids[0]).team).toBe('claros');
      expect(rowOf(ids[13]).team).toBe('oscuros');
      expect(snapshot()).toBe(before);
      expect(rowOf(ids[0])).toMatchObject({
        played: 1,
        signed_up: 1,
        paid_cents: 400,
      });
    });

    it('keeps a signed-up player outside the convocatoria as text, with no team', () => {
      const marta = flow.players.add(flow.seasonId, 'Marta', 1).id;
      flow.participations.set(gameId, marta, { signed_up: true });

      const result = service.paste(
        gameId,
        paste(`${names(0, 6)}\nMarta`, names(6, 13))
      );

      expect(result.outside.map(m => m.name)).toEqual(['Marta']);
      expect(rowOf(marta)).toMatchObject({ team: null, signed_up: 1 });
    });

    it('leaves unmatched and ambiguous names unresolved, with no team for anyone', () => {
      const pepe = flow.players.add(flow.seasonId, 'Pepe Uno', 1).id;
      const otro = flow.players.add(flow.seasonId, 'Pepe Dos', 1).id;
      aliases.add(pepe, 'Pepito');
      aliases.add(otro, 'Pepito');

      const result = service.paste(
        gameId,
        paste(names(0, 7), `Nadie Conocido\nPepito\n${names(7, 13)}`)
      );

      expect(result.unresolved.map(u => u.reason)).toEqual([
        'unmatched',
        'ambiguous',
      ]);
      expect(result.unresolved[1].candidates.map(c => c.id).sort()).toEqual(
        [pepe, otro].sort()
      );
      expect(rowOf(ids[0]).team).toBe('claros');
      expect(
        flow.participations.list(gameId).some(p => p.player_id === pepe)
      ).toBe(false);
    });

    it('ignores an anonymous plus-one line', () => {
      const result = service.paste(
        gameId,
        paste(`${names(0, 7)}\n${names(0, 1)} +1`, names(7, 14))
      );

      expect(result.ignored).toHaveLength(1);
      expect(result.matched).toHaveLength(14);
    });

    it('replaces the teams recorded before when pasted again', () => {
      service.paste(gameId, standardPaste());

      service.paste(gameId, paste(names(7, 14), names(0, 7)));

      expect(rowOf(ids[0]).team).toBe('oscuros');
      expect(rowOf(ids[13]).team).toBe('claros');
    });

    it('assigns the member chosen for an unresolved line, only that one', () => {
      service.paste(gameId, standardPaste());
      const pepe = flow.players.nameOf(ids[13])!;
      const line = { position: 15, kind: 'plain' as const, name: 'Pepito' };

      const result = service.resolve(
        gameId,
        { line, field: 'name', team: 'claros' },
        { type: 'linkAsAlias', playerId: ids[13] }
      );

      expect(result).toMatchObject({
        outcome: 'assigned',
        member: { name: pepe, team: 'claros' },
      });
      expect(rowOf(ids[13]).team).toBe('claros');
      expect(rowOf(ids[0]).team).toBe('claros');
      expect(rowOf(ids[7]).team).toBe('oscuros');
      expect(
        aliases.listAll().some(a => a.alias.toLowerCase() === 'pepito')
      ).toBe(true);
    });

    it('refuses to register a new player or to choose a non-member', () => {
      const line = { position: 1, kind: 'plain' as const, name: 'Nuevo' };
      const outsider = flow.players.add(flow.seasonId, 'Luis', 1).id;

      expect(() =>
        service.resolve(
          gameId,
          { line, field: 'name', team: 'claros' },
          { type: 'register', name: 'Nuevo' }
        )
      ).toThrow('Aquí solo se puede elegir un jugador de la convocatoria');
      expect(() =>
        service.resolve(
          gameId,
          { line, field: 'name', team: 'claros' },
          { type: 'link', playerId: outsider }
        )
      ).toThrow('Luis no estaba en la convocatoria');
    });

    it('does not ask for teams when a payment is recorded', () => {
      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: ids[0] }],
          payerPlayerId: ids[0],
        })
      ).not.toThrow();
      expect(rowOf(ids[0]).team).toBeNull();
    });
  });
});
