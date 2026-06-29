import { formatMoney } from '@shared/constants/app';
import type {
  LocalBillingPlan,
  LocalNotification,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  PaymentRequest,
  PaymentRequestStatus
} from '@shared/types/domain';

export type RemotePaymentMutationResult = {
  payment?: PaymentRequest;
  nextPayment?: PaymentRequest | null;
  notification?: LocalNotification;
};

export type RemotePaymentDeletionResult = {
  deletedPaymentId: string;
  disabledPlanId: string | null;
  notification?: LocalNotification;
};

export function upsertPayment(workspace: LocalWorkspace, payment: PaymentRequest): LocalWorkspace {
  return {
    ...workspace,
    payments: workspace.payments.some((item) => item.id === payment.id)
      ? workspace.payments.map((item) => (item.id === payment.id ? payment : item))
      : [...workspace.payments, payment]
  };
}

export function upsertBillingPlan(
  workspace: LocalWorkspace,
  billingPlan: LocalBillingPlan
): LocalWorkspace {
  return {
    ...workspace,
    billingPlans: workspace.billingPlans.some((plan) => plan.id === billingPlan.id)
      ? workspace.billingPlans.map((plan) => (plan.id === billingPlan.id ? billingPlan : plan))
      : [...workspace.billingPlans, billingPlan]
  };
}

export function applyRemotePaymentMutation(
  workspace: LocalWorkspace,
  data: RemotePaymentMutationResult,
  activeUserId: string
): LocalWorkspace {
  const withPayment = data.payment
    ? upsertPayment(workspace, data.payment)
    : workspace;

  return {
    ...withPayment,
    payments: [
      ...withPayment.payments,
      ...(data.nextPayment && !withPayment.payments.some((item) => item.id === data.nextPayment?.id)
        ? [data.nextPayment]
        : [])
    ],
    notifications:
      data.notification && data.notification.userId === activeUserId
        ? [...withPayment.notifications, data.notification]
        : withPayment.notifications
  };
}

export function applyRemotePaymentDeletion(
  workspace: LocalWorkspace,
  data: RemotePaymentDeletionResult,
  activeUserId: string
): LocalWorkspace {
  return {
    ...workspace,
    payments: workspace.payments.filter((item) => item.id !== data.deletedPaymentId),
    billingPlans: data.disabledPlanId
      ? workspace.billingPlans.map((plan) =>
          plan.id === data.disabledPlanId ? { ...plan, active: false } : plan
        )
      : workspace.billingPlans,
    notifications:
      data.notification && data.notification.userId === activeUserId
        ? [...workspace.notifications, data.notification]
        : workspace.notifications
  };
}

export function deleteLocalPayment({
  workspace,
  payment,
  now,
  createId
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  now: string;
  createId: () => string;
}): LocalWorkspace {
  return {
    ...workspace,
    payments: workspace.payments.filter((item) => item.id !== payment.id),
    billingPlans: workspace.billingPlans.map((plan) =>
      plan.id === payment.plan_id ? { ...plan, active: false, updatedAt: now } : plan
    ),
    notifications: [
      ...workspace.notifications.filter((notification) => notification.paymentId !== payment.id),
      {
        id: createId(),
        userId: payment.member_id,
        message: `Счёт отменён: ${formatMoney(payment.amount)}.`,
        createdAt: now,
        read: false
      }
    ]
  };
}

export function submitLocalPaymentConfirmation({
  workspace,
  payment,
  now,
  createId,
  userName
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
}): LocalWorkspace {
  return {
    ...workspace,
    payments: workspace.payments.map((item) =>
      item.id === payment.id ? { ...item, status: 'payment_confirmation' } : item
    ),
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.trainer_id,
        message: `${userName(payment.member_id)}: оплата ${formatMoney(payment.amount)}.`,
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}

export function submitLocalPrepayment({
  workspace,
  payment,
  months,
  amount,
  periodLabel,
  now,
  createId,
  userName
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  months: number;
  amount: number;
  periodLabel: string;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
}): LocalWorkspace {
  return {
    ...workspace,
    payments: workspace.payments.map((item) =>
      item.id === payment.id
        ? {
            ...item,
            status: 'payment_confirmation',
            amount,
            coverage_months: months,
            period_label: periodLabel
          }
        : item
    ),
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.trainer_id,
        message: `${userName(payment.member_id)}: предоплата ${months} мес., ${formatMoney(amount)}.`,
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}

export function requestLocalPaymentDelay({
  workspace,
  payment,
  requestedDate,
  comment,
  now,
  createId,
  userName
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  requestedDate: string;
  comment: string;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
}): LocalWorkspace {
  const trimmedComment = comment.trim();

  return {
    ...workspace,
    payments: workspace.payments.map((item) =>
      item.id === payment.id
        ? {
            ...item,
            status: 'delay_requested',
            delay_requested_date: requestedDate,
            delay_comment: trimmedComment || null,
            delay_status: 'pending',
            delay_requested_at: now,
            delay_decided_at: null,
            delay_decided_by: null
          }
        : item
    ),
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.trainer_id,
        message: `${userName(payment.member_id)} запрашивает отсрочку до ${requestedDate}${trimmedComment ? `: ${trimmedComment}` : '.'}`,
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}

export function decideLocalPaymentDelay({
  workspace,
  payment,
  approved,
  actorId,
  now,
  createId,
  statusForDueDate,
  periodLabel
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  approved: boolean;
  actorId: string;
  now: string;
  createId: () => string;
  statusForDueDate: (dueDate: string) => Extract<PaymentRequestStatus, 'active' | 'overdue' | 'delayed'>;
  periodLabel: (date: string) => string;
}): LocalWorkspace {
  const nextDueDate =
    approved && payment.delay_requested_date ? payment.delay_requested_date : payment.due_date;
  const nextStatus = approved ? statusForDueDate(nextDueDate) : statusForDueDate(payment.due_date);

  return {
    ...workspace,
    payments: workspace.payments.map((item) =>
      item.id === payment.id
        ? {
            ...item,
            due_date: nextDueDate,
            period_label: periodLabel(nextDueDate),
            status: nextStatus,
            delay_status: approved ? 'approved' : 'rejected',
            delay_decided_at: now,
            delay_decided_by: actorId
          }
        : item
    ),
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.member_id,
        message: approved
          ? `Отсрочка одобрена. Новый срок оплаты: ${nextDueDate}.`
          : 'Запрос отсрочки отклонён.',
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}

export function decideLocalPaymentStatus({
  workspace,
  payment,
  resolvedStatus,
  nextPayment,
  shouldAdvance,
  notificationMessage,
  now,
  createId
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  resolvedStatus: PaymentRequestStatus;
  nextPayment: PaymentRequest | null;
  shouldAdvance: boolean;
  notificationMessage: string | null;
  now: string;
  createId: () => string;
}): LocalWorkspace {
  return {
    ...workspace,
    payments: [
      ...workspace.payments.map((item) =>
        item.id === payment.id
          ? {
              ...item,
              status: resolvedStatus,
              paid_at: resolvedStatus === 'paid' ? now : item.paid_at,
              is_current: shouldAdvance ? false : item.is_current
            }
          : item
      ),
      ...(nextPayment ? [nextPayment] : [])
    ],
    notifications:
      notificationMessage
        ? [
            ...workspace.notifications,
            {
              id: createId(),
              userId: payment.member_id,
              message: notificationMessage,
              createdAt: now,
              read: false,
              paymentId: payment.id
            }
          ]
        : workspace.notifications
  };
}
