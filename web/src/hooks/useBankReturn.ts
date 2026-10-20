import { useEffect, useState } from 'react';
import { bankCodeIn, withoutBankCode } from '../lib/bankReturn';

// Taking the code rewrites the address, and a development render runs the initialiser twice:
// the second run must still see the code the first took.
let taken: string | null = null;

const take = (): string | null => {
  const code = bankCodeIn(window.location.search);
  if (code !== null) {
    window.history.replaceState(
      null,
      '',
      withoutBankCode(new URL(window.location.href))
    );
    taken = code;
  }
  return taken;
};

/** The code the bank's redirect left in the address, read once and taken off it. */
export function useBankReturn(): string | null {
  const [code] = useState(take);
  useEffect(() => {
    taken = null;
  }, []);
  return code;
}
