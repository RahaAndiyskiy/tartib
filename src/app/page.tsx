'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
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
    <main className="home-screen">
      <section className="home-hero">
        <p className="eyebrow">Tartib v0.6</p>
        <h1>Tartib</h1>
        <p>
          Управляйте тренерами, учениками и оплатами внутри одной организации.
        </p>
        <div className="home-actions">
          <Link className="primary-button" href={isLocalMode ? '/dashboard' : '/login'}>
            {isLocalMode ? 'Открыть тестовый клуб' : 'Войти'}
          </Link>
          {!isLocalMode ? (
            <Link className="ghost-button" href="/onboarding">
              Создать клуб
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
