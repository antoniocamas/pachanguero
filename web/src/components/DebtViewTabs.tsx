export type DebtView = 'debts' | 'waiting' | 'settled';

const VIEWS: Array<{ id: DebtView; label: string }> = [
  { id: 'debts', label: 'Deudas' },
  { id: 'waiting', label: 'En espera' },
  { id: 'settled', label: 'Liquidados' },
];

/** The three views of Deudas; what waits for the organiser carries its number. */
export function DebtViewTabs({
  view,
  waiting,
  settled,
  onSelect,
}: {
  view: DebtView;
  waiting: number;
  settled: number;
  onSelect: (view: DebtView) => void;
}) {
  const count: Record<DebtView, number | null> = {
    debts: null,
    waiting,
    settled,
  };
  return (
    <div className="view-tabs" role="tablist" aria-label="Vistas de Deudas">
      {VIEWS.map(v => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          onClick={() => onSelect(v.id)}
        >
          {v.label}
          {count[v.id] !== null && count[v.id]! > 0 && (
            <span className={`count${v.id === 'waiting' ? ' alert' : ''}`}>
              {count[v.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
