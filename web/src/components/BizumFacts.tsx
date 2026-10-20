import type { WaitingBizum } from '../api';
import { fmtFullDate } from '../lib/dates';
import { amountText, senderText } from '../lib/waitingBizums';

/** What the bank said of a Bizum, as the dialogs show it. */
export function BizumFacts({ item }: { item: WaitingBizum }) {
  const rows: [string, string][] = [
    ['Remitente', senderText(item.sender)],
    ['Fecha', fmtFullDate(item.bookedOn)],
    ['Importe', amountText(item)],
    ['Asunto', item.subject ?? 'sin asunto'],
  ];
  return (
    <>
      {rows.map(([label, value]) => (
        <div className="row" key={label}>
          <span className="name">{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </>
  );
}
