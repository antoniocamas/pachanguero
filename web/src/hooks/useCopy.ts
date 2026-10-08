import { useCallback, useEffect, useState } from 'react';

/** Copies text to the clipboard; `copied` is true for a moment afterwards. */
export function useCopy() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The clipboard API needs https; over plain http on the LAN, fall back.
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
  }, []);

  return { copied, copy };
}
