import type { ReadAnswer } from '../api';
import { failureText } from './bankMessages';
import { fmtTime } from './dates';

/** What the button says once a read answered: the result, or why nothing was read. */
export const readAnswerText = (answer: ReadAnswer): string => {
  switch (answer.kind) {
    case 'read':
      return `Lectura terminada: ${answer.counts.entries} movimientos, ${answer.counts.kept} nuevos`;
    case 'failed':
      return `No se pudo leer: ${failureText(answer.failure, answer.code)}`;
    case 'refused':
      switch (answer.code) {
        case 'in_progress':
          return 'Ya se está leyendo el banco.';
        case 'too_soon':
          return 'Espera unos minutos antes de volver a leer.';
        case 'rate_limited':
          return answer.until === null
            ? 'El banco pide esperar.'
            : `El banco pide esperar hasta ${fmtTime(answer.until)}.`;
        case 'not_ready':
          return 'Todavía no se puede leer: revisa el panel del banco.';
      }
  }
};
