import type {
  LocalBillingPlan,
  LocalNotification,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser, PaymentRequest } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import type { PaymentView } from '@/modules/payments';

type UsePaymentNavigationOptions = {
  activePlanByMemberId: Map<string, LocalBillingPlan>;
  activeUser: AppUser | null;
  openPaymentUiView: (view: PaymentView) => void;
  openPayments: () => void;
  selectPaymentMember: (memberId: string, view?: PaymentView) => void;
  workspace: LocalWorkspace | null;
};

type PaymentNavigation = {
  canDecideNotificationPayment: (payment: PaymentRequest) => boolean;
  canSubmitPrepayment: (payment: PaymentRequest) => boolean;
  notificationPayment: (notification: LocalNotification) => PaymentRequest | null;
  openNotificationPayment: (paymentId?: string | null) => void;
  openPaymentsView: (view: PaymentView) => void;
  openPrepayment: (payment: PaymentRequest) => void;
};

export function usePaymentNavigation({
  activePlanByMemberId,
  activeUser,
  openPaymentUiView,
  openPayments,
  selectPaymentMember,
  workspace
}: UsePaymentNavigationOptions): PaymentNavigation {
  function openPaymentsView(view: PaymentView): void {
    openPayments();
    openPaymentUiView(view);
  }

  function openNotificationPayment(paymentId?: string | null): void {
    if (!paymentId || !workspace) return;
    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    openPayments();
    selectPaymentMember(payment.member_id, payment.status === 'paid' ? 'paid' : 'all');
  }

  function notificationPayment(notification: LocalNotification): PaymentRequest | null {
    if (!notification.paymentId || !workspace) return null;
    return workspace.payments.find((payment) => payment.id === notification.paymentId) ?? null;
  }

  function canDecideNotificationPayment(payment: PaymentRequest): boolean {
    return Boolean(
      activeUser &&
        (hasRole(activeUser, 'owner') ||
          (hasRole(activeUser, 'trainer') && payment.trainer_id === activeUser.id))
    );
  }

  function openPrepayment(payment: PaymentRequest): void {
    openPayments();
    selectPaymentMember(payment.member_id, 'all');
    window.setTimeout(() => {
      document.getElementById(`prepayment-${payment.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 80);
  }

  function canSubmitPrepayment(payment: PaymentRequest): boolean {
    const plan = activePlanByMemberId.get(payment.member_id);
    return (
      hasRole(activeUser, 'member') &&
      payment.member_id === activeUser?.id &&
      ['active', 'overdue', 'delayed'].includes(payment.status) &&
      Boolean(plan?.active && plan.type === 'monthly')
    );
  }

  return {
    canDecideNotificationPayment,
    canSubmitPrepayment,
    notificationPayment,
    openNotificationPayment,
    openPaymentsView,
    openPrepayment
  };
}
