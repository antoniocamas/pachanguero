/** Formats a moment as local wall-clock text, which is how kickoff times are written. */
export class LocalCalendar {
  /** 'YYYY-MM-DD' */
  dateOf(d: Date): string {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  }

  /** 'YYYY-MM-DDTHH:MM' */
  dateTimeOf(d: Date): string {
    return `${this.dateOf(d)}T${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`;
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
