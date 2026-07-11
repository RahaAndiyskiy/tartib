import { useEffect, useState } from 'react';
import {
  resetWorkspace,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import {
  enablePushNotifications,
  pushSubscriptionState,
  pushSupported,
  type PushAvailability,
  type PushOperationStage
} from '@shared/lib/pushClient';
import { getSupabaseClient } from '@shared/lib/supabaseClient';

export type PushNotice = {
  tone: 'error' | 'info' | 'success';
  text: string;
};

type UseAccountRuntimeOptions = {
  isLocalMode: boolean;
  setActiveUserId: React.Dispatch<React.SetStateAction<string>>;
  setMessage: (message: string) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
};

type AccountRuntime = {
  ensurePushEnabled: () => Promise<void>;
  handleReset: () => void;
  openNewWindow: () => void;
  pushNotice: PushNotice | null;
  pushPending: boolean;
  pushStage: PushOperationStage | null;
  pushStatus: PushAvailability;
  sendTestPush: () => Promise<void>;
  signOut: () => Promise<void>;
};

function pushResultNotice(status: PushAvailability): PushNotice {
  if (status === 'granted') {
    return { tone: 'success', text: 'Push включён. Теперь можно отправить тест.' };
  }

  if (status === 'blocked') {
    return {
      tone: 'error',
      text: 'Push заблокирован в настройках браузера или телефона. Разрешите уведомления для Tartib.'
    };
  }

  if (status === 'disabled') {
    return { tone: 'error', text: 'Push настроен не полностью: сервер не отдал VAPID ключ.' };
  }

  if (status === 'unsupported') {
    return { tone: 'error', text: 'Этот браузер не поддерживает web push. Откройте Tartib как PWA.' };
  }

  return {
    tone: 'info',
    text: 'Разрешение не выдано. Нажмите кнопку ещё раз и подтвердите уведомления в системном окне.'
  };
}

export function useAccountRuntime({
  isLocalMode,
  setActiveUserId,
  setMessage,
  setWorkspace
}: UseAccountRuntimeOptions): AccountRuntime {
  const [pushStatus, setPushStatus] = useState<PushAvailability>('unsupported');
  const [pushPending, setPushPending] = useState(false);
  const [pushStage, setPushStage] = useState<PushOperationStage | null>(null);
  const [pushNotice, setPushNotice] = useState<PushNotice | null>(null);

  useEffect(() => {
    if (isLocalMode) {
      setPushStatus('disabled');
      setPushNotice({ tone: 'info', text: 'В локальном режиме push не используется.' });
      return;
    }

    let mounted = true;
    void pushSubscriptionState()
      .then(async (status) => {
        if (!mounted) return;
        setPushStatus(status);

        if (status === 'granted') {
          setPushNotice({ tone: 'success', text: 'Push уже включён на этом устройстве.' });
          return;
        }

        // Если браузер уже дал разрешение, восстанавливаем подписку без лишнего вопроса.
        if (status === 'enabled' && pushSupported() && Notification.permission === 'granted') {
          const nextStatus = await enablePushNotifications().catch(() => status);
          if (!mounted) return;
          setPushStatus(nextStatus);
          setPushNotice(pushResultNotice(nextStatus));
        }
      })
      .catch((error) => {
        console.warn('[push] status check failed', error);
        if (!mounted) return;
        const fallbackStatus = pushSupported() ? 'enabled' : 'unsupported';
        setPushStatus(fallbackStatus);
        setPushNotice(pushResultNotice(fallbackStatus));
      });

    return () => {
      mounted = false;
    };
  }, [isLocalMode]);

  async function ensurePushEnabled(): Promise<void> {
    if (pushPending) return;

    if (pushStatus === 'granted') {
      setPushNotice({ tone: 'success', text: 'Push уже включён. Нажмите “Проверить push”.' });
      return;
    }

    if (!pushSupported()) {
      setPushStatus('unsupported');
      setPushNotice(pushResultNotice('unsupported'));
      return;
    }

    setPushPending(true);
    setPushStage('checking-permission');
    setPushNotice({ tone: 'info', text: 'Ожидаем разрешение браузера.' });

    try {
      const nextStatus = await enablePushNotifications({ onStage: setPushStage });
      setPushStatus(nextStatus);
      setPushNotice(pushResultNotice(nextStatus));
    } catch (error) {
      console.warn('[push] enable failed', error);
      setPushNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Не удалось включить push-уведомления.'
      });
    } finally {
      setPushPending(false);
      setPushStage(null);
    }
  }

  async function sendTestPush(): Promise<void> {
    if (pushPending) return;

    if (pushStatus !== 'granted') {
      await ensurePushEnabled();
      return;
    }

    setPushPending(true);
    setPushStage('saving-subscription');
    setPushNotice({ tone: 'info', text: 'Отправляем тестовое уведомление.' });

    try {
      const supabase = getSupabaseClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Требуется вход.');

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Не удалось отправить тестовое уведомление.');
      }

      setPushNotice({ tone: 'success', text: 'Тестовое push-уведомление отправлено.' });
    } catch (error) {
      console.warn('[push] test failed', error);
      setPushNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Не удалось проверить push.'
      });
    } finally {
      setPushPending(false);
      setPushStage(null);
    }
  }

  function handleReset(): void {
    const nextWorkspace = resetWorkspace();
    const owner = nextWorkspace.users[0];
    setWorkspace(nextWorkspace);
    setActiveUserId(owner.id);
    setMessage('Тестовые данные сброшены.');
  }

  function openNewWindow(): void {
    window.open('/dashboard', '_blank', 'noopener,noreferrer');
  }

  async function signOut(): Promise<void> {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  return {
    ensurePushEnabled,
    handleReset,
    openNewWindow,
    pushNotice,
    pushPending,
    pushStage,
    pushStatus,
    sendTestPush,
    signOut
  };
}
