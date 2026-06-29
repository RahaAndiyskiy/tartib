import type {
  LocalBillingPlan,
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest
} from '@shared/types/domain';
import { hasRole } from '@/core/roles';

export type PaymentView = 'actions' | 'all' | 'overdue' | 'paid';

export type PaymentActionGroupId =
  | 'confirmations'
  | 'delays'
  | 'overdue'
  | 'without-payment';

export type PaymentActionGroup = {
  id: PaymentActionGroupId;
  title: string;
  description: string;
  members: AppUser[];
};

export type PaymentTask = {
  id: 'confirmations' | 'delays' | 'overdue';
  count: number;
  label: string;
};

export type PaymentEditLike = {
  type: BillingPlanType;
  trainingFormat: 'group' | 'individual';
  individualTerms: boolean;
  currentAmount: string;
  dueDate: string;
  updateFuture: boolean;
};

export type DelayDraftLike = {
  requestedDate: string;
  comment: string;
};

export function paymentEditForMember<T extends PaymentEditLike>({
  edits,
  memberId,
  payment,
  plan,
  fallback
}: {
  edits: Record<string, T>;
  memberId: string;
  payment?: PaymentRequest;
  plan?: LocalBillingPlan;
  fallback: T;
}): T {
  return edits[memberId] ?? {
    ...fallback,
    type: plan?.type ?? fallback.type,
    trainingFormat: plan?.trainingFormat ?? fallback.trainingFormat,
    individualTerms: plan?.source === 'individual',
    currentAmount: String(payment?.amount ?? plan?.baseAmount ?? ''),
    dueDate: payment?.due_date ?? fallback.dueDate
  };
}

export function mergePaymentEdit<T extends PaymentEditLike>({
  edits,
  memberId,
  currentEdit,
  patch
}: {
  edits: Record<string, T>;
  memberId: string;
  currentEdit: T;
  patch: Partial<T>;
}): Record<string, T> {
  return {
    ...edits,
    [memberId]: {
      ...currentEdit,
      ...patch
    }
  };
}

export function removePaymentEdit<T extends PaymentEditLike>(
  edits: Record<string, T>,
  memberId: string
): Record<string, T> {
  const next = { ...edits };
  delete next[memberId];
  return next;
}

export function delayDraftForPayment<T extends DelayDraftLike>({
  drafts,
  payment
}: {
  drafts: Record<string, T>;
  payment: PaymentRequest;
}): T {
  return (
    drafts[payment.id] ?? {
      requestedDate: payment.delay_requested_date ?? '',
      comment: payment.delay_comment ?? ''
    }
  ) as T;
}

export function mergeDelayDraft<T extends DelayDraftLike>({
  drafts,
  paymentId,
  currentDraft,
  patch
}: {
  drafts: Record<string, T>;
  paymentId: string;
  currentDraft: T;
  patch: Partial<T>;
}): Record<string, T> {
  return {
    ...drafts,
    [paymentId]: {
      ...currentDraft,
      ...patch
    }
  };
}

export function prepaymentMonthsForPayment(monthsByPaymentId: Record<string, number>, paymentId: string): number {
  return monthsByPaymentId[paymentId] ?? 1;
}

export function selectVisiblePayments(
  workspace: LocalWorkspace | null,
  activeUser: AppUser | null
): PaymentRequest[] {
  if (!workspace || !activeUser) return [];
  if (hasRole(activeUser, 'owner')) return workspace.payments;
  if (hasRole(activeUser, 'trainer')) {
    return workspace.payments.filter((payment) => payment.trainer_id === activeUser.id);
  }

  return workspace.payments.filter((payment) => payment.member_id === activeUser.id);
}

export function mapCurrentPaymentsByMemberId(
  payments: PaymentRequest[]
): Map<string, PaymentRequest> {
  return new Map(
    payments
      .filter((payment) => payment.is_current !== false)
      .map((payment) => [payment.member_id, payment])
  );
}

export function mapActivePlansByMemberId(
  plans: LocalBillingPlan[]
): Map<string, LocalBillingPlan> {
  return new Map(plans.filter((plan) => plan.active).map((plan) => [plan.memberId, plan]));
}

export function selectCurrentPayments(payments: PaymentRequest[]): PaymentRequest[] {
  return payments.filter((payment) => payment.is_current !== false);
}

export type PaymentOverview = {
  currentPayments: PaymentRequest[];
  paidAmount: number;
  confirmationPayments: PaymentRequest[];
  delayRequestedPayments: PaymentRequest[];
  overduePayments: PaymentRequest[];
  delayedPayments: PaymentRequest[];
  paymentAttentionCount: number;
  membersWithoutPaymentCount: number;
  paymentActionCount: number;
};

export function buildPaymentOverview({
  visiblePayments,
  visibleMembers,
  currentPaymentByMemberId
}: {
  visiblePayments: PaymentRequest[];
  visibleMembers: AppUser[];
  currentPaymentByMemberId: Map<string, PaymentRequest>;
}): PaymentOverview {
  const currentPayments = selectCurrentPayments(visiblePayments);
  const paidAmount = visiblePayments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const confirmationPayments = currentPayments.filter(
    (payment) => payment.status === 'payment_confirmation'
  );
  const delayRequestedPayments = currentPayments.filter(
    (payment) => payment.status === 'delay_requested'
  );
  const overduePayments = currentPayments.filter((payment) => payment.status === 'overdue');
  const delayedPayments = currentPayments.filter((payment) => payment.status === 'delayed');
  const paymentAttentionCount = confirmationPayments.length + delayRequestedPayments.length;
  const membersWithoutPaymentCount = visibleMembers.filter(
    (member) => !currentPaymentByMemberId.has(member.id)
  ).length;

  return {
    currentPayments,
    paidAmount,
    confirmationPayments,
    delayRequestedPayments,
    overduePayments,
    delayedPayments,
    paymentAttentionCount,
    membersWithoutPaymentCount,
    paymentActionCount: paymentAttentionCount + overduePayments.length + membersWithoutPaymentCount
  };
}

export type PaymentRegistry = {
  normalizedSearch: string;
  filteredMembers: AppUser[];
  actionGroups: PaymentActionGroup[];
  visibleActionGroups: PaymentActionGroup[];
  paidResults: PaymentRequest[];
};

export function buildPaymentRegistry({
  visiblePayments,
  visibleMembers,
  currentPaymentByMemberId,
  paymentView,
  paymentSearch,
  userName
}: {
  visiblePayments: PaymentRequest[];
  visibleMembers: AppUser[];
  currentPaymentByMemberId: Map<string, PaymentRequest>;
  paymentView: PaymentView;
  paymentSearch: string;
  userName: (userId: string) => string;
}): PaymentRegistry {
  const normalizedSearch = paymentSearch.trim().toLocaleLowerCase('ru-RU');
  const memberMatchesSearch = (member: AppUser): boolean =>
    !normalizedSearch ||
    userName(member.id).toLocaleLowerCase('ru-RU').includes(normalizedSearch);
  const filteredMembers = visibleMembers.filter((member) => {
    const payment = currentPaymentByMemberId.get(member.id);

    if (!memberMatchesSearch(member)) return false;
    if (paymentView === 'actions') {
      return (
        !payment ||
        payment.status === 'payment_confirmation' ||
        payment.status === 'delay_requested' ||
        payment.status === 'overdue'
      );
    }
    if (paymentView === 'overdue') return payment?.status === 'overdue';
    return true;
  });
  const actionGroups: PaymentActionGroup[] = [
    {
      id: 'confirmations',
      title: 'Ожидают подтверждения',
      description: 'Ученики нажали «Я оплатил» или отправили предоплату.',
      members: visibleMembers.filter(
        (member) =>
          memberMatchesSearch(member) &&
          currentPaymentByMemberId.get(member.id)?.status === 'payment_confirmation'
      )
    },
    {
      id: 'delays',
      title: 'Запросили отсрочку',
      description: 'Нужно одобрить или отклонить новую дату.',
      members: visibleMembers.filter(
        (member) =>
          memberMatchesSearch(member) &&
          currentPaymentByMemberId.get(member.id)?.status === 'delay_requested'
      )
    },
    {
      id: 'overdue',
      title: 'Просрочено',
      description: 'Счёт уже должен быть оплачен.',
      members: visibleMembers.filter(
        (member) =>
          memberMatchesSearch(member) &&
          currentPaymentByMemberId.get(member.id)?.status === 'overdue'
      )
    },
    {
      id: 'without-payment',
      title: 'Без оплаты',
      description: 'Ученикам ещё не назначен текущий счёт.',
      members: visibleMembers.filter(
        (member) => memberMatchesSearch(member) && !currentPaymentByMemberId.has(member.id)
      )
    }
  ];

  return {
    normalizedSearch,
    filteredMembers,
    actionGroups,
    visibleActionGroups: actionGroups.filter((group) => group.members.length > 0),
    paidResults: [...visiblePayments]
      .filter(
        (payment) =>
          payment.status === 'paid' &&
          userName(payment.member_id).toLocaleLowerCase('ru-RU').includes(normalizedSearch)
      )
      .reverse()
  };
}

export type SelectedPaymentDetails = {
  member: AppUser | null;
  payment: PaymentRequest | undefined;
  plan: LocalBillingPlan | undefined;
  group: LocalTrainingGroup | null;
  trainer: AppUser | null;
  history: PaymentRequest[];
  historyOpen: boolean;
};

export function buildSelectedPaymentDetails({
  selectedMemberId,
  visibleMembers,
  visiblePayments,
  currentPaymentByMemberId,
  activePlanByMemberId,
  usersById,
  historyOpenByMember,
  groupForMember
}: {
  selectedMemberId: string;
  visibleMembers: AppUser[];
  visiblePayments: PaymentRequest[];
  currentPaymentByMemberId: Map<string, PaymentRequest>;
  activePlanByMemberId: Map<string, LocalBillingPlan>;
  usersById: Map<string, AppUser>;
  historyOpenByMember: Record<string, boolean>;
  groupForMember: (memberId: string) => LocalTrainingGroup | null;
}): SelectedPaymentDetails {
  const member = visibleMembers.find((item) => item.id === selectedMemberId) ?? null;
  const payment = member ? currentPaymentByMemberId.get(member.id) : undefined;
  const plan = member ? activePlanByMemberId.get(member.id) : undefined;
  const trainer = payment
    ? usersById.get(payment.trainer_id) ?? null
    : plan
      ? usersById.get(plan.trainerId) ?? null
      : null;

  return {
    member,
    payment,
    plan,
    group: member ? groupForMember(member.id) : null,
    trainer,
    history: member
      ? visiblePayments
          .filter((item) => item.member_id === member.id && item.status === 'paid')
          .reverse()
      : [],
    historyOpen: member ? historyOpenByMember[member.id] ?? false : false
  };
}

export type MemberPaymentDetails = {
  payment: PaymentRequest | null;
  plan: LocalBillingPlan | null;
  history: PaymentRequest[];
  historyOpen: boolean;
};

export function buildMemberPaymentDetails({
  activeUser,
  currentPayments,
  visiblePayments,
  activePlanByMemberId,
  historyOpenByMember
}: {
  activeUser: AppUser | null;
  currentPayments: PaymentRequest[];
  visiblePayments: PaymentRequest[];
  activePlanByMemberId: Map<string, LocalBillingPlan>;
  historyOpenByMember: Record<string, boolean>;
}): MemberPaymentDetails {
  if (activeUser?.role !== 'member') {
    return {
      payment: null,
      plan: null,
      history: [],
      historyOpen: false
    };
  }

  return {
    payment: currentPayments.find((payment) => payment.member_id === activeUser.id) ?? null,
    plan: activePlanByMemberId.get(activeUser.id) ?? null,
    history: visiblePayments
      .filter((payment) => payment.member_id === activeUser.id && payment.status === 'paid')
      .reverse(),
    historyOpen: historyOpenByMember[activeUser.id] ?? false
  };
}

export function buildPaymentTasks({
  confirmationPayments,
  delayRequestedPayments,
  overduePayments
}: {
  confirmationPayments: PaymentRequest[];
  delayRequestedPayments: PaymentRequest[];
  overduePayments: PaymentRequest[];
}): PaymentTask[] {
  const tasks: PaymentTask[] = [
    {
      id: 'confirmations',
      count: confirmationPayments.length,
      label: confirmationPayments.length === 1 ? 'оплата ждёт подтверждения' : 'оплаты ждут подтверждения'
    },
    {
      id: 'delays',
      count: delayRequestedPayments.length,
      label: delayRequestedPayments.length === 1 ? 'запрос отсрочки' : 'запроса отсрочки'
    },
    {
      id: 'overdue',
      count: overduePayments.length,
      label: overduePayments.length === 1 ? 'просроченный счёт' : 'просроченных счёта'
    }
  ];

  return tasks.filter((task) => task.count > 0);
}

export function paymentTaskHeadline(taskCount: number): string {
  if (taskCount === 1) return '1 задача требует внимания';
  if (taskCount > 1 && taskCount < 5) return `${taskCount} задачи требуют внимания`;
  return `${taskCount} задач требуют внимания`;
}
