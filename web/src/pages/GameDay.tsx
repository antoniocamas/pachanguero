import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ConvocatoriaResult, type Game, type GameDetail, type Player, type Season } from '../api';

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * The screen that replaces hand-editing the spreadsheet: one row per player,
 * three taps' worth of state. Signed up / played / paid are separate here on
 * purpose — in the sheet they all shared one '*' cell.
 */
export function GameDay({
  season,
  players,
  games,
  onGamesChanged,
}: {
  season: Season;
  players: Player[];
  games: Game[];
  onGamesChanged: () => void;
}) {
  const [gameId, setGameId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [preview, setPreview] = useState<ConvocatoriaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the next scheduled game, else the most recent one.
  useEffect(() => {
    if (gameId || !games.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = games.find((g) => g.played_on >= today && g.status !== 'cancelled');
    setGameId((upcoming ?? games[games.length - 1]).id);
  }, [games, gameId]);

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      setDetail(await api.game(gameId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gameId]);

  useEffect(() => {
    setPreview(null);
    void load();
  }, [load]);

  const perHead = Math.round(season.price_cents / season.slots);

  const byPlayer = useMemo(() => {
    const map = new Map(detail?.participations.map((p) => [p.player_id, p]) ?? []);
    return map;
  }, [detail]);

  const signedCount = detail?.participations.filter((p) => p.signed_up).length ?? 0;
  const paidCount = detail?.participations.filter((p) => p.paid_cents > 0).length ?? 0;
  const owed = (detail?.participations ?? [])
    .filter((p) => p.played && p.paid_cents === 0)
    .reduce((sum) => sum + perHead, 0);

  async function mutate(playerId: number, patch: Parameters<typeof api.setParticipation>[2]) {
    if (!gameId) return;
    setBusy(true);
    try {
      const rows = await api.setParticipation(gameId, playerId, patch);
      setDetail((d) => (d ? { ...d, participations: rows } : d));
      setPreview(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addGame() {
    const iso = prompt('Fecha del partido (AAAA-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!iso) return;
    try {
      const game = await api.createGame(season.id, iso);
      onGamesChanged();
      setGameId(game.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const outcomeOf = (playerId: number) => {
    const saved = detail?.convocatoria?.entries.find((e) => e.player_id === playerId);
    const live = preview?.entries.find((e) => e.playerId === playerId);
    return live?.outcome ?? saved?.outcome ?? null;
  };

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h2>
          Partido
          <span className="right">
            <button className="btn" onClick={addGame}>+ Nuevo</button>
          </span>
        </h2>
        <div style={{ padding: '12px 14px' }}>
          <select
            value={gameId ?? ''}
            onChange={(e) => setGameId(Number(e.target.value))}
            aria-label="Elegir partido"
          >
            {games.length === 0 && <option value="">Sin partidos todavía</option>}
            {[...games].reverse().map((g) => (
              <option key={g.id} value={g.id}>
                {fmtDate(g.played_on)}
                {g.label ? ` (${g.label})` : ''}
                {g.status === 'cancelled' ? ' — cancelado' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="stat-row">
          <div className="stat">
            <b>{signedCount}</b>
            <span>apuntados</span>
          </div>
          <div className="stat">
            <b style={{ color: signedCount > season.slots ? 'var(--warn)' : undefined }}>
              {season.slots}
            </b>
            <span>plazas</span>
          </div>
          <div className="stat">
            <b>{paidCount}</b>
            <span>pagados</span>
          </div>
          <div className="stat">
            <b style={{ color: owed ? 'var(--danger)' : undefined }}>{euros(owed)}</b>
            <span>deuda €</span>
          </div>
        </div>
      </div>

      {gameId && (
        <div className="card">
          <h2>
            Jugadores
            <span className="right muted">
              {signedCount > season.slots ? 'hay que convocar' : 'entran todos'}
            </span>
          </h2>
          {players.length === 0 && <div className="empty">Añade jugadores primero.</div>}
          {players.map((p) => {
            const row = byPlayer.get(p.id);
            const signed = !!row?.signed_up;
            const played = !!row?.played;
            const paid = (row?.paid_cents ?? 0) > 0;
            const outcome = outcomeOf(p.id);
            return (
              <div key={p.id} className={`row ${signed ? '' : 'out'}`}>
                <span className="name">
                  {p.name}
                  {outcome === 'mercy' && <> <span className="tag mercy">mercy</span></>}
                  {outcome === 'demoted' && <> <span className="tag demoted">fuera</span></>}
                  {played && !paid && <> <span className="tag debt">debe</span></>}
                </span>
                <div className="chips">
                  <button
                    className="chip signed"
                    data-on={signed}
                    disabled={busy}
                    onClick={() => mutate(p.id, { signed_up: !signed })}
                    title="Se apunta a este partido"
                  >
                    apunta
                  </button>
                  <button
                    className={`chip ${paid ? 'paid' : played ? 'debt' : ''}`}
                    data-on={played}
                    disabled={busy}
                    onClick={() =>
                      mutate(p.id, played && paid
                        ? { played: false, paid_cents: 0 }
                        : played
                          ? { paid_cents: perHead }
                          : { signed_up: true, played: true })
                    }
                    title="Sin jugar → jugó (debe) → pagó"
                  >
                    {paid ? `${euros(perHead)} €` : played ? 'debe' : 'jugó'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {gameId && (
        <div className="card">
          <h2>Convocatoria</h2>
          <div className="actions">
            <button
              className="btn"
              disabled={busy || !signedCount}
              onClick={async () => {
                try {
                  setPreview(await api.preview(gameId));
                  setError(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Simular
            </button>
            <button
              className="btn primary"
              disabled={busy || !signedCount}
              onClick={async () => {
                if (!confirm('Guardar la convocatoria y marcar quién juega?')) return;
                try {
                  setPreview(await api.commit(gameId));
                  await load();
                  setError(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Confirmar
            </button>
          </div>

          {(preview ?? detail?.convocatoria) && <ConvocatoriaList
            slots={season.slots}
            rows={
              preview
                ? preview.entries.map((e) => ({ ...e, id: e.playerId }))
                : (detail!.convocatoria!.entries.map((e) => ({
                    id: e.player_id,
                    name: e.name,
                    points: e.points,
                    position: e.position,
                    outcome: e.outcome,
                    waitCounter: e.wait_counter,
                    playing: !!e.playing,
                  })))
            }
          />}
        </div>
      )}
    </>
  );
}

function ConvocatoriaList({
  rows,
  slots,
}: {
  slots: number;
  rows: Array<{
    id: number;
    name: string;
    points: number;
    position: number;
    outcome: string;
    waitCounter: number;
    playing: boolean;
  }>;
}) {
  if (!rows.length) return <div className="empty">Nadie apuntado.</div>;
  return (
    <>
      {rows.map((e) => (
        <div
          key={e.id}
          className={[
            'row',
            e.playing ? '' : 'out',
            e.outcome === 'mercy' ? 'mercy' : '',
            e.outcome === 'demoted' ? 'demoted' : '',
            e.position === slots ? 'cut' : '',
          ].join(' ')}
        >
          <span className="pos">{e.position}</span>
          <span className="name">
            {e.name}
            {e.outcome === 'mercy' && <> <span className="tag mercy">mercy</span></>}
            {e.outcome === 'demoted' && <> <span className="tag demoted">degradado</span></>}
          </span>
          {e.waitCounter > 0 && <span className="pts" title="Partidos esperando">⏳{e.waitCounter}</span>}
          <span className="pts">{e.points.toFixed(2)}</span>
        </div>
      ))}
    </>
  );
}
