import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Панель управления | Tartib'
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
