import { AdminShell } from './pages/AdminShell';
import { Login } from './pages/Login';
import { OwnView } from './pages/OwnView';
import { useSession } from './hooks/useSession';

export function App() {
  const { state, login, logout, switchView } = useSession();

  if (state.status === 'loading') {
    return <div className="empty">Cargando…</div>;
  }
  if (state.status === 'anonymous') {
    return <Login onLogin={login} />;
  }
  const Shell = state.user.mode === 'admin' ? AdminShell : OwnView;
  return (
    <Shell user={state.user} onLogout={logout} onSwitchView={switchView} />
  );
}
