import { AdminShell } from './pages/AdminShell';
import { Login } from './pages/Login';
import { useSession } from './hooks/useSession';

export function App() {
  const { state, login, logout } = useSession();

  if (state.status === 'loading') {
    return <div className="empty">Cargando…</div>;
  }
  if (state.status === 'anonymous') {
    return <Login onLogin={login} />;
  }
  if (state.user.mode === 'admin') {
    return <AdminShell user={state.user} onLogout={logout} />;
  }
  return (
    <div className="app">
      <header className="top">
        <h1>
          <span aria-hidden>⚽</span> Pachanguero
          <button className="btn link top-action" onClick={() => void logout()}>
            Salir
          </button>
        </h1>
      </header>
      <div className="card">
        <div className="empty">
          Tu vista de jugador estará disponible pronto.
        </div>
      </div>
    </div>
  );
}
