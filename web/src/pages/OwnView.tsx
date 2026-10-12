import { useState } from 'react';
import { AccountPanel } from '../components/AccountPanel';
import { ContactForm } from '../components/ContactForm';
import { OwnDebts } from '../components/OwnDebts';
import { OwnPayments } from '../components/OwnPayments';
import { OwnStats } from '../components/OwnStats';
import { useOwnDebts } from '../hooks/useOwnDebts';
import { useOwnPayments } from '../hooks/useOwnPayments';
import { useOwnReport } from '../hooks/useOwnReport';
import type { SessionUser, SwitchView } from '../lib/sessionClient';

type Tab = 'debts' | 'payments' | 'stats' | 'settings';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'debts', icon: '💸', label: 'Deudas' },
  { key: 'payments', icon: '🧾', label: 'Pagos' },
  { key: 'stats', icon: '📊', label: 'Estadísticas' },
  { key: 'settings', icon: '⚙️', label: 'Ajustes' },
];

function Debts() {
  const { data, error } = useOwnDebts();
  return (
    <>
      {error && <div className="err">{error}</div>}
      {data && <OwnDebts debts={data} />}
    </>
  );
}

function Payments() {
  const { data, error } = useOwnPayments();
  return (
    <>
      {error && <div className="err">{error}</div>}
      {data && <OwnPayments payments={data} />}
    </>
  );
}

function Stats() {
  const { data, error } = useOwnReport();
  return (
    <>
      {error && <div className="err">{error}</div>}
      {data && <OwnStats report={data} />}
    </>
  );
}

/** The player's own app: their debts, payments and statistics, and their account. */
export function OwnView({
  user,
  onLogout,
  onSwitchView,
}: {
  user: SessionUser;
  onLogout: () => Promise<void>;
  onSwitchView: SwitchView;
}) {
  const [tab, setTab] = useState<Tab>('debts');

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span aria-hidden>⚽</span> Pachanguero
          <span className="season">{user.playerName}</span>
          <button
            className="btn link top-action"
            title={user.username}
            onClick={() => void onLogout()}
          >
            Salir
          </button>
        </h1>
      </header>

      {user.viewingAs !== null ? (
        <div className="ok">
          Estás viendo la aplicación como {user.viewingAs}. Para volver, pulsa
          «Volver a administrador» en Ajustes.
        </div>
      ) : (
        user.role === 'admin' && (
          <div className="ok">Estás viendo la aplicación como jugador.</div>
        )
      )}

      {tab === 'debts' ? (
        <Debts />
      ) : tab === 'payments' ? (
        <Payments />
      ) : tab === 'stats' ? (
        <Stats />
      ) : (
        <>
          <ContactForm />
          <AccountPanel
            user={user}
            onLogout={onLogout}
            onSwitchView={onSwitchView}
          />
        </>
      )}

      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            aria-current={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            <span className="ico" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
