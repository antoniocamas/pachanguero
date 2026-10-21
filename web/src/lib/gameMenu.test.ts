import { describe, expect, it } from 'vitest';
import { gameMenuItems } from './gameMenu';

describe('gameMenuItems', () => {
  it('offers only a new game when there is no game', () => {
    expect(gameMenuItems(null)).toEqual(['new']);
  });

  it('offers cancelling and deleting in an open game', () => {
    expect(gameMenuItems('open')).toEqual(['new', 'cancel', 'delete']);
  });

  it.each(['convocatoria_created', 'convocatoria_confirmed'] as const)(
    'offers creating the convocatoria again in %s',
    state => {
      expect(gameMenuItems(state)).toEqual([
        'new',
        'recreate',
        'cancel',
        'delete',
      ]);
    }
  );

  it('offers reopening a played game', () => {
    expect(gameMenuItems('played')).toEqual([
      'new',
      'reopen',
      'cancel',
      'delete',
    ]);
  });

  it('does not offer cancelling a cancelled game', () => {
    expect(gameMenuItems('cancelled')).toEqual(['new', 'delete']);
  });
});
