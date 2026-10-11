/** Formats a moment as local wall-clock text, which is how kickoff times are written. */
export class LocalCalendar {
  /** 'YYYY-MM-DD' */
  dateOf(d: Date): string {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  }

  /** 'YYYYMMDD-HHMMSS', for names that must sort and carry no separators. */
  timestampOf(d: Date): string {
    const date = `${d.getFullYear()}${this.pad(d.getMonth() + 1)}${this.pad(d.getDate())}`;
    const time = `${this.pad(d.getHours())}${this.pad(d.getMinutes())}${this.pad(d.getSeconds())}`;
    return `${date}-${time}`;
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
