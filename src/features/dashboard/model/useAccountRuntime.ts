import { useEffect, useState } from 'react';
import {
  resetWorkspace,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import {
  disablePushNotifications,
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
  pushPending: boolean;
  handleReset: () => void;
  openNewWindow: () => void;
  pushStage: PushOperationStage | null;
  pushStatus: PushAvailability;
  signOut: () => Promise<void>;
  togglePush: () => Promise<void>;
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
      .then((status) => {
        if (mounted) setPushStatus(status);
      })
      .catch((error) => {
        console.warn('[push] status check failed', error);
        if (mounted) setPushStatus(pushSupported() ? 'enabled' : 'unsupported');
      });

    return () => {
      mounted = false;
    };
  }, [isLocalMode]);

  async function togglePush(): Promise<void> {
    if (pushPending) return;

    if (!pushSupported()) {
      setPushStatus('unsupported');
      setMessage('Push-уведомления не поддерживаются этим браузером.');
      return;
    }

    setPushPending(true);
    setPushStage(pushStatus === 'granted' ? 'removing-subscription' : 'checking-permission');
    try {
      if (pushStatus === 'granted') {
        await disablePushNotifications({ onStage: setPushStage });
        setPushStatus('enabled');
        setMessage('Push-уведомления отключены на этом устройстве.');
        return;
      }

      const nextStatus = await enablePushNotifications({ onStage: setPushStage });
      setPushStatus(nextStatus);
      setMessage(
        nextStatus === 'granted'
          ? 'Push-уведомления включены.'
          : nextStatus === 'disabled'
            ? 'Push-уведомления пока не настроены на сервере.'
            : nextStatus === 'blocked'
              ? 'Push-уведомления заблокированы в настройках браузера.'
              : 'Push-уведомления не включены.'
      );
    } catch (error) {
      console.warn('[push] toggle failed', error);
      setMessage(error instanceof Error ? error.message : 'Не удалось изменить push-уведомления.');
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
    setMessage('РўРµСЃС‚РѕРІС‹Рµ РґР°РЅРЅС‹Рµ СЃР±СЂРѕС€РµРЅС‹.');
  }

  function openNewWindow(): void {
    window.open('/dashboard', '_blank', 'noopener,noreferrer');
  }

  async function signOut(): Promise<void> {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  return {
    pushPending,
    handleReset,
    openNewWindow,
    pushStage,
    pushStatus,
    signOut,
    togglePush
  };
}
