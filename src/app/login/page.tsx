import { AuthPanel } from '@features/auth/AuthPanel';
import type { ReactElement } from 'react';

export default function LoginPage(): ReactElement {
  return (
    <main className="auth-screen">
      <section className="auth-copy">
        <p className="eyebrow">Tartib</p>
        <h1>Вход или регистрация</h1>
        <p>Один аккаунт для владельца, тренера или ученика.</p>
      </section>
      <AuthPanel />
    </main>
  );
}
