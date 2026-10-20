import type { BankBanner as Banner } from '../api';
import { bannerText } from '../lib/bankPanel';

/** The strip above the tabs that warns the organiser before the bank access ends, or after it did. */
export function BankBanner({
  banner,
  onOpen,
}: {
  banner: Banner | null;
  onOpen: () => void;
}) {
  const text = banner === null ? null : bannerText(banner);
  if (text === null) return null;
  return (
    <div className="bank-banner" role="status" data-testid="bank-banner">
      <span>{text}</span>
      <button className="btn mini" onClick={onOpen}>
        {banner?.state === 'reconnect_needed' ? 'Reconectar' : 'Renovar'}
      </button>
    </div>
  );
}
