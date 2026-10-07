import { describe, expect, it } from 'vitest';
import { GameLifecycle, type GamePosition } from './game-lifecycle.js';
import type { Capability, GameAction, GameState } from './types.js';

const at = (
  status: GameState,
  cancelledFrom: GamePosition['cancelledFrom'] = null
): GamePosition => ({ status, cancelledFrom });

const PLAYED = 'Reabre el partido para editarlo';
const CANCELLED = 'El partido está cancelado';
const CONFIRM_FIRST =
  'Confirma la convocatoria antes de marcar el partido como jugado';

describe('GameLifecycle.next', () => {
  const lifecycle = new GameLifecycle();

  it.each<[GameAction, GameState, GameState]>([
    ['create', 'open', 'convocatoria_created'],
    ['create', 'convocatoria_created', 'convocatoria_created'],
    ['create', 'convocatoria_confirmed', 'convocatoria_created'],
    ['confirm', 'convocatoria_created', 'convocatoria_confirmed'],
    ['play', 'convocatoria_confirmed', 'played'],
    ['reopen', 'played', 'convocatoria_confirmed'],
  ])('%s moves %s to %s', (action, from, to) => {
    expect(lifecycle.next(at(from), action)).toEqual({
      status: to,
      cancelledFrom: null,
    });
  });

  it.each<[GameAction, GameState, string]>([
    ['create', 'played', PLAYED],
    ['create', 'cancelled', CANCELLED],
    ['confirm', 'open', 'Crea la convocatoria antes de confirmarla'],
    ['confirm', 'convocatoria_confirmed', 'La convocatoria ya está confirmada'],
    ['confirm', 'played', PLAYED],
    ['confirm', 'cancelled', CANCELLED],
    ['play', 'open', CONFIRM_FIRST],
    ['play', 'convocatoria_created', CONFIRM_FIRST],
    ['play', 'played', 'El partido ya está jugado'],
    ['play', 'cancelled', CANCELLED],
    ['reopen', 'open', 'El partido no está jugado'],
    ['reopen', 'convocatoria_created', 'El partido no está jugado'],
    ['reopen', 'convocatoria_confirmed', 'El partido no está jugado'],
    ['reopen', 'cancelled', 'El partido no está jugado'],
    ['cancel', 'cancelled', 'El partido ya está cancelado'],
    ['uncancel', 'open', 'El partido no está cancelado'],
    ['uncancel', 'convocatoria_created', 'El partido no está cancelado'],
    ['uncancel', 'convocatoria_confirmed', 'El partido no está cancelado'],
    ['uncancel', 'played', 'El partido no está cancelado'],
  ])('%s from %s is refused: %s', (action, from, message) => {
    expect(() => lifecycle.next(at(from), action)).toThrow(message);
  });

  it.each<Exclude<GameState, 'cancelled'>>([
    'open',
    'convocatoria_created',
    'convocatoria_confirmed',
    'played',
  ])('cancel from %s remembers it and uncancel returns there', from => {
    const cancelled = lifecycle.next(at(from), 'cancel');
    expect(cancelled).toEqual({ status: 'cancelled', cancelledFrom: from });
    expect(lifecycle.next(cancelled, 'uncancel')).toEqual({
      status: from,
      cancelledFrom: null,
    });
  });
});

describe('GameLifecycle.require', () => {
  const lifecycle = new GameLifecycle();

  it.each<[Capability, GameState]>([
    ['edit_apuntados', 'open'],
    ['edit_apuntados', 'convocatoria_created'],
    ['edit_apuntados', 'convocatoria_confirmed'],
    ['edit_convocatoria', 'convocatoria_created'],
    ['edit_convocatoria', 'convocatoria_confirmed'],
    ['pay', 'played'],
    ['teams', 'played'],
  ])('%s is allowed in %s', (capability, state) => {
    expect(() => lifecycle.require(state, capability)).not.toThrow();
  });

  it.each<[Capability, GameState, string]>([
    ['edit_apuntados', 'played', PLAYED],
    ['edit_apuntados', 'cancelled', CANCELLED],
    ['edit_convocatoria', 'open', 'Crea la convocatoria antes de editarla'],
    ['edit_convocatoria', 'played', PLAYED],
    ['edit_convocatoria', 'cancelled', CANCELLED],
    ['pay', 'open', 'Marca el partido como jugado antes de registrar pagos'],
    [
      'pay',
      'convocatoria_created',
      'Marca el partido como jugado antes de registrar pagos',
    ],
    [
      'pay',
      'convocatoria_confirmed',
      'Marca el partido como jugado antes de registrar pagos',
    ],
    ['pay', 'cancelled', CANCELLED],
    [
      'teams',
      'open',
      'Marca el partido como jugado antes de pegar los equipos',
    ],
    [
      'teams',
      'convocatoria_created',
      'Marca el partido como jugado antes de pegar los equipos',
    ],
    [
      'teams',
      'convocatoria_confirmed',
      'Marca el partido como jugado antes de pegar los equipos',
    ],
    ['teams', 'cancelled', CANCELLED],
  ])('%s is refused in %s: %s', (capability, state, message) => {
    expect(() => lifecycle.require(state, capability)).toThrow(message);
  });
});

describe('GameLifecycle.nextAction', () => {
  const lifecycle = new GameLifecycle();

  it.each<[GameState, boolean, string | null]>([
    ['open', false, 'Crear convocatoria'],
    ['convocatoria_created', false, 'Confirmar convocatoria'],
    ['convocatoria_confirmed', false, 'Marcar como jugado'],
    ['played', true, 'Registrar pagos'],
    ['played', false, null],
    ['cancelled', false, 'Deshacer cancelación'],
  ])('%s (owes %s) offers %s', (state, owes, expected) => {
    expect(lifecycle.nextAction(state, owes)).toBe(expected);
  });
});
