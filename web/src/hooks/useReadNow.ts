import { useCallback, useState } from 'react';
import { api } from '../api';
import { readAnswerText } from '../lib/readNow';

export type ReadNowState =
  { kind: 'idle' } | { kind: 'reading' } | { kind: 'answered'; text: string };

/**
 * Reads the bank now. The server answers when the read ends, so the button shows "Leyendo…" until
 * then and the answer after. `onDone` runs when something was read or failed, to show what changed.
 */
export function useReadNow(onDone: () => void | Promise<void>) {
  const [state, setState] = useState<ReadNowState>({ kind: 'idle' });

  const read = useCallback(async () => {
    setState({ kind: 'reading' });
    try {
      const answer = await api.readBank();
      setState({ kind: 'answered', text: readAnswerText(answer) });
      if (answer.kind !== 'refused') await onDone();
    } catch (e) {
      setState({ kind: 'answered', text: (e as Error).message });
    }
  }, [onDone]);

  return { state, read };
}
