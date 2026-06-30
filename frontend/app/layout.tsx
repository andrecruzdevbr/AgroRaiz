import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { ReactQueryProvider } from '@/lib/query-provider'
import { AuthProvider } from '@/components/auth-provider'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Agro Raiz | Agropecuária & Pet Shop - Ouro Branco MG',
    template: '%s | Agro Raiz'
  },
  description: 'Sua loja completa de produtos agropecuários e pet shop em Ouro Branco - MG.',
  keywords: ['agropecuária', 'pet shop', 'Ouro Branco', 'MG', 'ração', 'medicamentos veterinários'],
  authors: [{ name: 'Agro Raiz' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Agro Raiz',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4a7c59' },
    { media: '(prefers-color-scheme: dark)', color: '#1a2e1f' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ReactQueryProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
            <Toaster
              position="top-right"
              richColors
              closeButton
              toastOptions={{
                classNames: {
                  toast: 'bg-card border-border',
                  title: 'text-foreground',
                  description: 'text-muted-foreground',
                }
              }}
            />
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
