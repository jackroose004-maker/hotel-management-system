'use client'
import { useEffect } from 'react'
import { useThemeStore } from '@/store/theme'

/** Force dark mode for a page. Restores previous preference on unmount. */
export default function ForceDark() {
  const setDark = useThemeStore(s => s.setDark)
  useEffect(() => {
    const prev = useThemeStore.getState().dark
    setDark(true)
    return () => setDark(prev)
  }, [setDark])
  return null
}
