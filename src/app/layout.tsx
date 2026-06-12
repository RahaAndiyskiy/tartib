import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tartib',
  description: 'Управление клубом, учениками, тренерами и оплатами',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
