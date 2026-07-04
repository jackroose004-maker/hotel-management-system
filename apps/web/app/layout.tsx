import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import ThemeInit from '@/components/ThemeInit'
import BrandInit from '@/components/BrandInit'
import AuthInit from '@/components/AuthInit'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Al Manzil Hotel',
  description: 'Order food, track your meal, enjoy the experience',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geist.className} min-h-full bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased`}>
        <ThemeInit />
        <BrandInit />
        <AuthInit />
        {children}
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
            success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
