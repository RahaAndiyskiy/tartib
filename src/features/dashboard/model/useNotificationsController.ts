import type {
  LocalNotification,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import { markNotificationsReadAction } from '@/modules/notifications';

type RunRemoteActionData = <T>(payload: Record<string, unknown>) => Promise<T | null>;

type UseNotificationsControllerOptions = {
  activeUserId: string;
  isLocalMode: boolean;
  openNotificationsPanel: () => void;
  runRemoteActionData: RunRemoteActionData;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
  unreadNotifications: LocalNotification[];
  workspace: LocalWorkspace | null;
};

type NotificationsController = {
  markNotificationsRead: () => Promise<void>;
  openNotifications: () => void;
};

export function useNotificationsController({
  activeUserId,
  isLocalMode,
  openNotificationsPanel,
  runRemoteActionData,
  saveWorkspace,
  setWorkspace,
  unreadNotifications,
  workspace
}: UseNotificationsControllerOptions): NotificationsController {
  async function markNotificationsRead(): Promise<void> {
    await markNotificationsReadAction({
      workspace,
      unreadCount: unreadNotifications.length,
      activeUserId,
      isLocalMode,
      runRemoteActionData,
      saveWorkspace,
      setWorkspace
    });
  }

  function openNotifications(): void {
    openNotificationsPanel();
    if (unreadNotifications.length > 0) {
      void markNotificationsRead();
    }
  }

  return {
    markNotificationsRead,
    openNotifications
  };
}
