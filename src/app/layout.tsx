import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/app-shell';
import { SessionProvider } from '@/components/session-provider';
import { OfflineIndicator } from '@/components/offline-indicator';
import { SentryInit } from '@/components/sentry-init';
import { auth } from '@/auth';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'SoarCast - Paragliding XC Weather Monitor',
    template: '%s | SoarCast',
  },
  description:
    'Track flying conditions at your favorite paragliding sites with 7-day weather forecasts, intelligent XC scoring, and push notifications. Get alerted when epic soaring conditions are forecasted.',
  keywords: [
    'paragliding',
    'XC flying',
    'weather forecast',
    'soaring',
    'thermals',
    'flying sites',
    'CAPE',
    'wind conditions',
    'boundary layer height',
    'cross country',
    'hang gliding',
  ],
  authors: [{ name: 'SoarCast' }],
  creator: 'SoarCast',
  metadataBase: new URL(process.env.AUTH_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'SoarCast - Paragliding XC Weather Monitor',
    description:
      'Track flying conditions at your favorite paragliding sites with 7-day weather forecasts, intelligent XC scoring, and push notifications.',
    siteName: 'SoarCast',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SoarCast - Paragliding XC Weather Monitor',
    description:
      'Track flying conditions at your favorite paragliding sites with 7-day weather forecasts, intelligent XC scoring, and push notifications.',
    creator: '@soarcast',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SoarCast',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#3b82f6" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SentryInit />
        <SessionProvider session={session}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              <OfflineIndicator />
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
