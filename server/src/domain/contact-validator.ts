/**
 * What a player may change about their contact data: absent keys stay, `null` clears the phone
 * and `emails` is the whole list, in order (empty clears it).
 */
export interface ContactPatch {
  emails?: string[];
  phone?: string | null;
}

/** A refusal that names the field, for the player to read. */
export class ContactError extends Error {}

const FIELDS = ['emails', 'phone'] as const;
const EMAILS_MAX = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const PHONE = /^\+?\d{9,15}$/;

/** Checks what a player sent as contact data; only the two fields are ever accepted. */
export class ContactValidator {
  check(input: unknown): ContactPatch {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new ContactError('Los datos de contacto no son válidos');
    }
    const body = input as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      if (!(FIELDS as readonly string[]).includes(key)) {
        throw new ContactError(`campo no permitido: ${key}`);
      }
    }
    const patch: ContactPatch = {};
    if ('emails' in body) patch.emails = this.emails(body.emails);
    if ('phone' in body) patch.phone = this.phone(body.phone);
    return patch;
  }

  /** Each address checked and trimmed; blanks dropped, repeats folded, the order kept. */
  private emails(value: unknown): string[] {
    if (!Array.isArray(value)) throw new ContactError('email no válido');
    const out: string[] = [];
    for (const item of value) {
      const email = this.email(item);
      if (email !== null && !out.includes(email)) out.push(email);
    }
    if (out.length > EMAILS_MAX) {
      throw new ContactError(`email: como mucho ${EMAILS_MAX} correos`);
    }
    return out;
  }

  private email(value: unknown): string | null {
    const text = this.text(value, 'email no válido');
    if (text === null) return null;
    if (text.length > EMAIL_MAX || !EMAIL.test(text)) {
      throw new ContactError('email no válido');
    }
    return text;
  }

  private phone(value: unknown): string | null {
    const text = this.text(value, 'teléfono no válido');
    if (text === null) return null;
    if (!PHONE.test(text.replace(/\s+/g, ''))) {
      throw new ContactError('teléfono no válido');
    }
    return text;
  }

  /** The trimmed text; null for `null` or an empty text. */
  private text(value: unknown, refusal: string): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') throw new ContactError(refusal);
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
}
