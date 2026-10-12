import type { SessionUser } from '../lib/sessionClient';
import { PasswordForm } from './PasswordForm';
import { ViewSwitch } from './ViewSwitch';

/** What anyone signed in can do about their own account: the password and, for an admin, the view. */
export function AccountPanel({
  user,
  onLogout,
  onSwitchView,
}: {
  user: SessionUser;
  onLogout: () => Promise<void>;
  onSwitchView: (view: 'admin' | 'regular') => Promise<void>;
}) {
  return (
    <>
      <PasswordForm onChanged={onLogout} />
      <ViewSwitch user={user} onSwitchView={onSwitchView} />
    </>
  );
}
