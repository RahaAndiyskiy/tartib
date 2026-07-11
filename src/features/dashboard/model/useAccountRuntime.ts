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
  pushPending: boolean;
  pushStage: PushOperationStage | null;
  pushStatus: PushAvailability;
  sendTestPush: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAccountRuntime({
  isLocalMode,
  setActiveUserId,
  setMessage,
  setWorkspace
}: UseAccountRuntimeOptions): AccountRuntime {
  const [pushStatus, setPushStatus] = useState<PushAvailability>('unsupported');
  const [pushPending, setPushPending] = useState(false);
  const [pushStage, setPushStage] = useState<PushOperationStage | null>(null);

  useEffect(() => {
    if (isLocalMode) {
      setPushStatus('disabled');
      return;
    }

    let mounted = true;
    void pushSubscriptionState()
      .then(async (status) => {
        if (!mounted) return;
        setPushStatus(status);

        // Если пользователь уже разрешил push в браузере, Tartib сам восстанавливает подписку.
        if (status === 'enabled' && pushSupported() && Notification.permission === 'granted') {
          const nextStatus = await enablePushNotifications().catch(() => status);
          if (mounted) setPushStatus(nextStatus);
        }
      })
      .catch((error) => {
        console.warn('[push] status check failed', error);
        if (mounted) setPushStatus(pushSupported() ? 'enabled' : 'unsupported');
      });

    return () => {
      mounted = false;
    };
  }, [isLocalMode]);

  async function ensurePushEnabled(): Promise<void> {
    if (pushPending || pushStatus === 'granted') return;

    if (!pushSupported()) {
      setPushStatus('unsupported');
      setMessage('Push-уведомления не поддерживаются этим браузером.');
      return;
    }

    setPushPending(true);
    setPushStage('checking-permission');
    try {
      const nextStatus = await enablePushNotifications({ onStage: setPushStage });
      setPushStatus(nextStatus);
      setMessage(
        nextStatus === 'granted'
          ? 'Push-уведомления включены.'
          : nextStatus === 'disabled'
            ? 'Push пока не настроен на сервере.'
            : nextStatus === 'blocked'
              ? 'Push заблокирован в настройках браузера.'
              : 'Разрешите уведомления, чтобы Tartib мог присылать важные события.'
      );
    } catch (error) {
      console.warn('[push] enable failed', error);
      setMessage(error instanceof Error ? error.message : 'Не удалось включить push-уведомления.');
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

      setMessage('Тестовое push-уведомление отправлено.');
    } catch (error) {
      console.warn('[push] test failed', error);
      setMessage(error instanceof Error ? error.message : 'Не удалось проверить push.');
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
    pushPending,
    pushStage,
    pushStatus,
    sendTestPush,
    signOut
  };
}
