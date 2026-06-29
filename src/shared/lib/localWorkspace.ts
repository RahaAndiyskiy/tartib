import type {
  AppUser,
  BillingPlanSource,
  BillingPlanType,
  Organization,
  PaymentRequest,
  TrainingFormat,
  TrainerMember
} from '@shared/types/domain';
import { formatMoney } from '@shared/constants/app';

export type LocalWorkspace = {
  version: 5;
  organization: Organization;
  users: AppUser[];
  assignments: TrainerMember[];
  billingPlans: LocalBillingPlan[];
  payments: PaymentRequest[];
  expenses: LocalExpense[];
  groups: LocalTrainingGroup[];
  groupMembers: LocalGroupMember[];
  schedules: LocalTrainingSchedule[];
  notifications: LocalNotification[];
};

export type LocalBillingPlan = {
  id: string;
  memberId: string;
  trainerId: string;
  type: BillingPlanType;
  trainingFormat: TrainingFormat;
  source: BillingPlanSource;
  baseAmount: number;
  billingDay: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalExpense = {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  type: 'recurring' | 'one_time';
  status: 'pending' | 'paid';
  periodLabel: string;
  isCurrent: boolean;
  paidAt: string | null;
  createdAt: string;
};

export type LocalTrainingSchedule = {
  id: string;
  memberId: string;
  trainerId: string;
  days: string;
  time: string;
  note: string;
  updatedAt: string;
};

export type LocalTrainingGroup = {
  id: string;
  trainerId: string;
  activity: string;
  days: string;
  time: string;
  note: string;
  defaultAmount?: number | null;
  defaultBillingDay?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalGroupMember = {
  id: string;
  groupId: string;
  memberId: string;
  createdAt: string;
};

export type LocalNotification = {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  read: boolean;
  eventKey?: string;
  paymentId?: string;
};

const WORKSPACE_KEY = 'tartib.local.workspace';
const ACTIVE_USER_KEY = 'tartib.local.active-user';

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyWorkspace(): LocalWorkspace {
  const organizationId = createId();
  const ownerId = createId();
  const now = new Date().toISOString();

  return {
    version: 5,
    organization: {
      id: organizationId,
      name: 'Тестовый клуб Tartib',
      created_at: now
    },
    users: [
      {
        id: ownerId,
        auth_user_id: null,
        organization_id: organizationId,
        role: 'owner',
        roles: ['owner', 'trainer'],
        first_name: 'Владелец',
        last_name: 'клуба',
        phone: null,
        email: null,
        created_at: now
      }
    ],
    assignments: [],
    billingPlans: [],
    payments: [],
    expenses: [],
    groups: [],
    groupMembers: [],
    schedules: [],
    notifications: []
  };
}

export function readWorkspace(): LocalWorkspace {
  const saved = window.localStorage.getItem(WORKSPACE_KEY);

  if (!saved) {
    const initial = createEmptyWorkspace();
    writeWorkspace(initial);
    return initial;
  }

  try {
    const workspace = JSON.parse(saved) as LocalWorkspace;
    const migratedWorkspace: LocalWorkspace = {
      ...workspace,
      version: 5,
      users: (workspace.users ?? []).map((user) => ({
        ...user,
        roles: user.roles ?? (user.role === 'owner' ? ['owner', 'trainer'] : [user.role])
      })),
      billingPlans: (workspace.billingPlans ?? []).map((plan) => ({
        ...plan,
        type: (plan.type as string) === 'per_lesson' ? 'monthly' : plan.type,
        source: plan.source ?? 'individual',
        trainingFormat:
          plan.trainingFormat ??
          ((plan.type as string) === 'per_lesson' ? 'individual' : 'group')
      })),
      payments: (workspace.payments ?? []).map((payment) => ({
        ...payment,
        status:
          (payment.status as string) === 'pending'
            ? 'active'
            : (payment.status as string) === 'paid_confirmation'
              ? 'payment_confirmation'
              : payment.status,
        is_current: payment.is_current ?? true,
        coverage_months: payment.coverage_months ?? 1,
        paid_at: payment.paid_at ?? null,
        delay_requested_date: payment.delay_requested_date ?? null,
        delay_comment: payment.delay_comment ?? null,
        delay_status: payment.delay_status ?? null,
        delay_requested_at: payment.delay_requested_at ?? null,
        delay_decided_at: payment.delay_decided_at ?? null,
        delay_decided_by: payment.delay_decided_by ?? null
      })),
      expenses: workspace.expenses ?? [],
      groups: workspace.groups ?? [],
      groupMembers: workspace.groupMembers ?? [],
      schedules: workspace.schedules ?? [],
      notifications: workspace.notifications ?? []
    };
    const reconciledWorkspace = reconcileWorkspace(migratedWorkspace);
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(reconciledWorkspace));
    return reconciledWorkspace;
  } catch {
    const initial = createEmptyWorkspace();
    writeWorkspace(initial);
    return initial;
  }
}

function dateValue(date: string): number {
  return new Date(`${date}T12:00:00`).getTime();
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysUntil(date: string, today: string): number {
  return Math.round((dateValue(date) - dateValue(today)) / 86_400_000);
}

export function reconcileWorkspace(
  workspace: LocalWorkspace,
  now: Date = new Date()
): LocalWorkspace {
  const today = localDateString(now);
  const notificationKeys = new Set(
    workspace.notifications.map((notification) => notification.eventKey).filter(Boolean)
  );
  const notifications = [...workspace.notifications];

  const payments = workspace.payments.map((payment) => {
    if (payment.status === 'paid' || payment.status === 'payment_confirmation') {
      return payment;
    }

    if (payment.status === 'delay_requested') {
      return payment;
    }

    const difference = daysUntil(payment.due_date, today);
    const nextStatus: PaymentRequest['status'] =
      payment.delay_status === 'approved' && difference >= 0
        ? 'delayed'
        : difference < 0
          ? 'overdue'
          : 'active';
    const reminderKey =
      difference === 3
        ? `payment:${payment.id}:${payment.due_date}:three-days`
        : difference === 0
          ? `payment:${payment.id}:${payment.due_date}:due-today`
          : difference < 0
            ? `payment:${payment.id}:${payment.due_date}:overdue`
            : null;

    if (payment.is_current !== false && reminderKey && !notificationKeys.has(reminderKey)) {
      const message =
        difference === 3
          ? `Оплата через 3 дня: ${formatMoney(payment.amount)}.`
          : difference === 0
            ? `Сегодня оплата: ${formatMoney(payment.amount)}.`
            : 'Оплата просрочена. Нужна отсрочка?';

      notifications.push({
        id: createId(),
        userId: payment.member_id,
        message,
        createdAt: now.toISOString(),
        read: false,
        eventKey: reminderKey,
        paymentId: payment.id
      });
      notificationKeys.add(reminderKey);
    }

    return nextStatus === payment.status ? payment : { ...payment, status: nextStatus };
  });

  return {
    ...workspace,
    version: 5,
    payments,
    notifications
  };
}

export function writeWorkspace(workspace: LocalWorkspace): void {
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  window.dispatchEvent(new Event('tartib-workspace-change'));
}

export function resetWorkspace(): LocalWorkspace {
  const workspace = createEmptyWorkspace();
  writeWorkspace(workspace);
  window.sessionStorage.removeItem(ACTIVE_USER_KEY);
  return workspace;
}

export function readActiveUserId(): string | null {
  return window.sessionStorage.getItem(ACTIVE_USER_KEY);
}

export function writeActiveUserId(userId: string): void {
  window.sessionStorage.setItem(ACTIVE_USER_KEY, userId);
}

export { createId, WORKSPACE_KEY };
