import { formatMoney } from '@shared/constants/app';
import type {
  LocalBillingPlan,
  LocalNotification,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  BillingPlanSource,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat
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

export type SavePaymentEditLike = {
  type: BillingPlanType;
  trainingFormat: TrainingFormat;
  individualTerms: boolean;
  currentAmount: string;
  dueDate: string;
  updateFuture: boolean;
};

export type SavePaymentValidationResult =
  | { ok: true; amount: number; source: BillingPlanSource }
  | { ok: false; reason: 'missing_trainer' | 'missing_due_date' | 'invalid_amount' };

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

export type RemoteSavePaymentResult = {
  payment: PaymentRequest;
  billingPlan: LocalBillingPlan;
};

export function validateSavePaymentDraft({
  edit,
  trainerId
}: {
  edit: SavePaymentEditLike | undefined;
  trainerId: string | undefined;
}): SavePaymentValidationResult {
  if (!trainerId) return { ok: false, reason: 'missing_trainer' };
  if (!edit?.dueDate) return { ok: false, reason: 'missing_due_date' };

  const amount = Number(edit.currentAmount);
  if (amount <= 0) return { ok: false, reason: 'invalid_amount' };

  return {
    ok: true,
    amount,
    source: edit.individualTerms || edit.type === 'one_time' ? 'individual' : 'group_default'
  };
}

export async function saveRemoteMemberPaymentAction({
  memberId,
  edit,
  amount,
  source,
  runRemoteActionWithPending
}: {
  memberId: string;
  edit: SavePaymentEditLike;
  amount: number;
  source: BillingPlanSource;
  runRemoteActionWithPending: RunRemoteActionWithPending;
}): Promise<RemoteSavePaymentResult | null> {
  return runRemoteActionWithPending<RemoteSavePaymentResult>(
    {
      action: 'save_payment',
      memberId,
      type: edit.type,
      trainingFormat: edit.trainingFormat,
      amount,
      dueDate: edit.dueDate,
      updateFuture: edit.updateFuture,
      source
    },
    `save-payment:${memberId}`
  );
}

export function upsertPayment(workspace: LocalWorkspace, payment: PaymentRequest): LocalWorkspace {
  return {
    ...workspace,
    payments: workspace.payments.some((item) => item.id === payment.id)
      ? workspace.payments.map((item) => (item.id === payment.id ? payment : item))
      : [...workspace.payments, payment]
  };
}

export function saveLocalMemberPayment({
  workspace,
  memberId,
  trainerId,
  edit,
  amount,
  source,
  existingPayment,
  existingPlan,
  now,
  createId,
  periodLabel
}: {
  workspace: LocalWorkspace;
  memberId: string;
  trainerId: string;
  edit: SavePaymentEditLike;
  amount: number;
  source: BillingPlanSource;
  existingPayment: PaymentRequest | undefined;
  existingPlan: LocalBillingPlan | undefined;
  now: string;
  createId: () => string;
  periodLabel: (date: string) => string;
}): { workspace: LocalWorkspace; paymentExisted: boolean } {
  const planId = existingPlan?.id ?? createId();
  const baseAmount = Number(
    edit.individualTerms || edit.updateFuture || !existingPlan
      ? edit.currentAmount
      : existingPlan.baseAmount || edit.currentAmount
  );
  const nextPlan: LocalBillingPlan = {
    id: planId,
    memberId,
    trainerId,
    type: edit.type,
    trainingFormat: edit.trainingFormat,
    source,
    baseAmount,
    billingDay:
      edit.type === 'monthly' ? new Date(`${edit.dueDate}T12:00:00`).getDate() : null,
    active: true,
    createdAt: existingPlan?.createdAt ?? now,
    updatedAt: now
  };
  const shouldUpdatePlan =
    !existingPlan ||
    edit.individualTerms ||
    edit.updateFuture ||
    existingPlan.type !== edit.type ||
    existingPlan.source !== source;
  const nextPayment = existingPayment
    ? {
        ...existingPayment,
        amount,
        due_date: edit.dueDate,
        plan_id: planId,
        period_label: periodLabel(edit.dueDate)
      }
    : {
        id: createId(),
        organization_id: workspace.organization.id,
        member_id: memberId,
        trainer_id: trainerId,
        amount,
        due_date: edit.dueDate,
        status: 'active' as const,
        created_at: now,
        plan_id: planId,
        period_label: periodLabel(edit.dueDate),
        is_current: true,
        coverage_months: 1,
        paid_at: null
      };

  return {
    workspace: {
      ...workspace,
      billingPlans: existingPlan
        ? workspace.billingPlans.map((plan) =>
            plan.id === existingPlan.id
              ? shouldUpdatePlan
                ? nextPlan
                : plan
              : plan
          )
        : [...workspace.billingPlans, nextPlan],
      payments: existingPayment
        ? workspace.payments.map((payment) =>
            payment.id === existingPayment.id ? nextPayment : payment
          )
        : [...workspace.payments, nextPayment]
    },
    paymentExisted: Boolean(existingPayment)
  };
}

export function applyGroupDefaultPaymentToMembers({
  workspace,
  memberIds,
  trainerId,
  amount,
  billingDay,
  dueDate,
  now,
  createId,
  periodLabel,
  statusForDueDate
}: {
  workspace: LocalWorkspace;
  memberIds: string[];
  trainerId: string;
  amount: number;
  billingDay: number;
  dueDate: string;
  now: string;
  createId: () => string;
  periodLabel: (date: string) => string;
  statusForDueDate: (date: string) => Extract<PaymentRequestStatus, 'active' | 'overdue'>;
}): Pick<LocalWorkspace, 'billingPlans' | 'payments'> {
  const memberIdSet = new Set(memberIds);
  const updatedPlans = workspace.billingPlans.map((plan) =>
    memberIdSet.has(plan.memberId) && plan.active && plan.source !== 'individual'
      ? {
          ...plan,
          trainerId,
          type: 'monthly' as const,
          trainingFormat: 'group' as const,
          source: 'group_default' as const,
          baseAmount: amount,
          billingDay,
          updatedAt: now
        }
      : plan
  );
  const planMemberIds = new Set(updatedPlans.filter((plan) => plan.active).map((plan) => plan.memberId));
  const billingPlans = [
    ...updatedPlans,
    ...memberIds
      .filter((memberId) => !planMemberIds.has(memberId))
      .map((memberId) => ({
        id: createId(),
        memberId,
        trainerId,
        type: 'monthly' as const,
        trainingFormat: 'group' as const,
        source: 'group_default' as const,
        baseAmount: amount,
        billingDay,
        active: true,
        createdAt: now,
        updatedAt: now
      }))
  ];
  const currentPlanByMemberId = new Map(
    billingPlans.filter((plan) => plan.active).map((plan) => [plan.memberId, plan])
  );
  const currentPaymentMemberIds = new Set(
    workspace.payments.filter((payment) => payment.is_current).map((payment) => payment.member_id)
  );
  const lockedStatuses: PaymentRequestStatus[] = ['payment_confirmation', 'delay_requested', 'paid'];
  const payments = [
    ...workspace.payments.map((payment) => {
      const plan = currentPlanByMemberId.get(payment.member_id);
      if (!payment.is_current || !memberIdSet.has(payment.member_id) || !plan) return payment;
      if (plan.source === 'individual') return payment;
      if (lockedStatuses.includes(payment.status)) return payment;

      return {
        ...payment,
        trainer_id: trainerId,
        amount,
        due_date: dueDate,
        status: statusForDueDate(dueDate),
        plan_id: plan.id,
        period_label: periodLabel(dueDate),
        coverage_months: 1
      };
    }),
    ...memberIds
      .filter((memberId) => !currentPaymentMemberIds.has(memberId))
      .map((memberId) => {
        const plan = currentPlanByMemberId.get(memberId);
        return {
          id: createId(),
          organization_id: workspace.organization.id,
          member_id: memberId,
          trainer_id: trainerId,
          amount,
          due_date: dueDate,
          status: statusForDueDate(dueDate),
          created_at: now,
          plan_id: plan?.id,
          period_label: periodLabel(dueDate),
          is_current: true,
          coverage_months: 1,
          paid_at: null
        };
      })
  ];

  return { billingPlans, payments };
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
