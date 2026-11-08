import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

import { enUSPack } from './locales/en-US';
import { zhCNPack } from './locales/zh-CN';
import type { LanguagePack } from './types';

export type { LanguagePack } from './types';

/**
 * Language pack registry.
 *
 * To add a language, create `locales/<code>.ts`, export a LanguagePack,
 * import it here, and append it to this array. The top-right selector and
 * the Ant Design / Day.js locales are derived from this registry.
 */
export const languagePacks: LanguagePack[] = [zhCNPack, enUSPack];

export const defaultLanguage = zhCNPack.code;
const STORAGE_KEY = 'foreigntrade.language';

function getPack(code: string | null | undefined): LanguagePack {
  return languagePacks.find((pack) => pack.code === code) ?? zhCNPack;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (
    params[key] === undefined ? match : String(params[key])
  ));
}

interface I18nValue {
  /** Current language code, e.g. "zh-CN" or "en-US". */
  lang: string;
  setLang: (code: string) => void;
  /** Translate a Chinese source string (or a semantic key) for the current language. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** All registered language packs, used by the top-right selector. */
  languages: LanguagePack[];
  /** The active pack, including its Ant Design and Day.js locale. */
  pack: LanguagePack;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return languagePacks.some((pack) => pack.code === stored) ? stored! : defaultLanguage;
    } catch {
      return defaultLanguage;
    }
  });

  const setLang = useCallback((code: string) => {
    if (!languagePacks.some((pack) => pack.code === code)) return;
    setLangState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Storage may be unavailable (private mode); switching still works in memory.
    }
  }, []);

  const pack = getPack(lang);

  useEffect(() => {
    document.documentElement.lang = pack.code;
  }, [pack.code]);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    // Selected language first, then the default (Chinese) pack, then the key.
    const text = pack.messages[key] ?? zhCNPack.messages[key] ?? key;
    return interpolate(text, params);
  }, [pack]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    languages: languagePacks,
    pack,
  }), [lang, setLang, t, pack]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within a LanguageProvider');
  }
  return value;
}
