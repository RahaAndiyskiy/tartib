import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import type { LocalWorkspace } from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import {
  saveOrganizationSettingsAction,
  saveProfileSettingsAction
} from '@/modules/account';
import type { SettingsDraft } from '../types';

type UseSettingsControllerOptions = {
  activeUser: AppUser | null;
  isLocalMode: boolean;
  runRemoteActionWithPending: <T>(
    payload: Record<string, unknown>,
    pendingKey: string
  ) => Promise<T | null>;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setMessage: (message: string) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
  workspace: LocalWorkspace | null;
};

type SettingsController = {
  saveOrganizationSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  saveProfileSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setSettingsDraft: React.Dispatch<React.SetStateAction<SettingsDraft>>;
  settingsDraft: SettingsDraft;
};

const emptySettingsDraft: SettingsDraft = {
  firstName: '',
  lastName: '',
  phone: '',
  organizationName: ''
};

export function useSettingsController({
  activeUser,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setMessage,
  setWorkspace,
  workspace
}: UseSettingsControllerOptions): SettingsController {
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(emptySettingsDraft);
  const activeUserFirstName = activeUser?.first_name ?? '';
  const activeUserId = activeUser?.id ?? '';
  const activeUserLastName = activeUser?.last_name ?? '';
  const activeUserPhone = activeUser?.phone ?? '';
  const organizationName = workspace?.organization.name ?? '';

  useEffect(() => {
    if (!activeUserId || !organizationName) {
      setSettingsDraft(emptySettingsDraft);
      return;
    }

    setSettingsDraft({
      firstName: activeUserFirstName,
      lastName: activeUserLastName,
      phone: activeUserPhone,
      organizationName
    });
  }, [
    activeUserFirstName,
    activeUserId,
    activeUserLastName,
    activeUserPhone,
    organizationName
  ]);

  async function saveProfileSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await saveProfileSettingsAction({
      workspace,
      activeUser,
      draft: settingsDraft,
      isLocalMode,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage
    });
  }

  async function saveOrganizationSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await saveOrganizationSettingsAction({
      workspace,
      activeUser,
      draft: settingsDraft,
      isLocalMode,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage
    });
  }

  return {
    saveOrganizationSettings,
    saveProfileSettings,
    setSettingsDraft,
    settingsDraft
  };
}
