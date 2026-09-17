import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import RootClientProviders from './providers'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600', '700', '800'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'TidyFlow - Cleaning Management Platform',
  description: 'Cloud-based cleaning and property management platform',
  icons: {
    icon: [
      { url: '/assets/new-icon.png', type: 'image/png' },
    ],
    apple: '/assets/new-icon.png',
  },
  openGraph: {
    title: 'TidyFlow - Cleaning Management Platform',
    description: 'Cloud-based cleaning and property management platform',
    url: 'https://tidyflowapp.com',
    siteName: 'TidyFlow',
    images: [{ url: '/assets/new-icon.png', width: 512, height: 512, alt: 'TidyFlow' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} ${jetbrainsMono.variable} font-sans`}>
        <RootClientProviders>{children}</RootClientProviders>
      </body>
    </html>
  )
}
