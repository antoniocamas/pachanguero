import type { PaymentMethod } from '../api';
import { PAYMENT_METHODS, paymentMethodLabel } from '../lib/paymentMethod';

/** How the money is handed over; chosen before the pay button is pressed. */
export function PaymentMethodField({
  value,
  disabled,
  onChange,
}: {
  value: PaymentMethod;
  disabled: boolean;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <label className="method">
      <span className="muted">Método</span>{' '}
      <select
        aria-label="Método"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value as PaymentMethod)}
      >
        {PAYMENT_METHODS.map(method => (
          <option key={method} value={method}>
            {paymentMethodLabel(method)}
          </option>
        ))}
      </select>
    </label>
  );
}
