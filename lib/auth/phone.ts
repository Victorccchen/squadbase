export const DEFAULT_DIAL_CODE = "+886";

export const DIAL_CODES = [
  { dial: "+886", region: "TW" },
  { dial: "+81", region: "JP" },
  { dial: "+852", region: "HK" },
  { dial: "+65", region: "SG" },
  { dial: "+1", region: "US/CA" },
  { dial: "+44", region: "UK" },
] as const;

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Build an E.164 number from a dial code and a national number.
 * Strips a leading 0 for TW/JP-style national format (e.g. 0912... → +886912...).
 */
export function toE164(dialCode: string, nationalNumber: string): string | null {
  const cc = dialCode.replace(/\D/g, "");
  let rest = nationalNumber.replace(/\D/g, "");

  if (!cc || !rest) {
    return null;
  }

  if ((cc === "886" || cc === "81") && rest.startsWith("0")) {
    rest = rest.slice(1);
  }

  const e164 = `+${cc}${rest}`;
  return E164.test(e164) ? e164 : null;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}
