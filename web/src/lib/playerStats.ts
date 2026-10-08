import type { PaymentValue } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';

export type Tone = 'good' | 'bad' | 'muted';

/**
 * How one statistic of the player report is shown. A new statistic is a new
 * entry in `PLAYER_STATS`, matching the key its server-side class reports.
 */
export interface PlayerStatView {
  key: string;
  title: string;
  /** What the stat says about one game; `value` is undefined when it has none. */
  cell: (value: unknown) => { text: string; tone: Tone };
  /** What the stat says about all the games. */
  summary: (summary: unknown) => string;
}

const payment: PlayerStatView = {
  key: 'payment',
  title: 'Pago',
  cell: value => {
    const v = value as PaymentValue | undefined;
    if (v?.status === 'paid') {
      const by = v.payerName ? ` · por ${v.payerName}` : '';
      return {
        text: `Pagado ${euros(v.amountCents)} · ${fmtDate(v.paidOn)}${by}`,
        tone: 'good',
      };
    }
    if (v?.status === 'owed')
      return { text: `Debe ${euros(v.amountCents)}`, tone: 'bad' };
    return { text: '—', tone: 'muted' };
  },
  summary: summary => {
    const s = summary as { paid: number; owed: number; owedCents: number };
    return s.owed > 0
      ? `${s.paid} pagados · ${s.owed} sin pagar (${euros(s.owedCents)})`
      : `${s.paid} pagados · al corriente`;
  },
};

const callUp: PlayerStatView = {
  key: 'callUp',
  title: 'Convocatoria',
  cell: value => {
    switch (value) {
      case 'played':
        return { text: 'Jugó', tone: 'good' };
      case 'mercy':
        return { text: 'Jugó con plaza de gracia', tone: 'good' };
      case 'out':
        return { text: 'Fuera · +1 punto', tone: 'bad' };
      case 'demoted':
        return { text: 'Degradado · +1 punto', tone: 'bad' };
      default:
        return { text: '—', tone: 'muted' };
    }
  },
  summary: summary => {
    const s = summary as {
      played: number;
      out: number;
      mercy: number;
      demoted: number;
    };
    return `${s.played + s.mercy} jugados · ${s.out + s.demoted} fuera`;
  },
};

/** The per-game statistics, in the order their columns appear. */
export const PLAYER_STATS: PlayerStatView[] = [callUp, payment];

/** One labelled figure of a season statistic. */
export interface SeasonFigure {
  label: string;
  value: string;
  tone?: Tone;
}

/** How one season-wide statistic is shown; `value` is what the server computed. */
export interface PlayerSeasonStatView {
  key: string;
  title: string;
  figures: (value: unknown) => SeasonFigure[];
}

const points1 = (n: number) => n.toFixed(2).replace('.', ',');

const points: PlayerSeasonStatView = {
  key: 'points',
  title: 'Puntos',
  figures: value => {
    const v = value as {
      points: number;
      paidGames: number;
      exclusions: number;
      seniority: number;
      gamesPlayed: number;
      rank: number;
      of: number;
    };
    return [
      { label: 'Puntos', value: points1(v.points) },
      { label: 'Puesto', value: `${v.rank} de ${v.of}` },
      { label: 'Partidos jugados', value: String(v.gamesPlayed) },
      { label: 'Por partidos pagados', value: String(v.paidGames) },
      { label: 'Por quedar fuera', value: String(v.exclusions) },
      { label: 'Por antigüedad', value: points1(v.seniority) },
    ];
  },
};

const mercy: PlayerSeasonStatView = {
  key: 'mercy',
  title: 'Plaza de gracia',
  figures: value => {
    const v = value as {
      outOnPoints: number;
      mercySeats: number;
      demotions: number;
      waitCounter: number;
      threshold: number;
      gamesUntilMercy: number;
    };
    return [
      { label: 'Fuera por puntos', value: String(v.outOnPoints) },
      { label: 'Plazas de gracia', value: String(v.mercySeats) },
      { label: 'Degradado', value: String(v.demotions) },
      {
        label: 'Contador de espera',
        value: `${v.waitCounter} de ${v.threshold}`,
      },
      v.gamesUntilMercy === 0
        ? {
            label: 'Próxima plaza de gracia',
            value: 'Ya es candidato',
            tone: 'good',
          }
        : {
            label: 'Próxima plaza de gracia',
            value: `faltan ${v.gamesUntilMercy} fuera`,
          },
    ];
  },
};

/** The season-wide statistics, one block each. */
export const PLAYER_SEASON_STATS: PlayerSeasonStatView[] = [points, mercy];
