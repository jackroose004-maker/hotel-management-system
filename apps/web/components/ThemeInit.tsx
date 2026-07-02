'use client'
import { useEffect } from 'react'
import { initTheme } from '@/store/theme'

export default function ThemeInit() {
  useEffect(() => { initTheme() }, [])
  return null
}
