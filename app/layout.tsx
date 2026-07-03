import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import RootClientProviders from './providers'

const inter = Inter({ subsets: ['latin'] })

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
    <html lang="en">
      <body className={inter.className}>
        <RootClientProviders>{children}</RootClientProviders>
      </body>
    </html>
  )
}
