/** The fixed codes the server leaves in the address; anything else is not the bank's. */
const CODE = /^[a-z_]{1,32}$/;

/** The code in `?bank=<code>`, or null when there is none or it is not a code. */
export const bankCodeIn = (search: string): string | null => {
  const code = new URLSearchParams(search).get('bank');
  return code !== null && CODE.test(code) ? code : null;
};

/** The same address without `bank`, so a reload does not repeat the message. */
export const withoutBankCode = (url: URL): string => {
  const next = new URL(url);
  next.searchParams.delete('bank');
  return `${next.pathname}${next.search}${next.hash}`;
};
