import Link from 'next/link';

export default function HomePage() {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';

  return (
    <main className="home-screen">
      <section className="home-hero">
        <p className="eyebrow">Tartib v0.1</p>
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
