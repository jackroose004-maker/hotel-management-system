import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import ToastProvider from '@/components/ToastProvider'
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
        <ToastProvider />
      </body>
    </html>
  )
}
