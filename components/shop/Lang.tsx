'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { t, type Lang, type Phrase } from '@/lib/i18n'

const LangContext = createContext<Lang>('en')
/** Tells every browser-side part of the shop which language the owner chose. */
export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}
/** `const tr = useT()` then `tr('Add to cart')`. */
export function useT(): (phrase: Phrase) => string {
  const lang = useContext(LangContext)
  return (phrase) => t(lang, phrase)
}
