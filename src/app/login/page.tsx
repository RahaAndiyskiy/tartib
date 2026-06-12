import { AuthPanel } from '@features/auth/AuthPanel';

export default function LoginPage() {
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
