import type { PaymentDetail } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';
import { paymentMethodLabel } from './paymentMethod';

const RESOLVED: Record<PaymentDetail['resolved'], string> = {
  manual: 'Registrado a mano',
  automatic: 'Automático',
  organiser: 'Por decisión del organizador',
};

/** One labelled value of the detail. */
export interface DetailRow {
  label: string;
  value: string;
}

/** The detail as the organiser reads it: the payment, then the Bizum behind it when there is one. */
export const detailRows = (detail: PaymentDetail): DetailRow[] => {
  const { payment, bizum } = detail;
  const rows: DetailRow[] = [
    { label: 'Partido', value: fmtDate(payment.playedOn) },
    { label: 'Importe', value: euros(payment.amountCents) },
    { label: 'Fecha de pago', value: fmtDate(payment.paidOn) },
    { label: 'Método', value: paymentMethodLabel(payment.method) },
    { label: 'Resuelto', value: RESOLVED[detail.resolved] },
  ];
  if (bizum === null) return rows;
  return [
    ...rows,
    { label: 'Bizum: fecha', value: fmtDate(bizum.bookedOn) },
    {
      label: 'Bizum: remitente',
      value: bizum.sender.name ?? bizum.sender.phone ?? '—',
    },
    { label: 'Bizum: importe', value: euros(bizum.amountCents) },
    { label: 'Bizum: asunto', value: bizum.subject ?? '—' },
    { label: 'Bizum: identificación del banco', value: bizum.reference },
    { label: 'Bizum: sin asignar', value: euros(bizum.unallocatedCents) },
  ];
};

/** Every payment the same Bizum made, as "game · who · amount"; empty unless a Bizum made it. */
export const bizumPaymentLines = (detail: PaymentDetail): string[] =>
  (detail.bizum?.payments ?? []).map(
    p =>
      `${fmtDate(p.playedOn)} · ${p.beneficiaryName ?? 'invitado'} · ${euros(p.amountCents)}`
  );

/** What the undo dialog says of a Bizum's payments: the sentence, the button, every payment. */
export interface UndoSummary {
  intro: string;
  confirm: string;
  lines: string[];
}

export const undoSummary = (detail: PaymentDetail): UndoSummary => {
  const lines = bizumPaymentLines(detail);
  const [, month, day] = (detail.bizum?.bookedOn ?? '').split('-');
  const n = lines.length;
  const origin = `Este pago salió de un Bizum de ${euros(detail.bizum?.amountCents ?? 0)} del ${day}/${month}`;
  const back = 'el Bizum vuelve a «Bizums en espera»';
  return {
    intro:
      n < 2
        ? `${origin}. Se deshace y ${back}.`
        : `${origin} que pagó ${n} cuotas. Se deshacen ${n === 2 ? 'las dos' : 'todas'} y ${back}.`,
    confirm:
      n < 2
        ? 'Deshacer pago'
        : n === 2
          ? 'Deshacer los dos pagos'
          : `Deshacer los ${n} pagos`,
    lines,
  };
};
