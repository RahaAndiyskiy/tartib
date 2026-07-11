import { useEffect, useState } from 'react';
import {
  resetWorkspace,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import {
  enablePushNotifications,
  preparePushServiceWorker,
  pushSubscriptionState,
  pushSupported,
  sendTestPushNotification,
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
    return { tone: 'success', text: 'Push включён на этом устройстве.' };
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
    text: 'Нужно один раз разрешить уведомления в системном окне.'
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

    void preparePushServiceWorker()
      .catch((error) => {
        console.warn('[push] service worker prepare failed', error);
      })
      .finally(() => {
        void pushSubscriptionState()
          .then((status) => {
            if (!mounted) return;
            setPushStatus(status);
            if (status === 'granted') {
              setPushNotice({ tone: 'success', text: 'Push уже включён на этом устройстве.' });
            }
          })
          .catch((error) => {
            console.warn('[push] status check failed', error);
            if (!mounted) return;
            const fallbackStatus = pushSupported() ? 'enabled' : 'unsupported';
            setPushStatus(fallbackStatus);
          });
      });

    return () => {
      mounted = false;
    };
  }, [isLocalMode]);

  async function runPushTest(): Promise<void> {
    setPushStage('testing-delivery');
    await sendTestPushNotification();
  }

  async function ensurePushEnabled(): Promise<void> {
    if (pushPending) return;

    if (!pushSupported()) {
      setPushStatus('unsupported');
      setPushNotice(pushResultNotice('unsupported'));
      return;
    }

    setPushPending(true);
    setPushStage('checking-permission');
    setPushNotice({ tone: 'info', text: 'Готовим push и проверяем доставку.' });

    try {
      const nextStatus = await enablePushNotifications({ onStage: setPushStage });
      setPushStatus(nextStatus);

      if (nextStatus !== 'granted') {
        setPushNotice(pushResultNotice(nextStatus));
        return;
      }

      await runPushTest();
      setPushNotice({ tone: 'success', text: 'Push включён. Тестовое уведомление отправлено.' });
    } catch (error) {
      console.warn('[push] enable failed', error);
      setPushStatus(pushPermissionStateFallback());
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
    setPushStage('testing-delivery');
    setPushNotice({ tone: 'info', text: 'Отправляем тестовое push-уведомление.' });

    try {
      await runPushTest();
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

function pushPermissionStateFallback(): PushAvailability {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') return 'enabled';
  return 'enabled';
}
