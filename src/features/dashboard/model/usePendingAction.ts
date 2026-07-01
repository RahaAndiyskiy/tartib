import { useState } from 'react';

type PendingActionRuntime = {
  buttonLabel: (key: string, defaultLabel: string) => string;
  isPendingAction: (key: string) => boolean;
  runRemoteActionWithPending: <T>(
    payload: Record<string, unknown>,
    pendingKey: string
  ) => Promise<T | null>;
};

type PendingActionOptions = {
  runRemoteActionData: <T>(payload: Record<string, unknown>) => Promise<T | null>;
};

export function usePendingAction({
  runRemoteActionData
}: PendingActionOptions): PendingActionRuntime {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const isPendingAction = (key: string): boolean => pendingAction === key;

  const buttonLabel = (key: string, defaultLabel: string): string =>
    isPendingAction(key)
      ? key.startsWith('create-invite:')
        ? 'Р“РѕС‚РѕРІРёРј СЃСЃС‹Р»РєСѓ...'
        : defaultLabel.toLowerCase().includes('СѓРґР°Р»')
          ? 'РЈРґР°Р»СЏРµРј...'
          : 'РЎРѕС…СЂР°РЅСЏРµРј...'
      : defaultLabel;

  const runRemoteActionWithPending = async <T,>(
    payload: Record<string, unknown>,
    pendingKey: string
  ): Promise<T | null> => {
    setPendingAction(pendingKey);
    try {
      return await runRemoteActionData<T>(payload);
    } finally {
      setPendingAction((current) => (current === pendingKey ? null : current));
    }
  };

  return {
    buttonLabel,
    isPendingAction,
    runRemoteActionWithPending
  };
}
