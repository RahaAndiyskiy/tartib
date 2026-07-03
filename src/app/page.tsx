'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { getSupabaseClient } from '@shared/lib/supabaseClient';

export default function HomePage(): ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const router = useRouter();

  useEffect(() => {
    if (isLocalMode) return;

    let mounted = true;
    void getSupabaseClient()
      .auth
      .getSession()
      .then((sessionResult) => {
        if (mounted && sessionResult.data.session) {
          router.replace('/dashboard');
        }
      });

    return () => {
      mounted = false;
    };
  }, [isLocalMode, router]);

  return (
    <main className="home-screen home-entry-screen">
      <section className="home-entry">
        <header className="home-entry-brand">
          <span className="home-entry-mark">T</span>
          <div>
            <strong>Tartib</strong>
            <span>Версия 1.0</span>
          </div>
        </header>
        <div className="home-entry-copy">
          <span>Управление организацией</span>
          <h1>Tartib</h1>
        </div>
        <p>
          Команда, группы и оплаты в одном спокойном рабочем пространстве.
        </p>
        <div className="home-actions">
          <Link className="primary-button" href={isLocalMode ? '/dashboard' : '/login'}>
            {isLocalMode ? 'Открыть тестовый клуб' : 'Войти'}
            <ArrowRight size={18} />
          </Link>
          {!isLocalMode ? (
            <Link className="ghost-button" href="/onboarding">
              <Building2 size={18} />
              Создать клуб
            </Link>
          ) : null}
        </div>
        <footer>Команда · Группы · Оплаты</footer>
      </section>
    </main>
  );
}
