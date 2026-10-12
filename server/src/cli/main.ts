import { args } from '../load-env.js';
import { DatabaseBackup } from '../db/database-backup.js';
import { BACKUP_DIR, db } from '../db/index.js';
import { SystemClock } from '../domain/clock.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { UsernamePolicy } from '../domain/username-policy.js';
import { players, refreshTokens, users } from '../repo/index.js';
import { ViewAsLogRepository } from '../repo/view-as-log-repository.js';
import { UserAdminService } from '../repo/user-admin-service.js';
import { TtyPasswordPrompt } from './password-prompt.js';
import { UserCli } from './user-cli.js';

const cli = new UserCli(
  new UserAdminService(
    users,
    refreshTokens,
    players,
    new PasswordHasher(),
    new PasswordPolicy(),
    new UsernamePolicy(),
    new SystemClock(),
    db()
  ),
  new TtyPasswordPrompt(process.stdin, process.stderr),
  {
    out: text => console.log(text),
    err: text => console.error(text),
  },
  new DatabaseBackup(db(), BACKUP_DIR, new SystemClock(), new LocalCalendar()),
  new ViewAsLogRepository(db())
);

// Exit explicitly: a piped standard input that is never closed would keep the process alive.
process.exit(await cli.run(args));
