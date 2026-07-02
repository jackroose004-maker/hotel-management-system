'use client'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'

// Runs once at root — restores auth from localStorage on every page load/refresh
export default function AuthInit() {
  useEffect(() => { useAuthStore.getState().init() }, [])
  return null
}
