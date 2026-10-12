import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { TtyPasswordPrompt } from './password-prompt.js';

describe('TtyPasswordPrompt', () => {
  const capture = () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', chunk => chunks.push(String(chunk)));
    return { output, text: () => chunks.join('') };
  };

  it('takes one line per question from piped input, without showing it', async () => {
    const { output, text } = capture();
    const prompt = new TtyPasswordPrompt(
      Readable.from(['first-secret\nsecond-secret\n']),
      output
    );

    expect(await prompt.read('Contraseña: ')).toBe('first-secret');
    expect(await prompt.read('Repite: ')).toBe('second-secret');
    expect(text()).toContain('Contraseña: ');
    expect(text()).not.toContain('secret');
  });

  it('fails when the piped input runs out', async () => {
    const prompt = new TtyPasswordPrompt(
      Readable.from(['only-one\n']),
      capture().output
    );
    await prompt.read('a');
    await expect(prompt.read('b')).rejects.toThrow('contraseña');
  });

  it('on a terminal shows the question and never echoes what is typed', async () => {
    const { output, text } = capture();
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const prompt = new TtyPasswordPrompt(input, output);

    const answer = prompt.read('Contraseña: ');
    input.write('typed-secret\n');

    expect(await answer).toBe('typed-secret');
    expect(text()).toContain('Contraseña: ');
    expect(text()).not.toContain('typed-secret');
    expect(text().endsWith('\n')).toBe(true);
  });

  it('on a terminal switches raw mode on for each question and back off after it', async () => {
    const modes: boolean[] = [];
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: (raw: boolean) => modes.push(raw),
    });
    const prompt = new TtyPasswordPrompt(input, capture().output);

    const first = prompt.read('a');
    input.write('one\n');
    await first;
    const second = prompt.read('b');
    input.write('two\n');

    expect(await second).toBe('two');
    expect(modes).toEqual([true, false, true, false]);
  });
});
