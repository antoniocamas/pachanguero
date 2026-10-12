import { parseArgs } from 'node:util';
import type { Role } from '../domain/types.js';
import {
  UserAdminError,
  type UserAdminService,
} from '../repo/user-admin-service.js';
import type { PasswordPrompt } from './password-prompt.js';

/** Where the tool writes: standard output and error in real life, captured in a test. */
export interface CliIo {
  out(text: string): void;
  err(text: string): void;
}

const USAGE = `Uso: pachanguero-admin <comando> [opciones]

Comandos:
  create     --username <nombre> --role <admin|regular> [--player <id|nombre>]
  list
  reset-pwd  --username <nombre>
  unlock     --username <nombre>
  activate   --username <nombre>
  deactivate --username <nombre>
  promote    --username <nombre>
  demote     --username <nombre>

Las contraseñas se piden por teclado (o por la entrada estándar), nunca como argumento.`;

/** The command line of the operator: parses, asks the service, prints. Exit 0, 1 refused, 2 misuse. */
export class UserCli {
  constructor(
    private readonly admin: UserAdminService,
    private readonly prompt: PasswordPrompt,
    private readonly io: CliIo
  ) {}

  async run(argv: string[]): Promise<number> {
    const [command, ...rest] = argv;
    try {
      switch (command) {
        case 'create':
          return await this.create(rest);
        case 'list':
          return this.list();
        case 'reset-pwd':
          return await this.resetPassword(rest);
        case 'unlock':
          return this.single(
            rest,
            name => this.admin.unlock(name),
            'Cuenta desbloqueada'
          );
        case 'activate':
          return this.single(
            rest,
            name => this.admin.activate(name),
            'Usuario activado'
          );
        case 'deactivate':
          return this.single(
            rest,
            name => this.admin.deactivate(name),
            'Usuario desactivado'
          );
        case 'promote':
          return this.single(
            rest,
            name => this.admin.promote(name),
            'Ahora es administrador'
          );
        case 'demote':
          return this.single(
            rest,
            name => this.admin.demote(name),
            'Ahora es usuario normal'
          );
        default:
          return this.usage(
            command ? `Comando desconocido: ${command}` : undefined
          );
      }
    } catch (error) {
      if (error instanceof UsageError) return this.usage(error.message);
      if (error instanceof UserAdminError) {
        this.io.err(`✗ ${error.message}`);
        return 1;
      }
      throw error;
    }
  }

  private async create(args: string[]): Promise<number> {
    const { username, role, player } = this.options(args, {
      username: { type: 'string' },
      role: { type: 'string' },
      player: { type: 'string' },
    });
    if (!username) throw new UsageError('Falta --username');
    if (role !== 'admin' && role !== 'regular') {
      throw new UsageError('--role debe ser admin o regular');
    }
    const password = await this.askPassword();
    const created = await this.admin.create({
      username,
      password,
      role: role as Role,
      player,
    });
    const who = created.playerName ? ` (jugador: ${created.playerName})` : '';
    this.io.out(
      `✓ Usuario "${created.username}" creado como ${created.role}${who}`
    );
    return 0;
  }

  private async resetPassword(args: string[]): Promise<number> {
    const { username } = this.options(args, { username: { type: 'string' } });
    if (!username) throw new UsageError('Falta --username');
    const password = await this.askPassword();
    await this.admin.resetPassword(username, password);
    this.io.out(
      `✓ Contraseña cambiada para "${username}"; sus sesiones se han cerrado`
    );
    return 0;
  }

  private list(): number {
    const accounts = this.admin.list();
    if (accounts.length === 0) {
      this.io.out('No hay usuarios');
      return 0;
    }
    const rows = accounts.map(a => [
      a.username,
      a.role,
      a.playerName ?? '-',
      a.active ? 'activo' : 'inactivo',
      a.locked ? 'bloqueado' : '',
    ]);
    const widths = rows[0].map((_, col) =>
      Math.max(...rows.map(row => row[col].length))
    );
    for (const row of rows) {
      this.io.out(
        row
          .map((cell, col) => cell.padEnd(widths[col]))
          .join('  ')
          .trimEnd()
      );
    }
    return 0;
  }

  private single(
    args: string[],
    act: (username: string) => void,
    done: string
  ): number {
    const { username } = this.options(args, { username: { type: 'string' } });
    if (!username) throw new UsageError('Falta --username');
    act(username);
    this.io.out(`✓ ${done}: "${username}"`);
    return 0;
  }

  private async askPassword(): Promise<string> {
    const first = await this.prompt.read('Contraseña: ');
    const second = await this.prompt.read('Contraseña de nuevo: ');
    if (first !== second)
      throw new UserAdminError('Las contraseñas no coinciden');
    return first;
  }

  private options<T extends Record<string, { type: 'string' }>>(
    args: string[],
    spec: T
  ) {
    try {
      return parseArgs({ args, options: spec, allowPositionals: false })
        .values as {
        [K in keyof T]?: string;
      };
    } catch (error) {
      throw new UsageError((error as Error).message);
    }
  }

  private usage(problem?: string): number {
    if (problem) this.io.err(problem);
    this.io.err(USAGE);
    return 2;
  }
}

class UsageError extends Error {}
