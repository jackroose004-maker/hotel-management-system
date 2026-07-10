'use client'
import { useEffect } from 'react'

interface Props {
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

export function ModalBackdrop({ onClick, className, style, children }: Props) {
  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const prev = document.body.style.overflow
    const prevPR = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
    return () => {
      document.body.style.overflow = prev
      document.body.style.paddingRight = prevPR
    }
  }, [])

  return (
    <div
      className={className ?? 'fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4'}
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
