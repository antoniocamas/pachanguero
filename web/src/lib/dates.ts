/** `2025-09-08` → a short Spanish weekday, day and month. */
export const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** `2027-03-30` or a full timestamp → `30/03/2027`, in the viewer's time zone. */
export const fmtFullDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(
    'es-ES',
    { day: '2-digit', month: '2-digit', year: 'numeric' }
  );

/** A timestamp → `07:30`, in the viewer's time zone. */
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
