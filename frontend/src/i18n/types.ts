import type { Locale } from 'antd/es/locale';

/**
 * A language pack is a self-contained translation bundle.
 *
 * To add a language:
 *   1. Create `locales/<code>.ts` and export a LanguagePack.
 *   2. Import it in `i18n/index.tsx` and append it to `languagePacks`.
 *
 * `messages` is keyed by the Chinese source string. Missing keys fall back
 * to Chinese, so a new pack can be added incrementally.
 */
export interface LanguagePack {
  /** Stable code stored in localStorage and used by the language dropdown. */
  code: string;
  /** Label shown in the language dropdown. */
  label: string;
  /** Ant Design component locale (pagination, date picker, empty text, …). */
  antdLocale: Locale;
  /** Day.js locale name, e.g. "zh-cn" or "en". */
  dayjsLocale: string;
  /** Chinese source string → translated string. */
  messages: Record<string, string>;
}
