import React, { createContext, useContext, useCallback } from 'react';
import { usePersistentState } from './usePersistentState';

export type Language = 'en' | 'hi';

interface LanguageCtx {
  lang: Language;
  setLang: (l: Language) => void;
  /** Translate: `t('Hello', 'Namaste')` → returns English or Hinglish based on current lang. */
  t: (en: string, hi?: string) => string;
}

const LanguageContext = createContext<LanguageCtx>({
  lang: 'en',
  setLang: () => {},
  t: (en) => en,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = usePersistentState<Language>('app:language', 'en');
  const t = useCallback(
    (en: string, hi?: string) => (lang === 'hi' && hi ? hi : en),
    [lang]
  );
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);
