'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Dumbbell, UserRound } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import { normalizeUsername, usernameToAuthEmail } from '@shared/lib/authUsername';

type InviteDetails = {
  firstName: string;
  lastName: string;
  organizationName: string;
  trainerName: string;
  group: {
    activity: string;
    days: string;
    time: string;
  };
  expiresAt: string;
  isPersonal: boolean;
};

export function InvitationClaim(): React.ReactElement {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadInvite(): Promise<void> {
      try {
        const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`);
        const data = (await response.json()) as InviteDetails & { error?: string };
        if (!response.ok) {
          setMessage(data.error ?? 'Приглашение недоступно.');
          return;
        }
        setInvite(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
      } catch {
        setMessage('Не удалось загрузить приглашение. Попробуйте ещё раз.');
      } finally {
        setIsLoading(false);
      }
    }

    if (token) void loadInvite();
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const normalizedUsername = normalizeUsername(username);
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          username: normalizedUsername,
          password,
          phone
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error ?? 'Не удалось завершить регистрацию.');
        return;
      }

      const loginResult = await getSupabaseClient().auth.signInWithPassword({
        email: usernameToAuthEmail(normalizedUsername),
        password
      });
      if (loginResult.error) {
        setMessage('Аккаунт создан. Войдите с новым логином на странице входа.');
        window.setTimeout(() => router.push('/login'), 1200);
        return;
      }

      router.push('/dashboard');
    } catch {
      setMessage('Не удалось связаться с сервером. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="invite-screen">
      <section className="invite-card">
        <p className="eyebrow">Tartib · приглашение</p>
        {isLoading ? <p className="muted-copy">Загружаем данные группы...</p> : null}

        {!isLoading && !invite ? (
          <>
            <h1>Ссылка недоступна</h1>
            <p className="form-message">{message}</p>
          </>
        ) : null}

        {invite ? (
          <>
            <div className="invite-heading">
              <CheckCircle2 aria-hidden="true" size={28} />
              <div>
                <h1>{invite.organizationName}</h1>
                <p>Заполните данные, чтобы присоединиться к группе</p>
              </div>
            </div>

            <div className="invite-summary">
              <div><Dumbbell size={18} /><span><strong>{invite.group.activity}</strong>{invite.group.days} · {invite.group.time.slice(0, 5)}</span></div>
              <div><UserRound size={18} /><span><strong>Тренер</strong>{invite.trainerName}</span></div>
              <div><Clock3 size={18} /><span><strong>Ссылка действует до</strong>{new Date(invite.expiresAt).toLocaleDateString('ru-RU')}</span></div>
            </div>

            <form className="form-stack" onSubmit={submit}>
              <div className="split-fields">
                <label>
                  Имя
                  <input
                    autoComplete="given-name"
                    disabled={invite.isPersonal}
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
                <label>
                  Фамилия
                  <input
                    autoComplete="family-name"
                    disabled={invite.isPersonal}
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
              </div>
              <label>
                Придумайте логин
                <input
                  autoComplete="username"
                  minLength={3}
                  pattern="[A-Za-z0-9._-]+"
                  placeholder="Например: mansur.fit"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                Придумайте пароль
                <input
                  autoComplete="new-password"
                  minLength={6}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Телефон <span className="optional-label">необязательно</span>
                <input autoComplete="tel" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Создаём аккаунт...' : 'Присоединиться к группе'}
              </button>
            </form>
            {message ? <p className="form-message">{message}</p> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
