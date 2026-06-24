import type { Metadata } from 'next';
import type { ReactNode, ReactElement } from 'react';

export const metadata: Metadata = {
  title: 'Панель управления | Tartib'
};

export default function DashboardLayout({ children }: { children: ReactNode }): ReactElement {
  return <section>{children}</section>;
}
