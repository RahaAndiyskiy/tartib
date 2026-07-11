import { useEffect, useState } from 'react';
import {
  resetWorkspace,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { PushAvailability, PushOperationStage } from '@shared/lib/pushClient';
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
    setPushStatus('disabled');
    setPushPending(false);
    setPushStage(null);
    setPushNotice({
      tone: 'info',
      text: isLocalMode
        ? 'В локальном режиме push не используется.'
        : 'Внешние push временно скрыты. Уведомления работают внутри приложения.'
    });
  }, [isLocalMode]);

  async function ensurePushEnabled(): Promise<void> {
    setPushNotice({ tone: 'info', text: 'Внешние push временно скрыты. Используем уведомления внутри приложения.' });
  }

  async function sendTestPush(): Promise<void> {
    setPushNotice({ tone: 'info', text: 'Тест внешних push временно отключён.' });
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
