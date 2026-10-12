export type PasswordRule =
  'length' | 'uppercase' | 'lowercase' | 'digit' | 'special';

const SPECIAL = `!@#$%^&*()_+-=[]{}|;':",./<>?`;

/** What a password must contain: every rule it breaks is reported, not just the first. */
export class PasswordPolicy {
  static readonly MIN_LENGTH = 12;

  violations(password: string): PasswordRule[] {
    const broken: PasswordRule[] = [];
    if (password.length < PasswordPolicy.MIN_LENGTH) broken.push('length');
    if (!/[A-Z]/.test(password)) broken.push('uppercase');
    if (!/[a-z]/.test(password)) broken.push('lowercase');
    if (!/[0-9]/.test(password)) broken.push('digit');
    if (![...password].some(c => SPECIAL.includes(c))) broken.push('special');
    return broken;
  }

  describe(rule: PasswordRule): string {
    switch (rule) {
      case 'length':
        return `Debe tener al menos ${PasswordPolicy.MIN_LENGTH} caracteres`;
      case 'uppercase':
        return 'Debe tener una letra mayúscula';
      case 'lowercase':
        return 'Debe tener una letra minúscula';
      case 'digit':
        return 'Debe tener un número';
      case 'special':
        return `Debe tener un carácter especial (${SPECIAL})`;
    }
  }
}
