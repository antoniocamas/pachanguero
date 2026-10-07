import type { Capability, GameAction, GameState } from './types.js';

/** A game's stored position: its state and, when cancelled, the state it left. */
export interface GamePosition {
  status: GameState;
  cancelledFrom: Exclude<GameState, 'cancelled'> | null;
}

type Destination = GameState | 'remembered';

/**
 * The legal moves of a game and what each state lets someone do. Both are
 * tables, so a new state or action is a row, not another branch.
 */
export class GameLifecycle {
  private readonly transitions: Record<
    GameAction,
    Partial<Record<GameState, Destination>>
  > = {
    create: {
      open: 'convocatoria_created',
      convocatoria_created: 'convocatoria_created',
      convocatoria_confirmed: 'convocatoria_created',
    },
    confirm: { convocatoria_created: 'convocatoria_confirmed' },
    play: { convocatoria_confirmed: 'played' },
    reopen: { played: 'convocatoria_confirmed' },
    cancel: {
      open: 'cancelled',
      convocatoria_created: 'cancelled',
      convocatoria_confirmed: 'cancelled',
      played: 'cancelled',
    },
    uncancel: { cancelled: 'remembered' },
  };

  private readonly refusedPlayed = 'Reabre el partido para editarlo';
  private readonly refusedCancelled = 'El partido está cancelado';

  private readonly actionRefusals: Record<
    GameAction,
    Partial<Record<GameState, string>>
  > = {
    create: { played: this.refusedPlayed, cancelled: this.refusedCancelled },
    confirm: {
      open: 'Crea la convocatoria antes de confirmarla',
      convocatoria_confirmed: 'La convocatoria ya está confirmada',
      played: this.refusedPlayed,
      cancelled: this.refusedCancelled,
    },
    play: {
      open: 'Confirma la convocatoria antes de marcar el partido como jugado',
      convocatoria_created:
        'Confirma la convocatoria antes de marcar el partido como jugado',
      played: 'El partido ya está jugado',
      cancelled: this.refusedCancelled,
    },
    reopen: {
      open: 'El partido no está jugado',
      convocatoria_created: 'El partido no está jugado',
      convocatoria_confirmed: 'El partido no está jugado',
      cancelled: 'El partido no está jugado',
    },
    cancel: { cancelled: 'El partido ya está cancelado' },
    uncancel: {
      open: 'El partido no está cancelado',
      convocatoria_created: 'El partido no está cancelado',
      convocatoria_confirmed: 'El partido no está cancelado',
      played: 'El partido no está cancelado',
    },
  };

  private readonly capabilities: Record<
    Capability,
    {
      allowedIn: readonly GameState[];
      refusals: Partial<Record<GameState, string>>;
    }
  > = {
    edit_apuntados: {
      allowedIn: ['open', 'convocatoria_created', 'convocatoria_confirmed'],
      refusals: {
        played: this.refusedPlayed,
        cancelled: this.refusedCancelled,
      },
    },
    edit_convocatoria: {
      allowedIn: ['convocatoria_created', 'convocatoria_confirmed'],
      refusals: {
        open: 'Crea la convocatoria antes de editarla',
        played: this.refusedPlayed,
        cancelled: this.refusedCancelled,
      },
    },
    pay: {
      allowedIn: ['played'],
      refusals: {
        open: 'Marca el partido como jugado antes de registrar pagos',
        convocatoria_created:
          'Marca el partido como jugado antes de registrar pagos',
        convocatoria_confirmed:
          'Marca el partido como jugado antes de registrar pagos',
        cancelled: this.refusedCancelled,
      },
    },
    teams: {
      allowedIn: ['played'],
      refusals: {
        open: 'Marca el partido como jugado antes de pegar los equipos',
        convocatoria_created:
          'Marca el partido como jugado antes de pegar los equipos',
        convocatoria_confirmed:
          'Marca el partido como jugado antes de pegar los equipos',
        cancelled: this.refusedCancelled,
      },
    },
  };

  /** Where `action` takes a game, or the reason it cannot; cancelling remembers where it left. */
  next(position: GamePosition, action: GameAction): GamePosition {
    const destination = this.transitions[action][position.status];
    if (destination === undefined) {
      throw new Error(
        this.actionRefusals[action][position.status] ?? 'Acción no válida'
      );
    }
    if (destination === 'remembered') {
      return { status: position.cancelledFrom!, cancelledFrom: null };
    }
    if (destination === 'cancelled') {
      return {
        status: 'cancelled',
        cancelledFrom: position.status as GamePosition['cancelledFrom'],
      };
    }
    return { status: destination, cancelledFrom: null };
  }

  /** Throws the capability's refusal unless the state allows it. */
  require(state: GameState, capability: Capability): void {
    const rule = this.capabilities[capability];
    if (rule.allowedIn.includes(state)) return;
    throw new Error(rule.refusals[state] ?? 'Acción no válida');
  }

  /** The one thing the screen offers next, or none when nothing is left to do. */
  nextAction(state: GameState, owes: boolean): string | null {
    switch (state) {
      case 'open':
        return 'Crear convocatoria';
      case 'convocatoria_created':
        return 'Confirmar convocatoria';
      case 'convocatoria_confirmed':
        return 'Marcar como jugado';
      case 'played':
        return owes ? 'Registrar pagos' : null;
      case 'cancelled':
        return 'Deshacer cancelación';
    }
  }
}
