'use client'
import { Toaster } from 'react-hot-toast'

export default function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      containerStyle={{ zIndex: 99999 }}
      toastOptions={{
        duration: 3500,
        style: {
          background: 'var(--card-bg, #fff)',
          color: 'var(--foreground, #111)',
          border: '1px solid var(--card-border, #e5e7eb)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          fontWeight: 600,
          fontSize: '14px',
        },
        success: { iconTheme: { primary: 'var(--brand, #C9A84C)', secondary: '#fff' } },
        error: { duration: 4000 },
      }}
    />
  )
}
