import type { BizumParty } from '../bizum/model.js';
import { PhoneKey } from './phone-key.js';
import { TextFolding } from './text-folding.js';

/**
 * Whether two Bizums come from the same sender: by phone when the first one shows a phone, and
 * otherwise by name, the way the group's stored names are compared (case, accents and spaces
 * do not matter). A sender with neither matches nobody.
 */
export class SenderMatch {
  private readonly folding = new TextFolding();

  same(a: BizumParty, b: BizumParty): boolean {
    if (a.phone !== null) {
      return (
        b.phone !== null && new PhoneKey(a.phone).sameAs(new PhoneKey(b.phone))
      );
    }
    return (
      a.name !== null && b.name !== null && this.folding.same(a.name, b.name)
    );
  }
}
