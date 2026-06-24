'use client';

import { useEffect } from 'react';

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps): JSX.Element {
  useEffect(() => {
    console.error('[dashboard] render failed', error);
  }, [error]);

  return (
    <main className="app-shell loading-state">
      <section className="loading-card dashboard-error-card">
        <p className="eyebrow">Tartib</p>
        <h1>Не удалось открыть кабинет</h1>
        <p className="muted-copy">
          Интерфейс столкнулся с ошибкой. Данные клуба не удалены, можно попробовать обновить экран.
        </p>
        <div className="dashboard-error-actions">
          <button className="primary-button" type="button" onClick={reset}>
            Попробовать ещё раз
          </button>
          <button className="ghost-button" type="button" onClick={() => { window.location.href = '/login'; }}>
            На страницу входа
          </button>
        </div>
      </section>
    </main>
  );
}
