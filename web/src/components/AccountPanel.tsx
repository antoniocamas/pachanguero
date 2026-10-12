import type { SessionUser, SwitchView } from '../lib/sessionClient';
import { PasswordForm } from './PasswordForm';
import { ViewAs } from './ViewAs';
import { ViewSwitch } from './ViewSwitch';

/**
 * What anyone signed in can do about their own account: the password and, for an admin, the
 * view. While an admin looks at another player the password is not theirs to change here.
 */
export function AccountPanel({
  user,
  onLogout,
  onSwitchView,
}: {
  user: SessionUser;
  onLogout: () => Promise<void>;
  onSwitchView: SwitchView;
}) {
  return (
    <>
      {user.viewingAs === null && <PasswordForm onChanged={onLogout} />}
      <ViewSwitch user={user} onSwitchView={onSwitchView} />
      {user.role === 'admin' && user.mode === 'admin' && (
        <ViewAs onSwitchView={onSwitchView} />
      )}
    </>
  );
}
