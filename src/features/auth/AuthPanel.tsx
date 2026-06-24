'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import { loginToAuthEmail, normalizeUsername } from '@shared/lib/authUsername';

type AuthMode = 'sign-in' | 'sign-up';

export function AuthPanel(): React.ReactElement {
  if (process.env.NEXT_PUBLIC_DATA_MODE === 'local') {
    return <LocalAuthPanel />;
  }

  return <SupabaseAuthPanel />;
}

function LocalAuthPanel(): React.ReactElement {
  return (
    <section className="auth-panel" aria-label="Локальный тестовый режим">
      <p className="eyebrow">Локальный режим</p>
      <h2>Вход не требуется</h2>
      <p className="muted-copy">
        Тестовые данные хранятся в браузере и доступны во всех вкладках Tartib.
      </p>
      <Link className="primary-button" href="/dashboard">
        Открыть тестовый клуб
      </Link>
    </section>
  );
}

function SupabaseAuthPanel(): React.ReactElement {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitAuth(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const supabase = getSupabaseClient();
      const normalizedUsername = normalizeUsername(username);

      if (mode === 'sign-up') {
        const registrationResponse = await fetch('/api/auth/register-owner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName,
            firstName,
            lastName,
            username: normalizedUsername,
            password
          })
        });
        const registration = (await registrationResponse.json()) as { error?: string };
        if (!registrationResponse.ok) {
          setMessage(registration.error ?? 'Не удалось создать аккаунт.');
          return;
        }
      }

      const result = await supabase.auth.signInWithPassword({
        email: loginToAuthEmail(username),
        password
      });

      if (result.error) {
        setMessage(
          result.error.message === 'Invalid login credentials'
            ? 'Неверный логин или пароль.'
            : result.error.message
        );
        return;
      }

      router.push('/dashboard');
    } catch (error) {
      console.error('[auth] failed', error);
      setMessage(
        error instanceof Error && error.message.includes('Supabase environment variables')
          ? 'Сервис входа пока не настроен на сервере. Проверьте переменные Supabase в Vercel.'
          : 'Не удалось связаться с сервисом входа. Попробуйте ещё раз.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-label="Авторизация">
      <div className="segmented-control">
        <button
          className={mode === 'sign-in' ? 'active' : ''}
          type="button"
          onClick={() => setMode('sign-in')}
        >
          Вход
        </button>
        <button
          className={mode === 'sign-up' ? 'active' : ''}
          type="button"
          onClick={() => setMode('sign-up')}
        >
          Регистрация
        </button>
      </div>

      <form className="form-stack" onSubmit={submitAuth}>
        {mode === 'sign-up' ? (
          <>
            <label>
              Название клуба
              <input
                required
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
              />
            </label>
            <div className="split-fields">
              <label>
                Имя
                <input
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </label>
              <label>
                Фамилия
                <input
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </label>
            </div>
          </>
        ) : null}
        <label>
          Логин
          <input
            autoComplete="username"
            minLength={3}
            placeholder="Логин или старый email"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Подождите...' : mode === 'sign-in' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>

      {message ? <p className="form-message">{message}</p> : null}
    </section>
  );
}
