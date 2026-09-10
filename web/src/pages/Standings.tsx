import { useEffect, useState } from 'react';
import { api, type Season, type Standing } from '../api';

const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function Standings({ season }: { season: Season }) {
  const [rows, setRows] = useState<Standing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.standings(season.id).then(setRows).catch((e) => setError(e.message));
  }, [season.id]);

  const debtors = rows.filter((r) => r.debtCents > 0);
  const totalDebt = debtors.reduce((s, r) => s + r.debtCents, 0);

  return (
    <>
      {error && <div className="err">{error}</div>}

      {debtors.length > 0 && (
        <div className="card">
          <h2>
            Quién debe
            <span className="right" style={{ color: 'var(--danger)' }}>{euros(totalDebt)} €</span>
          </h2>
          {debtors.map((r) => (
            <div key={r.playerId} className="row">
              <span className="name">{r.name}</span>
              <span className="tag debt">{euros(r.debtCents)} €</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>
          Clasificación
          <span className="right muted">{rows.length} jugones</span>
        </h2>
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>Jugón</th>
                <th>Puntos</th>
                <th>Asis</th>
                <th>Fuera</th>
                <th>Antig</th>
                <th>Temp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.playerId}>
                  <td>
                    <span className="muted" style={{ marginRight: 8 }}>{i + 1}</span>
                    {r.name}
                  </td>
                  <td><b>{r.points.toFixed(2)}</b></td>
                  <td>{r.paidGames}</td>
                  <td>{r.exclusions}</td>
                  <td>{r.seniority.toFixed(2)}</td>
                  <td className="muted">{r.seasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="empty">Sin datos todavía.</div>}
      </div>
    </>
  );
}
