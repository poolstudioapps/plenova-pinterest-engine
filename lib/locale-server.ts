import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, coerceLocale, type Locale } from "@/lib/i18n";

/** Reads the operator's dashboard language from its cookie. */
export async function getUiLocale(): Promise<Locale> {
  const jar = await cookies();
  return coerceLocale(jar.get(LOCALE_COOKIE)?.value);
}
