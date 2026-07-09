import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import en from './locales/en.json'
import ar from './locales/ar.json'

export type Lang = 'en' | 'ar'

interface LangStore {
  lang: Lang
  _hydrated: boolean
  setLang: (l: Lang) => void
}

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      lang: 'en',
      _hydrated: false,
      setLang: (lang) => {
        set({ lang })
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang
          document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
        }
      },
    }),
    {
      name: 'almanzil-lang',
      onRehydrateStorage: () => () => {
        useLangStore.setState({ _hydrated: true })
      },
    }
  )
)

export function applyLangDir(lang: Lang) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

/** Persist language preference to server for authenticated users (used in emails). Fire-and-forget. */
export function syncLangToServer(lang: Lang, token: string | null) {
  if (!token) return
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
  fetch(`${API}/auth/me`, {
    method: 'PATCH', // PATCH /auth/me handles name, phone, language, dietary prefs
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ language: lang }),
  }).catch(() => {}) // best-effort
}

const translations: Record<Lang, Record<string, string>> = { en, ar }

export function t(lang: Lang, key: string): string {
  return translations[lang]?.[key] ?? translations['en'][key] ?? key
}
