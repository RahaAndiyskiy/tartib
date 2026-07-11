import type {
  LocalNotification,
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type {
  PaymentRequest,
  PaymentRequestStatus
} from '@shared/types/domain';
import type { MemberInviteResult } from '../types';
import { InviteLinkModal } from '../InviteLinkModal';
import { LogoutConfirmModal } from '../LogoutConfirmModal';
import { NotificationsModal } from '@/modules/notifications';

type DashboardOverlaysProps = {
  notificationsOpen: boolean;
  logoutConfirmOpen: boolean;
  inviteModalOpen: boolean;
  notifications: LocalNotification[];
  unreadCount: number;
  invite: MemberInviteResult | null;
  groups: LocalTrainingGroup[];
  paymentForNotification: (notification: LocalNotification) => PaymentRequest | null;
  canDecidePayment: (payment: PaymentRequest) => boolean;
  isPendingAction: (action: string) => boolean;
  isPendingInviteGroup: (groupId: string) => boolean;
  onCloseNotifications: () => void;
  onMarkNotificationsRead: () => void;
  onDecidePayment: (paymentId: string, status: PaymentRequestStatus) => void;
  onDecideDelay: (paymentId: string, approved: boolean) => void;
  onOpenNotificationPayment: (paymentId?: string | null) => void;
  onCancelLogout: () => void;
  onConfirmLogout: () => void;
  onCreateInvite: (groupId: string) => void;
  onCopyInvite: () => void;
  onShareInvite: () => void;
  onCloseInvite: () => void;
};

export function DashboardOverlays({
  notificationsOpen,
  logoutConfirmOpen,
  inviteModalOpen,
  notifications,
  unreadCount,
  invite,
  groups,
  paymentForNotification,
  canDecidePayment,
  isPendingAction,
  isPendingInviteGroup,
  onCloseNotifications,
  onMarkNotificationsRead,
  onDecidePayment,
  onDecideDelay,
  onOpenNotificationPayment,
  onCancelLogout,
  onConfirmLogout,
  onCreateInvite,
  onCopyInvite,
  onShareInvite,
  onCloseInvite
}: DashboardOverlaysProps): React.ReactElement {
  return (
    <>
      {notificationsOpen ? (
        <NotificationsModal
          notifications={notifications}
          unreadCount={unreadCount}
          paymentForNotification={paymentForNotification}
          canDecidePayment={canDecidePayment}
          isPendingAction={isPendingAction}
          onClose={onCloseNotifications}
          onMarkRead={onMarkNotificationsRead}
          onDecidePayment={onDecidePayment}
          onDecideDelay={onDecideDelay}
          onOpenPayment={onOpenNotificationPayment}
        />
      ) : null}

      {logoutConfirmOpen ? (
        <LogoutConfirmModal
          onCancel={onCancelLogout}
          onConfirm={onConfirmLogout}
        />
      ) : null}

      {inviteModalOpen ? (
        <InviteLinkModal
          invite={invite}
          groups={groups}
          isPendingGroup={isPendingInviteGroup}
          onCreateInvite={onCreateInvite}
          onCopy={onCopyInvite}
          onShare={onShareInvite}
          onClose={onCloseInvite}
        />
      ) : null}
    </>
  );
}
