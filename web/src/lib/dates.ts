/** `2025-09-08` → a short Spanish weekday, day and month. */
export const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
