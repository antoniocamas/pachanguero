export type PlayersView = 'stats' | 'table';

const VIEWS: Array<{ id: PlayersView; label: string }> = [
  { id: 'stats', label: 'Estadísticas' },
  { id: 'table', label: 'Tabla' },
];

/** The two views of Jugadores: one player's statistics, or every player in a table. */
export function PlayersViewTabs({
  view,
  onSelect,
}: {
  view: PlayersView;
  onSelect: (view: PlayersView) => void;
}) {
  return (
    <div className="view-tabs" role="tablist" aria-label="Vistas de Jugadores">
      {VIEWS.map(v => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          onClick={() => onSelect(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
