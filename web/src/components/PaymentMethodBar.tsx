import type { PaymentMethod } from '../api';
import { PAYMENT_METHODS, paymentMethodLabel } from '../lib/paymentMethod';

/** How the money is handed over, chosen once before the pay buttons of a table are pressed. */
export function PaymentMethodBar({
  value,
  disabled,
  onChange,
}: {
  value: PaymentMethod;
  disabled: boolean;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <div className="method-bar" role="group" aria-label="Cobrar con">
      <span className="muted">Cobrar con</span>
      <div className="seg">
        {PAYMENT_METHODS.map(method => (
          <button
            key={method}
            aria-pressed={value === method}
            disabled={disabled}
            onClick={() => onChange(method)}
          >
            {paymentMethodLabel(method)}
          </button>
        ))}
      </div>
    </div>
  );
}
