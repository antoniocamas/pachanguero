import { useCallback, useMemo, useState } from 'react';
import { GameBar } from '../components/GameBar';
import { LineView } from '../components/LineView';
import { OpenView } from '../components/OpenView';
import { PlayedView } from '../components/PlayedView';
import { ReadOnlyView } from '../components/ReadOnlyView';
import { fmtDate } from '../lib/dates';
import { counters } from '../lib/counters';
import { buildRows } from '../lib/gameRows';
import { pickDefaultGame } from '../lib/defaultGame';
import { localToday } from '../lib/today';
import { useGameActions } from '../hooks/useGameActions';
import { useGameDetail } from '../hooks/useGameDetail';
import { useKnownPlayers } from '../hooks/useKnownPlayers';
import type { Game, GameDetail, Player, Season } from '../api';

/**
 * The screen that runs a game from sign-ups to played: the bar keeps its state
 * and next step in view, and one table of players follows the state below it.
 */
export function GameDay({
  season,
  games,
  onGamesChanged,
  onSelectSeason,
}: {
  season: Season;
  players: Player[];
  games: Game[];
  onGamesChanged: () => void;
  onSelectSeason: (seasonId: number) => void;
}) {
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const defaultGameId = useMemo(
    () => pickDefaultGame(games, localToday())?.id ?? null,
    [games]
  );
  // The default is pinned once found: playing the game must not make it
  // stop being "the default" and leave the bar without a game.
  if (selectedGameId === null && defaultGameId !== null)
    setSelectedGameId(defaultGameId);
  const gameId = selectedGameId ?? defaultGameId;
  const knownPlayers = useKnownPlayers(games);
  const gameLabel = fmtDate(games.find(g => g.id === gameId)?.played_on ?? '');
  const { detail, error, reload, clear } = useGameDetail(gameId);
  const actions = useGameActions(gameId, reload, setAlert, onGamesChanged);

  const selectGame = useCallback((id: number | null) => {
    setSelectedGameId(id);
    setAlert(null);
  }, []);

  const gameRecorded = (game: Game) => {
    if (game.season_id !== season.id) onSelectSeason(game.season_id);
    else onGamesChanged();
    selectGame(game.id);
  };

  return (
    <>
      <GameBar
        games={games}
        gameId={gameId}
        gameLabel={gameLabel}
        state={detail?.state ?? null}
        nextAction={detail?.nextAction ?? null}
        counters={detail ? counters(detail, season.slots) : null}
        busy={actions.busy}
        actions={{
          create: actions.create,
          confirm: actions.confirm,
          play: () => actions.transition('play'),
          reopen: () => actions.transition('reopen'),
          uncancel: () => actions.transition('uncancel'),
        }}
        onSelect={selectGame}
        onCancel={() => actions.transition('cancel')}
        onRecorded={gameRecorded}
        onDeleted={() => {
          selectGame(null);
          clear();
          onGamesChanged();
        }}
      />

      {(alert ?? error) && (
        <div className="err" role="alert">
          {alert ?? error}
          {alert?.startsWith('Falta la antigüedad') &&
            '. Confírmala en «Lista de apuntados».'}
        </div>
      )}

      {detail && (
        <GameBody
          key={detail.game.id}
          detail={detail}
          gameLabel={gameLabel}
          players={knownPlayers}
          busy={actions.busy}
          reload={reload}
          report={setAlert}
          onMove={actions.move}
          onEnrolled={onGamesChanged}
        />
      )}
    </>
  );
}

/** The part of the screen that depends on the game's state. */
function GameBody({
  detail,
  gameLabel,
  players,
  busy,
  reload,
  report,
  onMove,
  onEnrolled,
}: {
  detail: GameDetail;
  gameLabel: string;
  players: Pick<Player, 'id' | 'name'>[];
  busy: boolean;
  reload: () => Promise<void>;
  report: (message: string | null) => void;
  onMove: Parameters<typeof LineView>[0]['onMove'];
  onEnrolled: () => void;
}) {
  const table = useMemo(() => buildRows(detail), [detail]);
  const candidates = {
    gameId: detail.game.id,
    seasonId: detail.game.season_id,
    gameLabel,
    players,
    onChanged: () => void reload(),
    onEnrolled,
  };

  if (table.readOnly) return <ReadOnlyView table={table} />;
  switch (table.state) {
    case 'open':
      return <OpenView table={table} {...candidates} />;
    case 'convocatoria_created':
    case 'convocatoria_confirmed':
      return (
        <LineView table={table} busy={busy} onMove={onMove} {...candidates} />
      );
    case 'played':
      return (
        <PlayedView
          detail={detail}
          table={table}
          players={players}
          reload={reload}
          report={report}
        />
      );
  }
}
