import { useCallback } from 'react';
import { api, type BankSettingsChange } from '../api';
import { useGuarded } from './useGuarded';

/**
 * What the organiser does in the Banco panel. Each action reads the panel and the banner again,
 * and reports whether it worked; connecting sends the browser to the bank's own page.
 */
export function useBankActions(
  reload: () => Promise<void>,
  report: (message: string | null) => void
) {
  const { busy, run } = useGuarded(report);

  const connect = useCallback(
    () =>
      run(async () => {
        const { url } = await api.connectBank();
        window.location.assign(url);
      }),
    [run]
  );
  const disconnect = useCallback(
    () =>
      run(async () => {
        await api.disconnectBank();
        await reload();
      }),
    [run, reload]
  );
  const change = useCallback(
    (settings: BankSettingsChange) =>
      run(async () => {
        await api.bankSettings(settings);
        await reload();
      }),
    [run, reload]
  );
  const words = useCallback(
    (include: string[], exclude: string[]) =>
      run(async () => {
        await api.bankWords(include, exclude);
        await reload();
      }),
    [run, reload]
  );

  return { busy, connect, disconnect, change, words };
}
