import { create } from 'zustand'

interface ThemeStore {
  dark: boolean
  toggle: () => void
  setDark: (v: boolean) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  dark: false,
  toggle: () =>
    set((s) => {
      const next = !s.dark
      applyTheme(next)
      return { dark: next }
    }),
  setDark: (v) => {
    applyTheme(v)
    set({ dark: v })
  },
}))

function applyTheme(dark: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}

// Call once on app init to restore saved preference
export function initTheme() {
  if (typeof window === 'undefined') return
  const saved = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = saved ? saved === 'dark' : prefersDark
  applyTheme(dark)
  useThemeStore.setState({ dark })
}
