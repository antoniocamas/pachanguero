import type { ReadLog } from './bank-poller.js';

export class ConsoleReadLog implements ReadLog {
  line(text: string): void {
    console.log(text);
  }
}
