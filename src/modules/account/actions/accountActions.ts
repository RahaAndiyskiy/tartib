import type { LocalWorkspace } from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;
type SetWorkspace = (updater: (current: LocalWorkspace | null) => LocalWorkspace | null) => void;

type SettingsDraftLike = {
  firstName: string;
  lastName: string;
  phone: string;
  organizationName: string;
};

export async function saveProfileSettingsAction({
  workspace,
  activeUser,
  draft,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
}: {
  workspace: LocalWorkspace | null;
  activeUser: AppUser | null;
  draft: SettingsDraftLike;
  isLocalMode: boolean;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
}): Promise<void> {
  if (!workspace || !activeUser) return;

  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const phone = draft.phone.trim();

  if (!firstName || !lastName) {
    setMessage('Укажите имя и фамилию.');
    return;
  }

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<{ user: AppUser }>(
      {
        action: 'update_profile',
        firstName,
        lastName,
        phone,
      },
      'update-profile'
    );
    if (data?.user) {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              users: current.users.map((user) =>
                user.id === data.user.id
                  ? {
                      ...data.user,
                      roles: user.roles,
                    }
                  : user
              ),
            }
          : current
      );
      setMessage('Профиль сохранён.');
    }
    return;
  }

  saveWorkspace({
    ...workspace,
    users: workspace.users.map((user) =>
      user.id === activeUser.id
        ? {
            ...user,
            first_name: firstName,
            last_name: lastName,
            phone: phone || null,
          }
        : user
    ),
  });
  setMessage('Профиль сохранён.');
}

export async function saveOrganizationSettingsAction({
  workspace,
  activeUser,
  draft,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
}: {
  workspace: LocalWorkspace | null;
  activeUser: AppUser | null;
  draft: SettingsDraftLike;
  isLocalMode: boolean;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
}): Promise<void> {
  if (!workspace || !activeUser || !hasRole(activeUser, 'owner')) return;

  const name = draft.organizationName.trim();
  if (!name) {
    setMessage('Укажите название клуба.');
    return;
  }

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<{ organization: LocalWorkspace['organization'] }>(
      {
        action: 'update_organization',
        name,
      },
      'update-organization'
    );
    if (data?.organization) {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              organization: data.organization,
            }
          : current
      );
      setMessage('Настройки клуба сохранены.');
    }
    return;
  }

  saveWorkspace({
    ...workspace,
    organization: {
      ...workspace.organization,
      name,
    },
  });
  setMessage('Настройки клуба сохранены.');
}
