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

type SetWorkspace = (updater: (current: LocalWorkspace | null) => LocalWorkspace | null) => void;

export type RemoteSavePaymentResult = {
  payment: PaymentRequest;
  billingPlan: LocalBillingPlan;
};

export async function deleteMemberPaymentAction({
  workspace,
  payment,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  clearPaymentEdit,
  confirmDelete,
  now,
  createId
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  clearPaymentEdit: (memberId: string) => void;
  confirmDelete: (message: string) => boolean;
  now: string;
  createId: () => string;
}): Promise<void> {
  if (!workspace || payment.status === 'paid') return;
  const confirmed = confirmDelete(
    `Удалить счёт на ${formatMoney(payment.amount)}? Ученик увидит, что счёт отменён.`
  );
  if (!confirmed) return;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentDeletionResult>(
      { action: 'delete_payment', paymentId: payment.id },
      `delete-payment:${payment.id}`
    );
    if (data?.deletedPaymentId) {
      setWorkspace((current) =>
        current ? applyRemotePaymentDeletion(current, data, activeUserId) : current
      );
      clearPaymentEdit(payment.member_id);
      setMessage('Счёт удалён. Ученику отправлено уведомление.');
    }
    return;
  }

  saveWorkspace(deleteLocalPayment({ workspace, payment, now, createId }));
  clearPaymentEdit(payment.member_id);
  setMessage('Счёт удалён. Ученику отправлено уведомление.');
}

export async function decidePaymentStatusAction({
  workspace,
  payment,
  status,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  clearPaymentEdit,
  now,
  createId,
  statusAfterRejectedAction,
  addMonthsDate,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  status: PaymentRequestStatus;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  clearPaymentEdit: (memberId: string) => void;
  now: string;
  createId: () => string;
  statusAfterRejectedAction: (payment: PaymentRequest) => PaymentRequestStatus;
  addMonthsDate: (date: string, billingDay: number | null, monthCount: number) => string;
  periodLabel: (date: string) => string;
}): Promise<void> {
  if (!workspace || !payment) return;

  if (!isLocalMode) {
    const isDirectConfirmation = status === 'paid' && payment.status !== 'payment_confirmation';
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      isDirectConfirmation
        ? {
            action: 'mark_payment_paid',
            paymentId: payment.id
          }
        : {
            action: 'decide_payment',
            paymentId: payment.id,
            approved: status === 'paid'
          },
      `decide-payment:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage(status === 'paid' ? 'Оплата подтверждена.' : 'Подтверждение отклонено.');
    }
    return;
  }

  const plan = workspace.billingPlans.find((item) => item.id === payment.plan_id);
  const resolvedStatus =
    status === 'active' && payment.status === 'payment_confirmation'
      ? statusAfterRejectedAction(payment)
      : status;
  const notificationMessage =
    resolvedStatus === 'paid'
      ? 'Ваша оплата подтверждена ответственным лицом.'
      : status === 'active' && payment.status === 'payment_confirmation'
        ? 'Подтверждение оплаты отклонено. Проверьте оплату и отправьте подтверждение повторно.'
        : null;
  const activeRecurringPlan =
    resolvedStatus === 'paid' &&
    payment.is_current !== false &&
    plan?.active &&
    plan.type !== 'one_time'
      ? plan
      : null;

  // Новый текущий счёт создаётся только после подтверждённой оплаты по активному абонементу.
  // Разовые оплаты завершаются без автоматического продолжения периода.
  const shouldAdvance = Boolean(activeRecurringPlan);
  const nextDueDate = activeRecurringPlan
    ? addMonthsDate(payment.due_date, activeRecurringPlan.billingDay, payment.coverage_months ?? 1)
    : null;
  const nextAmount = Number(activeRecurringPlan?.baseAmount ?? 0);
  const nextPayment: PaymentRequest | null =
    activeRecurringPlan && nextDueDate
      ? {
          id: createId(),
          organization_id: payment.organization_id,
          member_id: payment.member_id,
          trainer_id: payment.trainer_id,
          amount: nextAmount,
          due_date: nextDueDate,
          status: 'active',
          created_at: now,
          plan_id: activeRecurringPlan.id,
          period_label: periodLabel(nextDueDate),
          is_current: true,
          coverage_months: 1,
          paid_at: null
        }
      : null;

  saveWorkspace(
    decideLocalPaymentStatus({
      workspace,
      payment,
      resolvedStatus,
      nextPayment,
      shouldAdvance,
      notificationMessage,
      now,
      createId
    })
  );
  clearPaymentEdit(payment.member_id);
}

export async function requestMonthSkipAction({
  workspace,
  payment,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  now,
  createId,
  userName
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
}): Promise<void> {
  if (!workspace || !payment || !['active', 'overdue', 'delayed'].includes(payment.status)) return;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      { action: 'request_month_skip', paymentId: payment.id },
      `request-month-skip:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage('Запрос пропуска месяца отправлен.');
    }
    return;
  }

  saveWorkspace(requestLocalMonthSkip({ workspace, payment, now, createId, userName }));
  setMessage('Запрос пропуска месяца отправлен.');
}

export async function decideMonthSkipAction({
  workspace,
  payment,
  approved,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  now,
  createId,
  addMonthsDate,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  approved: boolean;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  now: string;
  createId: () => string;
  addMonthsDate: (date: string, billingDay: number | null, monthCount: number) => string;
  periodLabel: (date: string) => string;
}): Promise<void> {
  if (!workspace || !payment) return;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      { action: 'decide_month_skip', paymentId: payment.id, approved },
      `decide-month-skip:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage(approved ? 'Месяц отмечен как пропущенный.' : 'Пропуск месяца отклонён.');
    }
    return;
  }

  saveWorkspace(
    approved
      ? skipLocalMonthAndAdvance({ workspace, payment, now, createId, addMonthsDate, periodLabel })
      : rejectLocalMonthSkip({ workspace, payment, now, createId })
  );
  setMessage(approved ? 'Месяц отмечен как пропущенный.' : 'Пропуск месяца отклонён.');
}

export async function markMonthSkippedAction({
  workspace,
  payment,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  now,
  createId,
  addMonthsDate,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  now: string;
  createId: () => string;
  addMonthsDate: (date: string, billingDay: number | null, monthCount: number) => string;
  periodLabel: (date: string) => string;
}): Promise<void> {
  if (!workspace || !payment || !['active', 'overdue', 'delayed', 'skip_requested'].includes(payment.status)) return;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      { action: 'mark_month_skipped', paymentId: payment.id },
      `mark-month-skipped:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage('Месяц отмечен как пропущенный.');
    }
    return;
  }

  saveWorkspace(skipLocalMonthAndAdvance({ workspace, payment, now, createId, addMonthsDate, periodLabel }));
  setMessage('Месяц отмечен как пропущенный.');
}

export async function requestPaymentDelayAction({
  workspace,
  payment,
  requestedDate,
  comment,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  now,
  createId,
  userName,
  isInvalidRequestedDate
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  requestedDate: string;
  comment: string;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
  isInvalidRequestedDate: (requestedDate: string, dueDate: string) => boolean;
}): Promise<void> {
  if (!workspace || !payment) return;

  if (isInvalidRequestedDate(requestedDate, payment.due_date)) {
    setMessage('Выберите новую дату позже текущего срока оплаты.');
    return;
  }

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      {
        action: 'request_delay',
        paymentId: payment.id,
        requestedDate,
        comment
      },
      `request-delay:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage('Запрос отсрочки отправлен.');
    }
    return;
  }

  saveWorkspace(
    requestLocalPaymentDelay({
      workspace,
      payment,
      requestedDate,
      comment,
      now,
      createId,
      userName
    })
  );
  setMessage('Запрос отсрочки отправлен.');
}

export async function decidePaymentDelayAction({
  workspace,
  payment,
  approved,
  actorId,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  now,
  createId,
  statusForDueDate,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  approved: boolean;
  actorId: string;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  now: string;
  createId: () => string;
  statusForDueDate: (dueDate: string) => Extract<PaymentRequestStatus, 'active' | 'overdue' | 'delayed'>;
  periodLabel: (date: string) => string;
}): Promise<void> {
  if (!workspace || !payment || payment.status !== 'delay_requested') return;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      {
        action: 'decide_delay',
        paymentId: payment.id,
        approved
      },
      `decide-delay:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage(approved ? 'Отсрочка одобрена.' : 'Отсрочка отклонена.');
    }
    return;
  }

  saveWorkspace(
    decideLocalPaymentDelay({
      workspace,
      payment,
      approved,
      actorId,
      now,
      createId,
      statusForDueDate,
      periodLabel
    })
  );
  setMessage(approved ? 'Отсрочка одобрена.' : 'Отсрочка отклонена.');
}

export async function submitPaymentConfirmationAction({
  workspace,
  payment,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  canSubmitPayment,
  now,
  createId,
  userName
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  canSubmitPayment: (payment: PaymentRequest) => boolean;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
}): Promise<void> {
  if (!workspace || !payment) return;

  if (!canSubmitPayment(payment)) {
    setMessage('Счёт ещё не наступил. Предоплату нужно оформить отдельным сценарием.');
    return;
  }

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      { action: 'submit_payment', paymentId: payment.id },
      `submit-payment:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage('Подтверждение отправлено ответственному лицу.');
    }
    return;
  }

  saveWorkspace(submitLocalPaymentConfirmation({ workspace, payment, now, createId, userName }));
  setMessage('Подтверждение отправлено ответственному лицу.');
}

export async function submitPrepaymentAction({
  workspace,
  payment,
  plan,
  months,
  isLocalMode,
  activeUserId,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage,
  now,
  createId,
  userName,
  prepaymentPeriodLabel
}: {
  workspace: LocalWorkspace | null;
  payment: PaymentRequest | undefined;
  plan: LocalBillingPlan | undefined;
  months: number;
  isLocalMode: boolean;
  activeUserId: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
  now: string;
  createId: () => string;
  userName: (userId: string) => string;
  prepaymentPeriodLabel: (date: string, months: number) => string;
}): Promise<void> {
  if (!workspace || !payment || !plan) return;

  const normalizedMonths = Math.max(1, Math.min(12, Math.trunc(months)));
  const amount = Number(plan.baseAmount) * normalizedMonths;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
      { action: 'submit_prepayment', paymentId: payment.id, months: normalizedMonths },
      `submit-prepayment:${payment.id}`
    );
    if (data?.payment) {
      setWorkspace((current) =>
        current ? applyRemotePaymentMutation(current, data, activeUserId) : current
      );
      setMessage('Предоплата отправлена тренеру на подтверждение.');
    }
    return;
  }

  saveWorkspace(
    submitLocalPrepayment({
      workspace,
      payment,
      months: normalizedMonths,
      amount,
      periodLabel: prepaymentPeriodLabel(payment.due_date, normalizedMonths),
      now,
      createId,
      userName
    })
  );
  setMessage('Предоплата отправлена тренеру на подтверждение.');
}

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
    // Индивидуальный тариф отделяется от цены группы и больше не синхронизируется с ней.
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
  // Изменение только текущего счёта не должно незаметно менять будущую стоимость абонемента.
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
  // Групповая цена применяется только к ученикам без индивидуальных условий.
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
  const lockedStatuses: PaymentRequestStatus[] = [
    'payment_confirmation',
    'delay_requested',
    'skip_requested',
    'paid',
    'skipped'
  ];
  const payments = [
    ...workspace.payments.map((payment) => {
      const plan = currentPlanByMemberId.get(payment.member_id);
      if (!payment.is_current || !memberIdSet.has(payment.member_id) || !plan) return payment;
      if (plan.source === 'individual') return payment;
      // Счёт с начатым процессом оплаты или отсрочки нельзя сбрасывать групповым обновлением.
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

export function requestLocalMonthSkip({
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
      item.id === payment.id ? { ...item, status: 'skip_requested' } : item
    ),
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.trainer_id,
        message: `${userName(payment.member_id)} не будет ходить в ${payment.period_label ?? payment.due_date}.`,
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}

export function rejectLocalMonthSkip({
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
  const nextStatus: PaymentRequestStatus =
    new Date(`${payment.due_date}T12:00:00`).getTime() < new Date(now).setHours(12, 0, 0, 0)
      ? 'overdue'
      : 'active';

  return {
    ...workspace,
    payments: workspace.payments.map((item) =>
      item.id === payment.id ? { ...item, status: nextStatus } : item
    ),
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.member_id,
        message: 'Пропуск месяца не подтверждён. Счёт остаётся активным.',
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}

export function skipLocalMonthAndAdvance({
  workspace,
  payment,
  now,
  createId,
  addMonthsDate,
  periodLabel
}: {
  workspace: LocalWorkspace;
  payment: PaymentRequest;
  now: string;
  createId: () => string;
  addMonthsDate: (date: string, billingDay: number | null, monthCount: number) => string;
  periodLabel: (date: string) => string;
}): LocalWorkspace {
  const plan = workspace.billingPlans.find((item) => item.id === payment.plan_id);
  const shouldAdvance = Boolean(plan?.active && plan.type === 'monthly' && payment.is_current !== false);
  const nextDueDate = shouldAdvance && plan
    ? addMonthsDate(payment.due_date, plan.billingDay, 1)
    : null;
  const nextPayment: PaymentRequest | null = shouldAdvance && plan && nextDueDate
    ? {
        id: createId(),
        organization_id: payment.organization_id,
        member_id: payment.member_id,
        trainer_id: payment.trainer_id,
        amount: Number(plan.baseAmount),
        due_date: nextDueDate,
        status: 'active',
        created_at: now,
        plan_id: plan.id,
        period_label: periodLabel(nextDueDate),
        is_current: true,
        coverage_months: 1,
        paid_at: null
      }
    : null;

  return {
    ...workspace,
    payments: [
      ...workspace.payments.map((item) =>
        item.id === payment.id
          ? { ...item, status: 'skipped' as PaymentRequestStatus, is_current: false }
          : item
      ),
      ...(nextPayment ? [nextPayment] : [])
    ],
    notifications: [
      ...workspace.notifications,
      {
        id: createId(),
        userId: payment.member_id,
        message: `Месяц ${payment.period_label ?? payment.due_date} отмечен как пропущенный.`,
        createdAt: now,
        read: false,
        paymentId: payment.id
      }
    ]
  };
}
