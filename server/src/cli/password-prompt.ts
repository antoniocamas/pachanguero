import { createInterface } from 'node:readline';

/** Asks the person at the keyboard (or a script on standard input) for a secret. */
export interface PasswordPrompt {
  read(question: string): Promise<string>;
}

/**
 * On a terminal the question is shown and what is typed is not echoed. When standard input is
 * piped there is nothing to hide: each call takes the next line, so a script can send the
 * password twice (`printf '%s\n%s\n' "$pw" "$pw" | pachanguero-admin create …`).
 */
export class TtyPasswordPrompt implements PasswordPrompt {
  private lines: AsyncIterator<string> | null = null;

  constructor(
    private readonly input: NodeJS.ReadableStream & { isTTY?: boolean },
    private readonly output: NodeJS.WritableStream
  ) {}

  async read(question: string): Promise<string> {
    this.output.write(question);
    if (this.input.isTTY) return this.readHidden();
    const next = await this.pipedLines().next();
    this.output.write('\n');
    if (next.done) throw new Error('No se recibió la contraseña');
    return next.value;
  }

  /**
   * Reads the keys itself in raw mode rather than through a readline interface per question:
   * a second interface on the same terminal did not switch the echo off again.
   */
  private readHidden(): Promise<string> {
    const input = this.input as NodeJS.ReadableStream & {
      setRawMode?: (raw: boolean) => unknown;
    };
    return new Promise((resolve, reject) => {
      let typed = '';
      const finish = (settle: () => void) => {
        input.removeListener('data', onData);
        input.removeListener('end', onEnd);
        input.setRawMode?.(false);
        input.pause();
        this.output.write('\n');
        settle();
      };
      const onEnd = () =>
        finish(() => reject(new Error('No se recibió la contraseña')));
      const onData = (chunk: Buffer | string) => {
        for (const key of String(chunk)) {
          if (key === '\r' || key === '\n') {
            return finish(() => resolve(typed));
          }
          if (key === '\u0003') {
            return finish(() => reject(new Error('Cancelado')));
          }
          if (key === '\u007f' || key === '\b') typed = typed.slice(0, -1);
          else typed += key;
        }
      };
      input.setRawMode?.(true);
      input.on('data', onData);
      input.once('end', onEnd);
      input.resume();
    });
  }

  private pipedLines(): AsyncIterator<string> {
    this.lines ??= createInterface({ input: this.input })[
      Symbol.asyncIterator
    ]();
    return this.lines;
  }
}
