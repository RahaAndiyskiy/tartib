import type { Metadata, Viewport } from 'next';
import type { ReactNode, ReactElement } from 'react';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Tartib',
  title: 'Tartib',
  description: 'Управление клубом, учениками, тренерами и оплатами',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tartib'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff'
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
