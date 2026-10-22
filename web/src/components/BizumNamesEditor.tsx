import { useState } from 'react';

/** The names the bank shows a player under as a Bizum sender: a Bizum from one of them is theirs. */
export function BizumNamesEditor({
  playerName,
  names,
  onAdd,
  onRemove,
}: {
  playerName: string;
  names: string[];
  onAdd: (name: string) => Promise<boolean>;
  onRemove: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="resolve" data-testid="bizum-names">
      <div className="actions">
        <span className="muted">Nombres en Bizum:</span>
        {names.length === 0 && <span className="muted">ninguno</span>}
        {names.map(n => (
          <span key={n} className="tag">
            {n}{' '}
            <button
              className="btn"
              aria-label={`Quitar nombre de Bizum ${n}`}
              onClick={() => onRemove(n)}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="actions">
        <input
          aria-label={`Nuevo nombre de Bizum de ${playerName}`}
          placeholder="Como lo muestra el banco"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button
          className="btn"
          disabled={!name.trim()}
          onClick={async () => {
            if (await onAdd(name.trim())) setName('');
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
