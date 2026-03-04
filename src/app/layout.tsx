import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: 'SoarCast',
    template: '%s | SoarCast',
  },
  description:
    'Paragliding XC forecast monitor — track flying conditions at your favorite sites with 7-day weather forecasts and XC soaring scores.',
  keywords: [
    'paragliding',
    'XC flying',
    'weather forecast',
    'soaring',
    'thermals',
    'flying sites',
    'CAPE',
    'wind conditions',
  ],
  authors: [{ name: 'SoarCast' }],
  creator: 'SoarCast',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'SoarCast',
    description: 'Paragliding XC forecast monitor for tracking flying conditions',
    siteName: 'SoarCast',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SoarCast',
    description: 'Paragliding XC forecast monitor for tracking flying conditions',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
