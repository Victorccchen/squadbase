"use client";

import { useLocale } from "next-intl";

/** Posted to admin Server Actions so redirects can keep the URL locale without getLocale(). */
export function LocaleHiddenField() {
  const locale = useLocale();
  return <input type="hidden" name="locale" value={locale} />;
}
