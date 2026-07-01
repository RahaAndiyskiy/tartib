import { useEffect, useState } from 'react';
import {
  resetWorkspace,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import {
  enablePushNotifications,
  pushPermissionState,
  pushSupported,
  type PushAvailability
} from '@shared/lib/pushClient';
import { getSupabaseClient } from '@shared/lib/supabaseClient';

type UseAccountRuntimeOptions = {
  isLocalMode: boolean;
  setActiveUserId: React.Dispatch<React.SetStateAction<string>>;
  setMessage: (message: string) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
};

type AccountRuntime = {
  enablePush: () => Promise<void>;
  handleReset: () => void;
  openNewWindow: () => void;
  pushStatus: PushAvailability;
  signOut: () => Promise<void>;
};

export function useAccountRuntime({
  isLocalMode,
  setActiveUserId,
  setMessage,
  setWorkspace
}: UseAccountRuntimeOptions): AccountRuntime {
  const [pushStatus, setPushStatus] = useState<PushAvailability>('unsupported');

  useEffect(() => {
    if (isLocalMode) {
      setPushStatus('disabled');
      return;
    }

    setPushStatus(pushPermissionState());
  }, [isLocalMode]);

  async function enablePush(): Promise<void> {
    if (!pushSupported()) {
      setPushStatus('unsupported');
      setMessage('Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ СЌС‚РёРј Р±СЂР°СѓР·РµСЂРѕРј.');
      return;
    }

    try {
      const nextStatus = await enablePushNotifications();
      setPushStatus(nextStatus);
      setMessage(
        nextStatus === 'granted'
          ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РІРєР»СЋС‡РµРЅС‹.'
          : nextStatus === 'disabled'
            ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РїРѕРєР° РЅРµ РЅР°СЃС‚СЂРѕРµРЅС‹ РЅР° СЃРµСЂРІРµСЂРµ.'
            : nextStatus === 'blocked'
              ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅС‹ РІ РЅР°СЃС‚СЂРѕР№РєР°С… Р±СЂР°СѓР·РµСЂР°.'
              : 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅРµ РІРєР»СЋС‡РµРЅС‹.'
      );
    } catch (error) {
      console.warn('[push] enable failed', error);
      setMessage(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РІРєР»СЋС‡РёС‚СЊ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ.');
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
    enablePush,
    handleReset,
    openNewWindow,
    pushStatus,
    signOut
  };
}
