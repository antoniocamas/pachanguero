import { describe, expect, it } from 'vitest';
import type { PaymentDetail } from '../api';
import { bizumPaymentLines, detailRows, undoSummary } from './paymentDetail';

const base: PaymentDetail = {
  payment: {
    id: 1,
    gameId: 5,
    playedOn: '2026-10-07',
    amountCents: 400,
    paidOn: '2026-10-12',
    method: 'bizum',
    payerName: 'Luis Pérez',
    beneficiaryName: 'Luis Pérez',
  },
  resolved: 'organiser',
  bizum: {
    bookedOn: '2026-10-12',
    sender: { name: 'Luis P.R.', phone: null },
    amountCents: 450,
    currency: 'EUR',
    subject: 'pachanga',
    reference: 'ref-1',
    unallocatedCents: 50,
    payments: [
      {
        id: 1,
        gameId: 5,
        playedOn: '2026-10-07',
        beneficiaryName: 'Luis Pérez',
        amountCents: 400,
      },
      {
        id: 2,
        gameId: 4,
        playedOn: '2026-09-30',
        beneficiaryName: null,
        amountCents: 400,
      },
    ],
  },
};

const value = (rows: ReturnType<typeof detailRows>, label: string) =>
  rows.find(row => row.label === label)?.value;

describe('detailRows', () => {
  it('shows the payment and its Bizum, with what is left over', () => {
    const rows = detailRows(base);

    expect(value(rows, 'Importe')).toBe('4 €');
    expect(value(rows, 'Método')).toBe('Bizum');
    expect(value(rows, 'Resuelto')).toBe('Por decisión del organizador');
    expect(value(rows, 'Bizum: remitente')).toBe('Luis P.R.');
    expect(value(rows, 'Bizum: importe')).toBe('4,5 €');
    expect(value(rows, 'Bizum: asunto')).toBe('pachanga');
    expect(value(rows, 'Bizum: identificación del banco')).toBe('ref-1');
    expect(value(rows, 'Bizum: sin asignar')).toBe('0,5 €');
  });

  it.each([
    ['automatic', 'Automático'],
    ['manual', 'Registrado a mano'],
  ] as const)('says %s as %s', (resolved, label) => {
    expect(value(detailRows({ ...base, resolved }), 'Resuelto')).toBe(label);
  });

  it('shows no Bizum field for a payment recorded by hand', () => {
    const rows = detailRows({ ...base, resolved: 'manual', bizum: null });

    expect(rows.map(row => row.label)).toEqual([
      'Partido',
      'Importe',
      'Fecha de pago',
      'Método',
      'Resuelto',
    ]);
  });

  it('shows a phone sender, and a dash for an empty subject', () => {
    const rows = detailRows({
      ...base,
      bizum: {
        ...base.bizum!,
        sender: { name: null, phone: '+34600000000' },
        subject: null,
      },
    });

    expect(value(rows, 'Bizum: remitente')).toBe('+34600000000');
    expect(value(rows, 'Bizum: asunto')).toBe('—');
  });
});

describe('bizumPaymentLines', () => {
  it('lists every payment of the Bizum, naming a plus-one as a guest', () => {
    const lines = bizumPaymentLines(base);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Luis Pérez · 4 €');
    expect(lines[1]).toContain('invitado · 4 €');
  });

  it('is empty when no Bizum made the payment', () => {
    expect(bizumPaymentLines({ ...base, bizum: null })).toEqual([]);
  });
});

describe('undoSummary', () => {
  it('lists both payments of a Bizum that paid two shares', () => {
    const summary = undoSummary(base);
    expect(summary.intro).toBe(
      'Este pago salió de un Bizum de 4,5 € del 12/10 que pagó 2 cuotas. Se deshacen las dos y el Bizum vuelve a «Bizums en espera».'
    );
    expect(summary.confirm).toBe('Deshacer los dos pagos');
    expect(summary.lines).toHaveLength(2);
  });

  it('asks for one payment when the Bizum paid one', () => {
    const one: PaymentDetail = {
      ...base,
      bizum: { ...base.bizum!, payments: base.bizum!.payments.slice(0, 1) },
    };
    const summary = undoSummary(one);
    expect(summary.intro).toContain(
      'Se deshace y el Bizum vuelve a «Bizums en espera».'
    );
    expect(summary.confirm).toBe('Deshacer pago');
  });
});
