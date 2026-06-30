import type { LocalWorkspace } from '@shared/lib/localWorkspace';

type SetWorkspace = (updater: (current: LocalWorkspace | null) => LocalWorkspace | null) => void;

type RunRemoteActionData = <T>(payload: Record<string, unknown>) => Promise<T | null>;

export function markWorkspaceNotificationsRead(
  workspace: LocalWorkspace,
  userId: string
): LocalWorkspace {
  return {
    ...workspace,
    notifications: workspace.notifications.map((notification) =>
      notification.userId === userId ? { ...notification, read: true } : notification
    )
  };
}

export async function markNotificationsReadAction({
  workspace,
  unreadCount,
  activeUserId,
  isLocalMode,
  runRemoteActionData,
  saveWorkspace,
  setWorkspace
}: {
  workspace: LocalWorkspace | null;
  unreadCount: number;
  activeUserId: string;
  isLocalMode: boolean;
  runRemoteActionData: RunRemoteActionData;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
}): Promise<void> {
  if (!workspace || unreadCount === 0) return;

  if (!isLocalMode) {
    const data = await runRemoteActionData<{ success?: boolean }>({
      action: 'mark_notifications_read'
    });
    if (data?.success) {
      setWorkspace((current) =>
        current ? markWorkspaceNotificationsRead(current, activeUserId) : current
      );
    }
    return;
  }

  saveWorkspace(markWorkspaceNotificationsRead(workspace, activeUserId));
}
