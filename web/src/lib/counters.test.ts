import { describe, expect, it } from 'vitest';
import { counters } from './counters';
import { DetailFixture } from './detailFixture';

describe('counters', () => {
  it('counts the saved list before there is a convocatoria', () => {
    const detail = new DetailFixture()
      .player(1, 'Ana', 1)
      .player(2, 'Bea', 2)
      .plusOne(1, 3)
      .build();

    expect(counters(detail, 14)).toEqual({
      apuntados: 3,
      plazas: 14,
      pagados: 0,
      deudaCents: 0,
    });
  });

  it('counts the entries once there is a convocatoria', () => {
    const detail = new DetailFixture()
      .state('convocatoria_created')
      .player(1, 'Ana', 1)
      .entry(1, 1)
      .entry({ host: 1, ordinal: 1 }, 2)
      .build();

    expect(counters(detail, 14).apuntados).toBe(2);
  });

  it('counts the shares settled and what is still owed, each share once', () => {
    const detail = new DetailFixture()
      .state('played')
      .player(1, 'Ana', 1)
      .player(2, 'Marta', 2)
      .player(3, 'Dani', 3)
      .debt(1, 1)
      .debt(1, 2)
      .payment(3, 3, 3)
      .build();

    expect(counters(detail, 14)).toMatchObject({
      pagados: 1,
      deudaCents: 800,
    });
  });
});
