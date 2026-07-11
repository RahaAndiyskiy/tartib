import { Bell } from 'lucide-react';
import type { LocalNotification } from '@shared/lib/localWorkspace';
import type { PaymentRequest, PaymentRequestStatus } from '@shared/types/domain';
import { useScrollLock } from '@shared/ui/useScrollLock';
import { ModalCloseButton } from '@shared/ui/ModalCloseButton';

type NotificationsModalProps = {
  notifications: LocalNotification[];
  unreadCount: number;
  paymentForNotification: (notification: LocalNotification) => PaymentRequest | null;
  canDecidePayment: (payment: PaymentRequest) => boolean;
  isPendingAction: (action: string) => boolean;
  onClose: () => void;
  onMarkRead: () => void;
  onDecidePayment: (paymentId: string, status: PaymentRequestStatus) => void;
  onDecideDelay: (paymentId: string, approved: boolean) => void;
  onOpenPayment: (paymentId?: string | null) => void;
};

export function NotificationsModal({
  notifications,
  unreadCount,
  paymentForNotification,
  canDecidePayment,
  isPendingAction,
  onClose,
  onMarkRead,
  onDecidePayment,
  onDecideDelay,
  onOpenPayment
}: NotificationsModalProps): React.ReactElement {
  useScrollLock();

  return (
    <div className="modal-backdrop notification-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="notifications-modal-title"
        aria-modal="true"
        className="confirm-modal notifications-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-standard-header notifications-modal-header">
          <div>
            <h2 id="notifications-modal-title">Уведомления</h2>
            <p>События и действия, которые можно обработать сразу</p>
          </div>
          <ModalCloseButton label="Закрыть уведомления" onClick={onClose} />
        </div>
        <div className="notification-header-actions">
          {unreadCount > 0 ? (
            <button className="small-button secondary" type="button" onClick={onMarkRead}>
              Отметить прочитанными
            </button>
          ) : null}
        </div>
        <div className="notification-list">
          {[...notifications].reverse().map((notification) => {
            const payment = paymentForNotification(notification);
            const canDecide = payment ? canDecidePayment(payment) : false;
            return (
              <article className={notification.read ? 'notification-row' : 'notification-row unread'} key={notification.id}>
                <Bell size={18} />
                <div>
                  <strong>{notification.message}</strong>
                  <span>{new Date(notification.createdAt).toLocaleString('ru-RU')}</span>
                </div>
                {payment ? (
                  <div className="notification-actions">
                    {canDecide && payment.status === 'payment_confirmation' ? (
                      <>
                        <button
                          className="small-button"
                          type="button"
                          disabled={isPendingAction(`decide-payment:${payment.id}`)}
                          onClick={() => onDecidePayment(payment.id, 'paid')}
                        >
                          Подтвердить
                        </button>
                        <button
                          className="small-button secondary"
                          type="button"
                          disabled={isPendingAction(`decide-payment:${payment.id}`)}
                          onClick={() => onDecidePayment(payment.id, 'active')}
                        >
                          Отклонить
                        </button>
                      </>
                    ) : null}
                    {canDecide && payment.status === 'delay_requested' ? (
                      <>
                        <button
                          className="small-button"
                          type="button"
                          disabled={isPendingAction(`decide-delay:${payment.id}`)}
                          onClick={() => onDecideDelay(payment.id, true)}
                        >
                          Одобрить
                        </button>
                        <button
                          className="small-button secondary"
                          type="button"
                          disabled={isPendingAction(`decide-delay:${payment.id}`)}
                          onClick={() => onDecideDelay(payment.id, false)}
                        >
                          Отклонить
                        </button>
                      </>
                    ) : null}
                    <button
                      className="small-button secondary"
                      type="button"
                      onClick={() => onOpenPayment(notification.paymentId)}
                    >
                      Открыть счёт
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {notifications.length === 0 ? <p className="empty-state">Уведомлений пока нет.</p> : null}
        </div>
      </section>
    </div>
  );
}
