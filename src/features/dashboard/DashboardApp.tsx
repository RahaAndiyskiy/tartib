'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Share2,
  CalendarDays,
  Layers3,
  Users,
  X
} from 'lucide-react';
import {
  createId,
  reconcileWorkspace,
  readActiveUserId,
  readWorkspace,
  resetWorkspace,
  writeActiveUserId,
  writeWorkspace,
  type LocalBillingPlan,
  type LocalExpense,
  type LocalGroupMember,
  type LocalNotification,
  type LocalTrainingGroup,
  type LocalTrainingSchedule,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import { formatMoney } from '@shared/constants/app';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat,
  TrainerMember
} from '@shared/types/domain';

type PersonDraft = {
  role: 'trainer' | 'member';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  groupId: string;
  paymentType: BillingPlanType;
  trainingFormat: TrainingFormat;
  initialAmount: string;
  initialDueDate: string;
};

type MemberInviteResult = {
  inviteUrl: string;
  expiresAt: string;
  groupName: string;
};

type PaymentEdit = {
  type: BillingPlanType;
  trainingFormat: TrainingFormat;
  currentAmount: string;
  dueDate: string;
  updateFuture: boolean;
};

type ExpenseDraft = {
  name: string;
  amount: string;
  dueDate: string;
  type: 'recurring' | 'one_time';
};

type ScheduleEdit = {
  days: string;
  time: string;
  note: string;
};

type GroupDraft = {
  activity: string;
  days: string;
  time: string;
  note: string;
  trainerId: string;
};

type DelayDraft = {
  requestedDate: string;
  comment: string;
};

type DashboardSection =
  | 'overview'
  | 'people'
  | 'payments'
  | 'groups'
  | 'schedule'
  | 'expenses'
  | 'notifications';

type PaymentView = 'actions' | 'all' | 'overdue' | 'paid';

const emptyPersonDraft: PersonDraft = {
  role: 'trainer',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  username: '',
  password: '',
  groupId: '',
  paymentType: 'monthly',
  trainingFormat: 'group',
  initialAmount: '',
  initialDueDate: ''
};

const emptyExpenseDraft: ExpenseDraft = {
  name: '',
  amount: '',
  dueDate: '',
  type: 'recurring'
};

const emptyGroupDraft: GroupDraft = {
  activity: '',
  days: '',
  time: '',
  note: '',
  trainerId: ''
};

const roleLabels = {
  owner: 'Владелец',
  trainer: 'Тренер',
  member: 'Ученик'
} as const;

const statusLabels: Record<PaymentRequestStatus | 'not-set', string> = {
  active: 'Активна',
  delay_requested: 'Запрошена отсрочка',
  delayed: 'Отсрочена',
  payment_confirmation: 'Ожидает подтверждения',
  paid: 'Оплачено',
  overdue: 'Просрочено',
  'not-set': 'Не назначена'
};

function hasRole(user: AppUser | null, role: AppUser['role']): boolean {
  return Boolean(user && (user.role === role || user.roles?.includes(role)));
}

function roleLabel(user: AppUser): string {
  return hasRole(user, 'owner') && hasRole(user, 'trainer')
    ? 'Владелец + тренер'
    : roleLabels[user.role];
}

function dateAtNoon(date: string): number {
  return new Date(`${date}T12:00:00`).getTime();
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function statusAfterRejectedAction(payment: PaymentRequest): PaymentRequestStatus {
  if (
    payment.delay_status === 'approved' &&
    payment.delay_requested_date &&
    dateAtNoon(payment.delay_requested_date) >= dateAtNoon(todayString())
  ) {
    return 'delayed';
  }

  return dateAtNoon(payment.due_date) < dateAtNoon(todayString()) ? 'overdue' : 'active';
}

const planLabels: Record<BillingPlanType, string> = {
  monthly: 'Абонемент',
  one_time: 'Разовая оплата'
};

const formatLabels: Record<TrainingFormat, string> = {
  group: 'Группа',
  individual: 'Индивидуально'
};

function nextMonthDate(date: string, billingDay: number | null): string {
  return addMonthsDate(date, billingDay, 1);
}

function addMonthsDate(date: string, billingDay: number | null, monthCount: number): string {
  const source = new Date(`${date}T12:00:00`);
  const target = new Date(source.getFullYear(), source.getMonth() + monthCount, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(billingDay ?? source.getDate(), lastDay);

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function periodLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`)
  );
}

function prepaymentPeriodLabel(date: string, months: number): string {
  const start = periodLabel(date);
  if (months <= 1) return `Предоплата: ${start}`;
  const end = periodLabel(addMonthsDate(date, null, months - 1));
  return `Предоплата: ${start} - ${end}`;
}

function formatShortDate(date?: string | null): string {
  if (!date) return '—';
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
}

function isPaymentDue(payment: PaymentRequest): boolean {
  return payment.status === 'overdue' || dateAtNoon(payment.due_date) <= dateAtNoon(todayString());
}

function canSubmitPayment(payment: PaymentRequest): boolean {
  return ['active', 'overdue', 'delayed'].includes(payment.status) && isPaymentDue(payment);
}

function paymentLockedText(payment: PaymentRequest): string | null {
  if (canSubmitPayment(payment) || !['active', 'delayed'].includes(payment.status)) return null;
  return `Счёт откроется ${formatShortDate(payment.due_date)}. Если хотите закрыть его заранее, используйте `;
}

export function DashboardApp(): React.ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [activeUserId, setActiveUserId] = useState('');
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPersonDraft);
  const [paymentEdits, setPaymentEdits] = useState<Record<string, PaymentEdit>>({});
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(emptyExpenseDraft);
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, ScheduleEdit>>({});
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [delayDrafts, setDelayDrafts] = useState<Record<string, DelayDraft>>({});
  const [prepaymentMonths, setPrepaymentMonths] = useState<Record<string, number>>({});
  const [editingGroupId, setEditingGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [memberInvite, setMemberInvite] = useState<MemberInviteResult | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [paymentView, setPaymentView] = useState<PaymentView>('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleGroupFilter, setPeopleGroupFilter] = useState('all');
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({});
  const [selectedPaymentMemberId, setSelectedPaymentMemberId] = useState('');
  const [paymentEditOpen, setPaymentEditOpen] = useState(false);
  const [historyOpenByMember, setHistoryOpenByMember] = useState<Record<string, boolean>>({});
  const [paymentActionGroupsOpen, setPaymentActionGroupsOpen] = useState<Record<string, boolean>>({});

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const toggleGroupDay = (day: string): void => {
    setGroupDraft((current) => {
      const selectedDays = current.days ? current.days.split(', ').filter(Boolean) : [];
      const nextDays = selectedDays.includes(day)
        ? selectedDays.filter((item) => item !== day)
        : [...selectedDays, day];

      return {
        ...current,
        days: nextDays.join(', ')
      };
    });
  };

  useEffect(() => {
    function syncWorkspace(): void {
      const nextWorkspace = readWorkspace();
      const savedActiveUserId = readActiveUserId();
      const nextActiveUser =
        nextWorkspace.users.find((user) => user.id === savedActiveUserId) ??
        nextWorkspace.users.find((user) => user.role === 'owner') ??
        nextWorkspace.users[0];

      setWorkspace(nextWorkspace);

      if (nextActiveUser) {
        setActiveUserId(nextActiveUser.id);
        writeActiveUserId(nextActiveUser.id);
      }
    }

    if (!isLocalMode) {
      void loadRemoteWorkspace();
      const supabase = getSupabaseClient();
      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          window.location.href = '/login';
        }
      });

      return () => listener.subscription.unsubscribe();
    }

    syncWorkspace();
    const reminderTimer = window.setInterval(syncWorkspace, 60_000);
    window.addEventListener('storage', syncWorkspace);
    window.addEventListener('tartib-workspace-change', syncWorkspace);

    return () => {
      window.clearInterval(reminderTimer);
      window.removeEventListener('storage', syncWorkspace);
      window.removeEventListener('tartib-workspace-change', syncWorkspace);
    };
  }, [isLocalMode]);

  const activeUser = useMemo(
    () => workspace?.users.find((user) => user.id === activeUserId) ?? null,
    [activeUserId, workspace]
  );

  const trainers = useMemo(
    () => workspace?.users.filter((user) => hasRole(user, 'trainer')) ?? [],
    [workspace]
  );

  const allMembers = useMemo(
    () => workspace?.users.filter((user) => user.role === 'member') ?? [],
    [workspace]
  );

  const visibleGroups = useMemo(() => {
    if (!workspace || !activeUser) return [];
    if (hasRole(activeUser, 'owner')) return workspace.groups;
    if (hasRole(activeUser, 'trainer')) {
      return workspace.groups.filter((group) => group.trainerId === activeUser.id);
    }

    const groupIds = new Set(
      workspace.groupMembers
        .filter((assignment) => assignment.memberId === activeUser.id)
        .map((assignment) => assignment.groupId)
    );
    return workspace.groups.filter((group) => groupIds.has(group.id));
  }, [activeUser, workspace]);

  const visibleMembers = useMemo(() => {
    if (!workspace || !activeUser) return [];
    if (hasRole(activeUser, 'owner')) return allMembers;
    if (activeUser.role === 'member') return allMembers.filter((member) => member.id === activeUser.id);

    const memberIds = new Set(
      workspace.assignments
        .filter((assignment) => assignment.trainer_id === activeUser.id)
        .map((assignment) => assignment.member_id)
    );

    return allMembers.filter((member) => memberIds.has(member.id));
  }, [activeUser, allMembers, workspace]);

  const visiblePayments = useMemo(() => {
    if (!workspace || !activeUser) return [];
    if (hasRole(activeUser, 'owner')) return workspace.payments;
    if (hasRole(activeUser, 'trainer')) {
      return workspace.payments.filter((payment) => payment.trainer_id === activeUser.id);
    }

    return workspace.payments.filter((payment) => payment.member_id === activeUser.id);
  }, [activeUser, workspace]);

  const usersById = useMemo(() => {
    if (!workspace) return new Map<string, AppUser>();
    return new Map(workspace.users.map((user) => [user.id, user]));
  }, [workspace]);

  const assignmentsByMemberId = useMemo(() => {
    if (!workspace) return new Map<string, TrainerMember>();
    return new Map(workspace.assignments.map((assignment) => [assignment.member_id, assignment]));
  }, [workspace]);

  const groupsById = useMemo(() => {
    if (!workspace) return new Map<string, LocalTrainingGroup>();
    return new Map(workspace.groups.map((group) => [group.id, group]));
  }, [workspace]);

  const groupMembershipByMemberId = useMemo(() => {
    if (!workspace) return new Map<string, LocalGroupMember>();
    return new Map(workspace.groupMembers.map((assignment) => [assignment.memberId, assignment]));
  }, [workspace]);

  const currentPaymentByMemberId = useMemo(() => {
    if (!workspace) return new Map<string, PaymentRequest>();
    return new Map(
      workspace.payments
        .filter((payment) => payment.is_current !== false)
        .map((payment) => [payment.member_id, payment])
    );
  }, [workspace]);

  const activePlanByMemberId = useMemo(() => {
    if (!workspace) return new Map<string, LocalBillingPlan>();
    return new Map(workspace.billingPlans.filter((plan) => plan.active).map((plan) => [plan.memberId, plan]));
  }, [workspace]);

  const isPendingAction = (key: string): boolean => pendingAction === key;
  const buttonLabel = (key: string, defaultLabel: string): string =>
    isPendingAction(key) ? (defaultLabel.toLowerCase().includes('удал') ? 'Удаляем...' : 'Сохраняем...') : defaultLabel;

  const runRemoteActionWithPending = async <T,>(
    payload: Record<string, unknown>,
    pendingKey: string
  ): Promise<T | null> => {
    setPendingAction(pendingKey);
    try {
      return await runRemoteActionData<T>(payload);
    } finally {
      setPendingAction((current) => (current === pendingKey ? null : current));
    }
  };

  const currentPayments = visiblePayments.filter((payment) => payment.is_current !== false);
  const paidAmount = visiblePayments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const currentExpenses = workspace?.expenses.filter((expense) => expense.isCurrent) ?? [];
  const paidExpenses = workspace?.expenses
    .filter((expense) => expense.status === 'paid')
    .reduce((sum, expense) => sum + Number(expense.amount), 0) ?? 0;
  const pendingExpenses = currentExpenses
    .filter((expense) => expense.status === 'pending')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
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
  const paymentActionCount = paymentAttentionCount + overduePayments.length + membersWithoutPaymentCount;
  const normalizedPaymentSearch = paymentSearch.trim().toLocaleLowerCase('ru-RU');
  const memberMatchesPaymentSearch = (member: AppUser): boolean =>
    !normalizedPaymentSearch ||
    userName(member.id).toLocaleLowerCase('ru-RU').includes(normalizedPaymentSearch);
  const filteredPaymentMembers = visibleMembers.filter((member) => {
    const payment = currentPaymentByMemberId.get(member.id);

    if (!memberMatchesPaymentSearch(member)) return false;
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
  const paymentActionGroups = [
    {
      id: 'confirmations',
      title: 'Ожидают подтверждения',
      description: 'Ученики нажали «Я оплатил» или отправили предоплату.',
      members: visibleMembers.filter(
        (member) =>
          memberMatchesPaymentSearch(member) &&
          currentPaymentByMemberId.get(member.id)?.status === 'payment_confirmation'
      )
    },
    {
      id: 'delays',
      title: 'Запросили отсрочку',
      description: 'Нужно одобрить или отклонить новую дату.',
      members: visibleMembers.filter(
        (member) =>
          memberMatchesPaymentSearch(member) &&
          currentPaymentByMemberId.get(member.id)?.status === 'delay_requested'
      )
    },
    {
      id: 'overdue',
      title: 'Просрочено',
      description: 'Счёт уже должен быть оплачен.',
      members: visibleMembers.filter(
        (member) =>
          memberMatchesPaymentSearch(member) &&
          currentPaymentByMemberId.get(member.id)?.status === 'overdue'
      )
    },
    {
      id: 'without-payment',
      title: 'Без оплаты',
      description: 'Ученикам ещё не назначен текущий счёт.',
      members: visibleMembers.filter(
        (member) => memberMatchesPaymentSearch(member) && !currentPaymentByMemberId.has(member.id)
      )
    }
  ];
  const visiblePaymentActionGroups = paymentActionGroups.filter((group) => group.members.length > 0);
  const paidPaymentResults = [...visiblePayments]
    .filter(
      (payment) =>
        payment.status === 'paid' &&
        userName(payment.member_id).toLocaleLowerCase('ru-RU').includes(normalizedPaymentSearch)
    )
    .reverse();
  const selectedPaymentMember =
    visibleMembers.find((member) => member.id === selectedPaymentMemberId) ?? null;
  const selectedPayment = selectedPaymentMember
    ? currentPaymentByMemberId.get(selectedPaymentMember.id)
    : undefined;
  const selectedPaymentPlan = selectedPaymentMember
    ? activePlanByMemberId.get(selectedPaymentMember.id)
    : undefined;
  const selectedPaymentGroup = selectedPaymentMember ? groupFor(selectedPaymentMember.id) : null;
  const selectedPaymentTrainer = selectedPayment
    ? usersById.get(selectedPayment.trainer_id) ?? null
    : selectedPaymentPlan
      ? usersById.get(selectedPaymentPlan.trainerId) ?? null
      : null;
  const selectedPaymentHistory = selectedPaymentMember
    ? visiblePayments
        .filter(
          (payment) =>
            payment.member_id === selectedPaymentMember.id && payment.status === 'paid'
        )
        .reverse()
    : [];
  const selectedPaymentHistoryOpen = selectedPaymentMember
    ? historyOpenByMember[selectedPaymentMember.id] ?? false
    : false;
  const upcomingPayments = currentPayments.filter((payment) => {
    if (!['active', 'delayed'].includes(payment.status)) return false;
    const difference = Math.round(
      (dateAtNoon(payment.due_date) - dateAtNoon(todayString())) / 86_400_000
    );
    return difference >= 0 && difference <= 3;
  });
  const activeMemberPayment =
    activeUser?.role === 'member'
      ? currentPayments.find((payment) => payment.member_id === activeUser.id) ?? null
      : null;
  const activeMemberPlan =
    activeUser?.role === 'member' ? activePlanByMemberId.get(activeUser.id) ?? null : null;
  const activeMemberPaymentHistory =
    activeUser?.role === 'member'
      ? visiblePayments
          .filter((payment) => payment.member_id === activeUser.id && payment.status === 'paid')
          .reverse()
      : [];
  const activeMemberHistoryOpen =
    activeUser?.role === 'member' ? historyOpenByMember[activeUser.id] ?? false : false;
  const activeMemberTrainer =
    activeUser?.role === 'member' ? trainerFor(activeUser.id) : null;
  const activeMemberGroup =
    activeUser?.role === 'member'
      ? visibleGroups[0] ?? null
      : null;
  const activeMemberSchedule =
    activeUser?.role === 'member'
      ? activeMemberGroup
        ? {
            id: activeMemberGroup.id,
            memberId: activeUser.id,
            trainerId: activeMemberGroup.trainerId,
            days: activeMemberGroup.days,
            time: activeMemberGroup.time,
            note: activeMemberGroup.note,
            updatedAt: activeMemberGroup.updatedAt
          }
        : workspace?.schedules.find((schedule) => schedule.memberId === activeUser.id) ?? null
      : null;

  const unreadNotifications = workspace?.notifications.filter(
    (notification) => notification.userId === activeUserId && !notification.read
  ) ?? [];

  function saveWorkspace(nextWorkspace: LocalWorkspace): void {
    const reconciledWorkspace = reconcileWorkspace(nextWorkspace);
    writeWorkspace(reconciledWorkspace);
    setWorkspace(reconciledWorkspace);
  }

  async function loadRemoteWorkspace(): Promise<void> {
    const supabase = getSupabaseClient();
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;

    if (!token) {
      window.location.href = '/login';
      return;
    }

    const start = performance.now();
    const response = await fetch('/api/workspace', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const data = (await response.json()) as {
      workspace?: LocalWorkspace;
      activeUserId?: string;
      error?: string;
    };
    console.info('[performance] client workspace load', `loadRemoteWorkspace ${Math.round(performance.now() - start)}ms`);

    if (!response.ok || !data.workspace || !data.activeUserId) {
      setMessage(data.error ?? 'Не удалось загрузить данные клуба.');
      return;
    }

    setWorkspace(data.workspace);
    setActiveUserId(data.activeUserId);
  }

  async function runRemoteAction(payload: Record<string, unknown>): Promise<boolean> {
    const data = await runRemoteActionData<{ ok: boolean }>(payload);
    return Boolean(data);
  }

  async function runRemoteActionData<T>(payload: Record<string, unknown>): Promise<T | null> {
    const supabase = getSupabaseClient();
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) {
      window.location.href = '/login';
      return null;
    }

    const start = performance.now();
    const response = await fetch('/api/workspace/actions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as T & { error?: string };
    console.info('[performance] action', `runRemoteAction ${Math.round(performance.now() - start)}ms`, payload.action ?? 'unknown');

    if (!response.ok) {
      setMessage(data.error ?? 'Не удалось выполнить действие.');
      return null;
    }

    return data;
  }

  function selectActiveUser(userId: string): void {
    const nextUser = workspace?.users.find((user) => user.id === userId);
    setActiveUserId(userId);
    writeActiveUserId(userId);
    if (activeSection === 'expenses') {
      setActiveSection('overview');
    }
    if (activeSection === 'people' && nextUser?.role === 'member') {
      setActiveSection('overview');
    }
    if (activeSection === 'groups' && nextUser?.role === 'member') {
      setActiveSection('overview');
    }
    if (activeSection === 'schedule' && nextUser?.role !== 'member') {
      setActiveSection('groups');
    }
    setMessage('');
    setMobileFormOpen(false);
  }

  function openSection(section: DashboardSection): void {
    setActiveSection(section);
    setMobileFormOpen(false);
    if (section === 'notifications' && unreadNotifications.length > 0) {
      void markNotificationsRead();
    }
  }

  function openNotificationPayment(paymentId?: string | null): void {
    if (!paymentId || !workspace) return;
    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    setActiveSection('payments');
    setPaymentView(payment.status === 'paid' ? 'paid' : 'all');
    setSelectedPaymentMemberId(payment.member_id);
    setPaymentEditOpen(false);
    setMobileFormOpen(false);
  }

  function openPrepayment(payment: PaymentRequest): void {
    setActiveSection('payments');
    setPaymentView('all');
    setSelectedPaymentMemberId(payment.member_id);
    setPaymentEditOpen(false);
    window.setTimeout(() => {
      document.getElementById(`prepayment-${payment.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 80);
  }

  async function addPerson(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!workspace || !activeUser) return;

    const effectiveRole =
      hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'member' : personDraft.role;
    const selectedGroup = workspace.groups.find((group) => group.id === personDraft.groupId);
    const effectiveTrainerId = selectedGroup?.trainerId ?? '';

    if (effectiveRole === 'member' && !selectedGroup) {
      setMessage('Выберите группу для ученика.');
      return;
    }

    if (!isLocalMode) {
      if (effectiveRole === 'member') {
        const result = await runRemoteActionData<{ inviteUrl: string; expiresAt: string }>(
          {
            action: 'create_member_invite',
            groupId: personDraft.groupId
          }
        );
        if (result) {
          setMemberInvite({
            inviteUrl: result.inviteUrl,
            expiresAt: result.expiresAt,
            groupName: selectedGroup!.activity
          });
          setPersonDraft((current) => ({
            ...emptyPersonDraft,
            role: 'member',
            groupId: current.groupId
          }));
          setMessage('Приглашение создано. Отправьте ссылку ученику.');
        }
        return;
      }

      const success = await runRemoteAction({
        action: 'create_user',
        role: 'trainer',
        firstName: personDraft.firstName,
        lastName: personDraft.lastName,
        username: personDraft.username,
        password: personDraft.password,
        phone: personDraft.phone
      });
      if (success) {
        setPersonDraft(emptyPersonDraft);
        setMobileFormOpen(false);
        setMessage('Тренер создан.');
      }
      return;
    }

    const now = new Date().toISOString();
    const personId = createId();
    const person: AppUser = {
      id: personId,
      auth_user_id: null,
      organization_id: workspace.organization.id,
      role: effectiveRole,
      roles: [effectiveRole],
      first_name: personDraft.firstName.trim(),
      last_name: personDraft.lastName.trim(),
      email: personDraft.email.trim() || null,
      phone: personDraft.phone.trim() || null,
      created_at: now
    };

    const nextWorkspace: LocalWorkspace = {
      ...workspace,
      users: [...workspace.users, person]
    };

    if (person.role === 'member') {
      nextWorkspace.assignments = [
        ...workspace.assignments,
        {
          id: createId(),
          organization_id: workspace.organization.id,
          trainer_id: effectiveTrainerId,
          member_id: personId,
          created_at: now
        }
      ];
      nextWorkspace.groupMembers = [
        ...workspace.groupMembers,
        {
          id: createId(),
          groupId: selectedGroup!.id,
          memberId: personId,
          createdAt: now
        }
      ];

      const calculatedInitialAmount = Number(personDraft.initialAmount);

      if (calculatedInitialAmount > 0 && personDraft.initialDueDate) {
        const planId = createId();
        const billingPlan: LocalBillingPlan = {
          id: planId,
          memberId: personId,
          trainerId: effectiveTrainerId,
          type: personDraft.paymentType,
          trainingFormat: personDraft.trainingFormat,
          baseAmount: calculatedInitialAmount,
          billingDay:
            personDraft.paymentType === 'monthly'
              ? new Date(`${personDraft.initialDueDate}T12:00:00`).getDate()
              : null,
          active: true,
          createdAt: now,
          updatedAt: now
        };

        nextWorkspace.billingPlans = [...workspace.billingPlans, billingPlan];
        nextWorkspace.payments = [
          ...workspace.payments,
          {
            id: createId(),
            organization_id: workspace.organization.id,
            member_id: personId,
            trainer_id: effectiveTrainerId,
            amount: calculatedInitialAmount,
            due_date: personDraft.initialDueDate,
            status: 'active',
            created_at: now,
            plan_id: planId,
            period_label: periodLabel(personDraft.initialDueDate),
            is_current: true,
            coverage_months: 1,
            paid_at: null
          }
        ];
      }
    }

    saveWorkspace(nextWorkspace);
    setPersonDraft(emptyPersonDraft);
    setMessage(
      person.role === 'member'
        ? 'Ученик создан и назначен тренеру.'
        : 'Тренер создан. Теперь к нему можно добавлять учеников.'
    );
  }

  async function copyMemberInvite(): Promise<void> {
    if (!memberInvite) return;
    await navigator.clipboard.writeText(memberInvite.inviteUrl);
    setMessage('Ссылка скопирована.');
  }

  async function shareMemberInvite(): Promise<void> {
    if (!memberInvite) return;
    if (navigator.share) {
      await navigator.share({
        title: `Приглашение в группу ${memberInvite.groupName}`,
        text: 'Завершите регистрацию в Tartib и присоединитесь к группе.',
        url: memberInvite.inviteUrl
      });
      return;
    }
    await copyMemberInvite();
  }

  async function createGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!workspace || !activeUser || !hasRole(activeUser, 'trainer')) return;

    const trainerId = hasRole(activeUser, 'owner')
      ? groupDraft.trainerId || activeUser.id
      : activeUser.id;
    if (!trainerId || !groupDraft.activity.trim() || !groupDraft.days.trim() || !groupDraft.time.trim()) {
      setMessage('Укажите направление, дни и время.');
      return;
    }

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<
        | { group: LocalTrainingGroup }
        | null
      >(
        {
          action: 'save_group',
          id: editingGroupId || undefined,
          trainerId,
          activity: groupDraft.activity,
          days: groupDraft.days,
          time: groupDraft.time,
          note: groupDraft.note
        },
        `save-group:${editingGroupId || 'new'}`
      );
      if (data?.group) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                groups: current.groups.some((item) => item.id === data.group.id)
                  ? current.groups.map((item) => (item.id === data.group.id ? data.group : item))
                  : [...current.groups, data.group]
              }
            : current
        );
        setGroupDraft(emptyGroupDraft);
        setEditingGroupId('');
        setMobileFormOpen(false);
        setMessage(editingGroupId ? 'Группа обновлена.' : 'Группа создана.');
      }
      return;
    }

    const now = new Date().toISOString();
    const group: LocalTrainingGroup = {
      id: createId(),
      trainerId,
      activity: groupDraft.activity.trim(),
      days: groupDraft.days.trim(),
      time: groupDraft.time.trim(),
      note: groupDraft.note.trim(),
      createdAt: now,
      updatedAt: now
    };

    if (editingGroupId) {
      saveWorkspace({
        ...workspace,
        groups: workspace.groups.map((item) =>
          item.id === editingGroupId ? { ...item, ...group, id: editingGroupId, createdAt: item.createdAt } : item
        )
      });
      setMessage('Группа обновлена.');
    } else {
      saveWorkspace({
        ...workspace,
        groups: [...workspace.groups, group]
      });
      setMessage('Группа создана.');
    }

    setGroupDraft(emptyGroupDraft);
    setEditingGroupId('');
  }

  function startGroupEdit(group: LocalTrainingGroup): void {
    if (!activeUser || !hasRole(activeUser, 'trainer')) return;

    setEditingGroupId(group.id);
    setGroupDraft({
      activity: group.activity,
      days: group.days,
      time: group.time,
      note: group.note,
      trainerId: group.trainerId
    });
    setMessage('Редактирование группы. Внесите изменения и сохраните.');
  }

  function cancelGroupEdit(): void {
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
  }

  async function deleteGroup(groupId: string): Promise<void> {
    if (!workspace || !activeUser || !hasRole(activeUser, 'trainer')) return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{ deletedGroupId: string }>(
        { action: 'delete_group', groupId },
        `delete-group:${groupId}`
      );
      if (data?.deletedGroupId) {
        if (editingGroupId === groupId) cancelGroupEdit();
        setWorkspace((current) =>
          current
            ? {
                ...current,
                groups: current.groups.filter((item) => item.id !== data.deletedGroupId),
                groupMembers: current.groupMembers.filter((assignment) => assignment.groupId !== data.deletedGroupId)
              }
            : current
        );
        setMessage('Группа удалена.');
      }
      return;
    }

    saveWorkspace({
      ...workspace,
      groups: workspace.groups.filter((item) => item.id !== groupId),
      groupMembers: workspace.groupMembers.filter((assignment) => assignment.groupId !== groupId)
    });

    if (editingGroupId === groupId) {
      cancelGroupEdit();
    }

    setMessage('Группа удалена.');
  }

  async function assignMemberToGroup(memberId: string, groupId: string): Promise<void> {
    if (!workspace) return;

    const group = groupsById.get(groupId);
    if (!group) return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        assignment: TrainerMember;
        groupMember: LocalGroupMember;
      }>(
        { action: 'assign_member_group', memberId, groupId },
        `assign-member-group:${memberId}`
      );
      if (data?.assignment && data?.groupMember) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                assignments: [
                  ...current.assignments.filter((item) => item.member_id !== data.assignment.member_id),
                  data.assignment
                ],
                groupMembers: [
                  ...current.groupMembers.filter((item) => item.memberId !== data.groupMember.memberId),
                  data.groupMember
                ]
              }
            : current
        );
        setMessage('Ученик назначен в группу.');
      }
      return;
    }

    const existingGroupAssignment = workspace.groupMembers.find(
      (assignment) => assignment.memberId === memberId
    );
    const existingTrainerAssignment = workspace.assignments.find(
      (assignment) => assignment.member_id === memberId
    );
    const now = new Date().toISOString();
    const groupAssignment: LocalGroupMember = {
      id: existingGroupAssignment?.id ?? createId(),
      groupId,
      memberId,
      createdAt: existingGroupAssignment?.createdAt ?? now
    };

    saveWorkspace({
      ...workspace,
      groupMembers: existingGroupAssignment
        ? workspace.groupMembers.map((assignment) =>
            assignment.id === existingGroupAssignment.id ? groupAssignment : assignment
          )
        : [...workspace.groupMembers, groupAssignment],
      assignments: existingTrainerAssignment
        ? workspace.assignments.map((assignment) =>
            assignment.id === existingTrainerAssignment.id
              ? { ...assignment, trainer_id: group.trainerId }
              : assignment
          )
        : [
            ...workspace.assignments,
            {
              id: createId(),
              organization_id: workspace.organization.id,
              trainer_id: group.trainerId,
              member_id: memberId,
              created_at: now
            }
          ]
    });
    setMessage('Ученик назначен в группу.');
  }

  async function deleteMember(memberId: string): Promise<void> {
    if (!workspace) return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{ deletedMemberId: string }>(
        { action: 'delete_member', memberId },
        `delete-member:${memberId}`
      );
      if (data?.deletedMemberId) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                users: current.users.filter((user) => user.id !== data.deletedMemberId),
                assignments: current.assignments.filter(
                  (assignment) => assignment.member_id !== data.deletedMemberId
                ),
                groupMembers: current.groupMembers.filter(
                  (assignment) => assignment.memberId !== data.deletedMemberId
                ),
                billingPlans: current.billingPlans.filter(
                  (plan) => plan.memberId !== data.deletedMemberId
                ),
                payments: current.payments.filter(
                  (payment) => payment.member_id !== data.deletedMemberId
                ),
                schedules: current.schedules.filter(
                  (schedule) => schedule.memberId !== data.deletedMemberId
                )
              }
            : current
        );
        setMessage('Ученик удалён.');
      }
      return;
    }

    saveWorkspace({
      ...workspace,
      users: workspace.users.filter((user) => user.id !== memberId),
      assignments: workspace.assignments.filter((assignment) => assignment.member_id !== memberId),
      groupMembers: workspace.groupMembers.filter((assignment) => assignment.memberId !== memberId),
      billingPlans: workspace.billingPlans.filter((plan) => plan.memberId !== memberId),
      payments: workspace.payments.filter((payment) => payment.member_id !== memberId),
      schedules: workspace.schedules.filter((schedule) => schedule.memberId !== memberId)
    });
    setMessage('Ученик удалён.');
  }

  async function saveMemberPayment(memberId: string): Promise<void> {
    if (!workspace || !activeUser) return;

    const edit = paymentEdits[memberId];
    const assignment = assignmentsByMemberId.get(memberId);
    const trainerId =
      hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
        ? activeUser.id
        : assignment?.trainer_id;

    if (!trainerId) {
      setMessage('У этого ученика не назначен тренер.');
      return;
    }

    if (!edit?.dueDate) {
      setMessage('Укажите сумму и срок оплаты.');
      return;
    }

    const calculatedAmount = Number(edit.currentAmount);

    if (calculatedAmount <= 0) {
      setMessage('Сумма оплаты должна быть больше нуля.');
      return;
    }

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        payment: PaymentRequest;
        billingPlan: LocalBillingPlan;
      }>(
        {
          action: 'save_payment',
          memberId,
          type: edit.type,
          trainingFormat: edit.trainingFormat,
          amount: calculatedAmount,
          dueDate: edit.dueDate,
          updateFuture: edit.updateFuture
        },
        `save-payment:${memberId}`
      );
      if (data?.payment && data.billingPlan) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                billingPlans: current.billingPlans.some((plan) => plan.id === data.billingPlan.id)
                  ? current.billingPlans.map((plan) =>
                      plan.id === data.billingPlan.id ? data.billingPlan : plan
                    )
                  : [...current.billingPlans, data.billingPlan],
                payments: current.payments.some((payment) => payment.id === data.payment.id)
                  ? current.payments.map((payment) =>
                      payment.id === data.payment.id ? data.payment : payment
                    )
                  : [...current.payments, data.payment]
              }
            : current
        );
        setPaymentEdits((current) => {
          const next = { ...current };
          delete next[memberId];
          return next;
        });
        setMessage('Оплата сохранена.');
      }
      return;
    }

    const existingPayment = currentPaymentByMemberId.get(memberId);
    const existingPlan = activePlanByMemberId.get(memberId);
    const now = new Date().toISOString();
    const planId = existingPlan?.id ?? createId();
    const baseAmount = Number(
      edit.updateFuture || !existingPlan
        ? edit.currentAmount
        : existingPlan.baseAmount || edit.currentAmount
    );
    const nextPlan: LocalBillingPlan = {
      id: planId,
      memberId,
      trainerId,
      type: edit.type,
      trainingFormat: edit.trainingFormat,
      baseAmount,
      billingDay:
        edit.type === 'monthly' ? new Date(`${edit.dueDate}T12:00:00`).getDate() : null,
      active: true,
      createdAt: existingPlan?.createdAt ?? now,
      updatedAt: now
    };
    const shouldUpdatePlan =
      !existingPlan || edit.updateFuture || existingPlan.type !== edit.type;
    const nextPayment = existingPayment
      ? {
          ...existingPayment,
          amount: calculatedAmount,
          due_date: edit.dueDate,
          plan_id: planId,
          period_label: periodLabel(edit.dueDate)
        }
      : {
          id: createId(),
          organization_id: workspace.organization.id,
          member_id: memberId,
          trainer_id: trainerId,
          amount: calculatedAmount,
          due_date: edit.dueDate,
          status: 'active' as const,
          created_at: now,
          plan_id: planId,
          period_label: periodLabel(edit.dueDate),
          is_current: true,
          coverage_months: 1,
          paid_at: null
        };

    saveWorkspace({
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
    });
    setPaymentEdits((current) => {
      const next = { ...current };
      delete next[memberId];
      return next;
    });
    setMessage(existingPayment ? 'Оплата обновлена.' : 'Оплата назначена.');
  }

  async function deleteMemberPayment(payment: PaymentRequest): Promise<void> {
    if (!workspace || payment.status === 'paid') return;
    const confirmed = window.confirm(
      `Удалить счёт на ${formatMoney(payment.amount)}? Ученик увидит, что счёт отменён.`
    );
    if (!confirmed) return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        deletedPaymentId: string;
        disabledPlanId: string | null;
        notification?: LocalNotification;
      }>(
        { action: 'delete_payment', paymentId: payment.id },
        `delete-payment:${payment.id}`
      );
      if (data?.deletedPaymentId) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                payments: current.payments.filter((item) => item.id !== data.deletedPaymentId),
                billingPlans: data.disabledPlanId
                  ? current.billingPlans.map((plan) =>
                      plan.id === data.disabledPlanId ? { ...plan, active: false } : plan
                    )
                  : current.billingPlans,
                notifications:
                  data.notification && data.notification.userId === activeUserId
                    ? [...current.notifications, data.notification]
                    : current.notifications
              }
            : current
        );
        setPaymentEdits((current) => {
          const next = { ...current };
          delete next[payment.member_id];
          return next;
        });
        setMessage('Счёт удалён. Ученику отправлено уведомление.');
      }
      return;
    }

    const now = new Date().toISOString();
    saveWorkspace({
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
    });
    setPaymentEdits((current) => {
      const next = { ...current };
      delete next[payment.member_id];
      return next;
    });
    setMessage('Счёт удалён. Ученику отправлено уведомление.');
  }

  async function updatePaymentStatus(paymentId: string, status: PaymentRequestStatus): Promise<void> {
    if (!workspace) return;

    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        payment?: PaymentRequest;
        nextPayment?: PaymentRequest;
        notification?: LocalNotification;
      }>(
        {
          action: 'decide_payment',
          paymentId,
          approved: status === 'paid'
        },
        `decide-payment:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                payments: [
                  ...current.payments.map((item) =>
                    item.id === data.payment?.id ? data.payment : item
                  ),
                  ...(data.nextPayment ? [data.nextPayment] : [])
                ],
                notifications:
                  data.notification && data.notification.userId === activeUserId
                    ? [...current.notifications, data.notification]
                    : current.notifications
              }
            : current
        );
        setMessage(status === 'paid' ? 'Оплата подтверждена.' : 'Подтверждение отклонено.');
      }
      return;
    }
    const plan = workspace.billingPlans.find((item) => item.id === payment?.plan_id);
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
    const shouldAdvance =
      resolvedStatus === 'paid' &&
      payment.is_current !== false &&
      plan?.active &&
      plan.type !== 'one_time';
    const nextDueDate =
      shouldAdvance && payment
        ? addMonthsDate(payment.due_date, plan.billingDay, payment.coverage_months ?? 1)
        : null;
    const nextAmount =
      Number(plan?.baseAmount ?? 0);
    const nextPayment: PaymentRequest | null =
      shouldAdvance && payment && nextDueDate
        ? {
            id: createId(),
            organization_id: payment.organization_id,
            member_id: payment.member_id,
            trainer_id: payment.trainer_id,
            amount: nextAmount,
            due_date: nextDueDate,
            status: 'active',
            created_at: new Date().toISOString(),
            plan_id: plan.id,
            period_label: periodLabel(nextDueDate),
            is_current: true,
            coverage_months: 1,
            paid_at: null
          }
        : null;

    saveWorkspace({
      ...workspace,
      payments: [
        ...workspace.payments.map((item) =>
          item.id === paymentId
            ? {
                ...item,
                status: resolvedStatus,
                paid_at: resolvedStatus === 'paid' ? new Date().toISOString() : item.paid_at,
                is_current: shouldAdvance ? false : item.is_current
              }
            : item
        ),
        ...(nextPayment ? [nextPayment] : [])
      ],
      notifications:
        notificationMessage && payment
          ? [
              ...workspace.notifications,
              {
                id: createId(),
                userId: payment.member_id,
                message: notificationMessage,
                createdAt: new Date().toISOString(),
                read: false,
                paymentId: payment.id
              }
            ]
          : workspace.notifications
    });
    if (payment) {
      setPaymentEdits((current) => {
        const next = { ...current };
        delete next[payment.member_id];
        return next;
      });
    }
  }

  function delayDraftFor(payment: PaymentRequest): DelayDraft {
    return (
      delayDrafts[payment.id] ?? {
        requestedDate: payment.delay_requested_date ?? '',
        comment: payment.delay_comment ?? ''
      }
    );
  }

  function updateDelayDraft(paymentId: string, patch: Partial<DelayDraft>): void {
    const payment = workspace?.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    setDelayDrafts((current) => ({
      ...current,
      [paymentId]: {
        ...delayDraftFor(payment),
        ...patch
      }
    }));
  }

  function prepaymentMonthsFor(paymentId: string): number {
    return prepaymentMonths[paymentId] ?? 1;
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

  async function requestPaymentDelay(paymentId: string): Promise<void> {
    if (!workspace || !activeUser || !hasRole(activeUser, 'member')) return;

    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;
    const draft = delayDraftFor(payment);

    if (
      !draft.requestedDate ||
      dateAtNoon(draft.requestedDate) <= dateAtNoon(payment.due_date) ||
      dateAtNoon(draft.requestedDate) < dateAtNoon(todayString())
    ) {
      setMessage('Выберите новую дату позже текущего срока оплаты.');
      return;
    }

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        payment?: PaymentRequest;
        notification?: LocalNotification;
      }>(
        {
          action: 'request_delay',
          paymentId,
          requestedDate: draft.requestedDate,
          comment: draft.comment
        },
        `request-delay:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                payments: current.payments.map((item) =>
                  item.id === data.payment?.id ? data.payment : item
                ),
                notifications:
                  data.notification && data.notification.userId === activeUserId
                    ? [...current.notifications, data.notification]
                    : current.notifications
              }
            : current
        );
        setMessage('Запрос отсрочки отправлен.');
      }
      return;
    }

    const now = new Date().toISOString();
    saveWorkspace({
      ...workspace,
      payments: workspace.payments.map((item) =>
        item.id === paymentId
          ? {
              ...item,
              status: 'delay_requested',
              delay_requested_date: draft.requestedDate,
              delay_comment: draft.comment.trim() || null,
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
          message: `${userName(payment.member_id)} запрашивает отсрочку до ${draft.requestedDate}${draft.comment.trim() ? `: ${draft.comment.trim()}` : '.'}`,
          createdAt: now,
          read: false,
          paymentId
        }
      ]
    });
    setMessage('Запрос отсрочки отправлен.');
  }

  async function decidePaymentDelay(paymentId: string, approved: boolean): Promise<void> {
    if (!workspace || !activeUser || (!hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner'))) {
      return;
    }

    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== 'delay_requested') return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        payment?: PaymentRequest;
        notification?: LocalNotification;
      }>(
        {
          action: 'decide_delay',
          paymentId,
          approved
        },
        `decide-delay:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                payments: current.payments.map((item) =>
                  item.id === data.payment?.id ? data.payment : item
                ),
                notifications:
                  data.notification && data.notification.userId === activeUserId
                    ? [...current.notifications, data.notification]
                    : current.notifications
              }
            : current
        );
        setMessage(approved ? 'Отсрочка одобрена.' : 'Отсрочка отклонена.');
      }
      return;
    }
    const now = new Date().toISOString();
    const nextDueDate =
      approved && payment.delay_requested_date ? payment.delay_requested_date : payment.due_date;
    const nextStatus = approved
      ? dateAtNoon(nextDueDate) < dateAtNoon(todayString())
        ? 'overdue'
        : 'delayed'
      : dateAtNoon(payment.due_date) < dateAtNoon(todayString())
        ? 'overdue'
        : 'active';

    saveWorkspace({
      ...workspace,
      payments: workspace.payments.map((item) =>
        item.id === paymentId
          ? {
              ...item,
              due_date: nextDueDate,
              period_label: periodLabel(nextDueDate),
              status: nextStatus,
              delay_status: approved ? 'approved' : 'rejected',
              delay_decided_at: now,
              delay_decided_by: activeUser.id
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
          paymentId
        }
      ]
    });
    setMessage(approved ? 'Отсрочка одобрена.' : 'Отсрочка отклонена.');
  }

  async function submitPaymentConfirmation(paymentId: string): Promise<void> {
    if (!workspace) return;
    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    if (!canSubmitPayment(payment)) {
      setMessage('Счёт ещё не наступил. Предоплату нужно оформить отдельным сценарием.');
      return;
    }

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        payment?: PaymentRequest;
        notification?: LocalNotification;
      }>(
        { action: 'submit_payment', paymentId },
        `submit-payment:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                payments: current.payments.map((item) =>
                  item.id === data.payment?.id ? data.payment : item
                ),
                notifications:
                  data.notification && data.notification.userId === activeUserId
                    ? [...current.notifications, data.notification]
                    : current.notifications
              }
            : current
        );
        setMessage('Подтверждение отправлено ответственному лицу.');
      }
      return;
    }
    const now = new Date().toISOString();

    saveWorkspace({
      ...workspace,
      payments: workspace.payments.map((item) =>
        item.id === paymentId ? { ...item, status: 'payment_confirmation' } : item
      ),
      notifications: [
        ...workspace.notifications,
        {
          id: createId(),
          userId: payment.trainer_id,
          message: `${userName(payment.member_id)}: оплата ${formatMoney(payment.amount)}.`,
          createdAt: now,
          read: false,
          paymentId
        }
      ]
    });
    setMessage('Подтверждение отправлено ответственному лицу.');
  }

  async function submitPrepayment(paymentId: string): Promise<void> {
    if (!workspace || !activeUser || !hasRole(activeUser, 'member')) return;

    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment || !canSubmitPrepayment(payment)) return;

    const plan = activePlanByMemberId.get(payment.member_id);
    if (!plan) return;

    const months = Math.max(1, Math.min(12, Math.trunc(prepaymentMonthsFor(paymentId))));
    const amount = Number(plan.baseAmount) * months;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<{
        payment?: PaymentRequest;
        notification?: LocalNotification;
      }>(
        { action: 'submit_prepayment', paymentId, months },
        `submit-prepayment:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                payments: current.payments.map((item) =>
                  item.id === data.payment?.id ? data.payment : item
                ),
                notifications:
                  data.notification && data.notification.userId === activeUserId
                    ? [...current.notifications, data.notification]
                    : current.notifications
              }
            : current
        );
        setMessage('Предоплата отправлена тренеру на подтверждение.');
      }
      return;
    }

    const now = new Date().toISOString();
    saveWorkspace({
      ...workspace,
      payments: workspace.payments.map((item) =>
        item.id === paymentId
          ? {
              ...item,
              status: 'payment_confirmation',
              amount,
              coverage_months: months,
              period_label: prepaymentPeriodLabel(item.due_date, months)
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
          paymentId
        }
      ]
    });
    setMessage('Предоплата отправлена тренеру на подтверждение.');
  }

  function createExpense(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!workspace) return;

    const amount = Number(expenseDraft.amount);
    if (!expenseDraft.name.trim() || amount <= 0 || !expenseDraft.dueDate) {
      setMessage('Укажите название, сумму и срок расхода.');
      return;
    }

    const expense: LocalExpense = {
      id: createId(),
      name: expenseDraft.name.trim(),
      amount,
      dueDate: expenseDraft.dueDate,
      type: expenseDraft.type,
      status: 'pending',
      periodLabel: periodLabel(expenseDraft.dueDate),
      isCurrent: true,
      paidAt: null,
      createdAt: new Date().toISOString()
    };

    saveWorkspace({
      ...workspace,
      expenses: [...workspace.expenses, expense]
    });
    setExpenseDraft(emptyExpenseDraft);
    setMessage('Расход добавлен.');
  }

  function markExpensePaid(expenseId: string): void {
    if (!workspace) return;

    const expense = workspace.expenses.find((item) => item.id === expenseId);
    if (!expense) return;

    const nextDueDate =
      expense.type === 'recurring'
        ? nextMonthDate(expense.dueDate, new Date(`${expense.dueDate}T12:00:00`).getDate())
        : null;
    const nextExpense: LocalExpense | null = nextDueDate
      ? {
          ...expense,
          id: createId(),
          dueDate: nextDueDate,
          status: 'pending',
          periodLabel: periodLabel(nextDueDate),
          isCurrent: true,
          paidAt: null,
          createdAt: new Date().toISOString()
        }
      : null;

    saveWorkspace({
      ...workspace,
      expenses: [
        ...workspace.expenses.map((item) =>
          item.id === expenseId
            ? {
                ...item,
                status: 'paid' as const,
                paidAt: new Date().toISOString(),
                isCurrent: false
              }
            : item
        ),
        ...(nextExpense ? [nextExpense] : [])
      ]
    });
    setMessage(nextExpense ? 'Расход оплачен, следующий месяц создан.' : 'Расход оплачен.');
  }

  function scheduleEditFor(memberId: string): ScheduleEdit {
    const existingEdit = scheduleEdits[memberId];
    if (existingEdit) return existingEdit;

    const schedule = workspace?.schedules.find((item) => item.memberId === memberId);
    return {
      days: schedule?.days ?? '',
      time: schedule?.time ?? '',
      note: schedule?.note ?? ''
    };
  }

  function updateScheduleEdit(memberId: string, patch: Partial<ScheduleEdit>): void {
    setScheduleEdits((current) => ({
      ...current,
      [memberId]: {
        ...scheduleEditFor(memberId),
        ...patch
      }
    }));
  }

  function saveSchedule(memberId: string): void {
    if (!workspace || !activeUser) return;

    const edit = scheduleEdits[memberId] ?? scheduleEditFor(memberId);
    const trainer = trainerFor(memberId);
    if (!trainer || !edit.days.trim() || !edit.time.trim()) {
      setMessage('Укажите дни и время тренировок.');
      return;
    }

    const existing = workspace.schedules.find((schedule) => schedule.memberId === memberId);
    const schedule: LocalTrainingSchedule = {
      id: existing?.id ?? createId(),
      memberId,
      trainerId: trainer.id,
      days: edit.days.trim(),
      time: edit.time.trim(),
      note: edit.note.trim(),
      updatedAt: new Date().toISOString()
    };

    saveWorkspace({
      ...workspace,
      schedules: existing
        ? workspace.schedules.map((item) => (item.id === existing.id ? schedule : item))
        : [...workspace.schedules, schedule]
    });
    setMessage('Расписание сохранено.');
  }

  async function markNotificationsRead(): Promise<void> {
    if (!workspace || unreadNotifications.length === 0) return;

    if (!isLocalMode) {
      const data = await runRemoteActionData<{ success?: boolean }>({ action: 'mark_notifications_read' });
      if (data?.success) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                notifications: current.notifications.map((notification) =>
                  notification.userId === activeUserId ? { ...notification, read: true } : notification
                )
              }
            : current
        );
      }
      return;
    }

    saveWorkspace({
      ...workspace,
      notifications: workspace.notifications.map((notification) =>
        notification.userId === activeUserId ? { ...notification, read: true } : notification
      )
    });
  }

  function handleReset(): void {
    const nextWorkspace = resetWorkspace();
    const owner = nextWorkspace.users[0];
    setWorkspace(nextWorkspace);
    setActiveUserId(owner.id);
    setMessage('Тестовые данные сброшены.');
  }

  function openNewWindow(): void {
    window.open('/dashboard', '_blank', 'noopener,noreferrer');
  }

  async function signOut(): Promise<void> {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  function trainerFor(memberId: string): AppUser | null {
    if (!workspace) return null;
    const assignment = assignmentsByMemberId.get(memberId);
    return assignment ? usersById.get(assignment.trainer_id) ?? null : null;
  }

  function groupFor(memberId: string): LocalTrainingGroup | null {
    if (!workspace) return null;
    const assignment = groupMembershipByMemberId.get(memberId);
    return assignment ? groupsById.get(assignment.groupId) ?? null : null;
  }

  function userName(userId: string): string {
    const user = usersById.get(userId);
    return user ? `${user.first_name} ${user.last_name}` : 'Неизвестно';
  }

  function renderPaymentRow(member: AppUser): React.ReactElement {
    const payment = currentPaymentByMemberId.get(member.id);
    const plan = activePlanByMemberId.get(member.id);
    const group = groupFor(member.id);

    return (
      <button
        className={`payment-registry-row ${selectedPaymentMemberId === member.id ? 'selected' : ''}`}
        key={member.id}
        type="button"
        onClick={() => {
          setSelectedPaymentMemberId(member.id);
          setPaymentEditOpen(false);
        }}
      >
        <div className="payment-person">
          <strong>{userName(member.id)}</strong>
          <span>
            {group ? group.activity : 'Без группы'}
            {plan ? ` · ${planLabels[plan.type]}` : ' · условия не настроены'}
          </span>
        </div>
        <strong className="payment-amount">{payment ? formatMoney(payment.amount) : '—'}</strong>
        <span className="payment-due">{formatShortDate(payment?.due_date)}</span>
        <span className={`status-pill ${payment?.status ?? 'not-set'}`}>{statusLabels[payment?.status ?? 'not-set']}</span>
        <ChevronRight className="payment-row-arrow" size={18} />
      </button>
    );
  }

  function paymentEditFor(memberId: string): PaymentEdit {
    const existingEdit = paymentEdits[memberId];
    if (existingEdit) return existingEdit;

    const payment = currentPaymentByMemberId.get(memberId);
    const plan = activePlanByMemberId.get(memberId);
    return {
      type: plan?.type ?? 'monthly',
      trainingFormat: plan?.trainingFormat ?? 'group',
      currentAmount: payment ? String(payment.amount) : '',
      dueDate: payment?.due_date ?? '',
      updateFuture: false
    };
  }

  function updatePaymentEdit(memberId: string, patch: Partial<PaymentEdit>): void {
    setPaymentEdits((current) => ({
      ...current,
      [memberId]: {
        ...paymentEditFor(memberId),
        ...patch
      }
    }));
  }

  const peopleForView =
    activeUser && hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
      ? visibleMembers
      : workspace?.users ?? [];
  const filteredPeopleForView = peopleForView.filter((user) => {
    const query = peopleSearch.trim().toLocaleLowerCase('ru-RU');
    const group = user.role === 'member' ? groupFor(user.id) : null;
    const matchesSearch =
      !query ||
      `${user.first_name} ${user.last_name}`.toLocaleLowerCase('ru-RU').includes(query) ||
      (user.phone ?? '').toLocaleLowerCase('ru-RU').includes(query) ||
      (user.email ?? '').toLocaleLowerCase('ru-RU').includes(query);
    const matchesGroup =
      peopleGroupFilter === 'all' ||
      (peopleGroupFilter === 'no-group' && user.role === 'member' && !group) ||
      (user.role === 'member' && group?.id === peopleGroupFilter);

    return matchesSearch && matchesGroup;
  });
  const peopleGroupsForFilter = visibleGroups;
  const isMemberInviteForm =
    Boolean(activeUser) &&
    !isLocalMode &&
    ((hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
      personDraft.role === 'member');
  const userNotifications =
    workspace?.notifications.filter((notification) => notification.userId === activeUserId) ?? [];
  const sectionMeta: Record<DashboardSection, { title: string; description: string }> = {
    overview: {
      title: 'Обзор',
      description: 'Главные показатели и текущая ситуация в клубе'
    },
    people: {
      title:
        activeUser && hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
          ? 'Мои ученики'
          : 'Команда',
      description: 'Тренеры, ученики и распределение ответственности'
    },
    payments: {
      title: activeUser?.role === 'member' ? 'Моя оплата' : 'Оплаты',
      description: 'Текущие суммы, сроки и подтверждения учеников'
    },
    groups: {
      title: 'Группы',
      description: 'Направления, дни и время занятий тренеров'
    },
    schedule: {
      title: activeUser?.role === 'member' ? 'Моё расписание' : 'Расписание',
      description:
        activeUser?.role === 'member'
          ? 'Дни и время ваших тренировок'
          : 'Расписание тренировок учеников'
    },
    expenses: {
      title: 'Расходы',
      description: 'Аренда, коммунальные и другие затраты клуба'
    },
    notifications: {
      title: 'Уведомления',
      description: 'История решений и важных изменений'
    }
  };

  if (!workspace || !activeUser) {
    return <main className="app-shell">Загружаем клуб...</main>;
  }

  return (
    <div className="crm-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <span className="crm-brand-mark">T</span>
          <div>
            <strong>Tartib</strong>
            <span>Управление клубом</span>
          </div>
        </div>

        <div className="crm-organization">
          <span>Организация</span>
          <strong>{workspace.organization.name}</strong>
        </div>

        <nav className="crm-nav" aria-label="Разделы">
          <NavButton
            active={activeSection === 'overview'}
            icon={<LayoutDashboard size={18} />}
            label="Обзор"
            onClick={() => openSection('overview')}
          />
          {!hasRole(activeUser, 'member') ? (
            <NavButton
              active={activeSection === 'people'}
              icon={<Users size={18} />}
              label={
                hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
                  ? 'Мои ученики'
                  : 'Команда'
              }
              onClick={() => openSection('people')}
            />
          ) : null}
          <NavButton
            active={activeSection === 'payments'}
            icon={<CreditCard size={18} />}
            label="Оплаты"
            onClick={() => openSection('payments')}
          />
          {hasRole(activeUser, 'member') ? (
            <NavButton
              active={activeSection === 'schedule'}
              icon={<CalendarDays size={18} />}
              label="Расписание"
              onClick={() => openSection('schedule')}
            />
          ) : (
            <NavButton
              active={activeSection === 'groups'}
              icon={<Layers3 size={18} />}
              label="Группы"
              onClick={() => openSection('groups')}
            />
          )}
          <NavButton
            active={activeSection === 'notifications'}
            count={unreadNotifications.length}
            icon={<Bell size={18} />}
            label="Уведомления"
            onClick={() => openSection('notifications')}
          />
        </nav>

        <div className="crm-sidebar-footer">
          {isLocalMode ? (
            <label className="crm-role-select">
              Работать как
              <select value={activeUser.id} onChange={(event) => selectActiveUser(event.target.value)}>
                {workspace.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} · {roleLabel(user)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="crm-sidebar-action" type="button" onClick={openNewWindow}>
            <ExternalLink size={16} />
            Новое окно
          </button>
          {isLocalMode ? (
            <button className="crm-sidebar-action danger" type="button" onClick={handleReset}>
              <RotateCcw size={16} />
              Сбросить данные
            </button>
          ) : (
            <button className="crm-sidebar-action" type="button" onClick={() => void signOut()}>
              <LogOut size={16} />
              Выйти
            </button>
          )}
        </div>
      </aside>

      <main className="crm-main">
        <div className="mobile-topbar">
          <div className="mobile-brand">
            <span className="crm-brand-mark">T</span>
            <div>
              <strong>{workspace.organization.name}</strong>
              <span>{roleLabel(activeUser)}</span>
            </div>
          </div>
          {!isLocalMode ? (
            <button aria-label="Выйти" className="mobile-icon-button" type="button" onClick={() => void signOut()}>
              <LogOut size={20} />
            </button>
          ) : null}
        </div>
        <header className="crm-header">
          <div>
            <h1>{sectionMeta[activeSection].title}</h1>
            <p>{sectionMeta[activeSection].description}</p>
          </div>
          {!hasRole(activeUser, 'member') &&
          (activeSection === 'people' || activeSection === 'groups') ? (
            <button
              className="mobile-create-button"
              type="button"
              onClick={() => setMobileFormOpen((current) => !current)}
            >
              {mobileFormOpen ? <X size={18} /> : <Plus size={18} />}
              {mobileFormOpen
                ? 'Закрыть'
                : activeSection === 'groups'
                  ? 'Новая группа'
                  : hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
                    ? 'Новый ученик'
                    : 'Добавить'}
            </button>
          ) : null}
          <div className="crm-user-badge">
            <span>{roleLabel(activeUser)}</span>
            <strong>{activeUser.first_name} {activeUser.last_name}</strong>
          </div>
        </header>

        {message ? <p className="notice success">{message}</p> : null}

        {unreadNotifications.length > 0 && activeSection !== 'notifications' ? (
          <button
            className="crm-alert"
            type="button"
            onClick={() => openSection('notifications')}
          >
            <Bell size={18} />
            <span>Новых уведомлений: {unreadNotifications.length}</span>
          </button>
        ) : null}

        {activeSection === 'overview' ? (
          <>
            {hasRole(activeUser, 'member') ? (
              <section className="member-overview">
                <div className="crm-panel member-primary-card">
                  <div className="member-card-label">Текущая оплата</div>
                  <strong className="member-payment-amount">
                    {activeMemberPayment
                      ? formatMoney(activeMemberPayment.amount)
                      : 'Не назначена'}
                  </strong>
                  <div className="member-payment-meta">
                    <span>
                      Срок: {activeMemberPayment?.due_date ?? 'не указан'}
                    </span>
                    <span className={`status-pill ${activeMemberPayment?.status ?? 'not-set'}`}>
                      {statusLabels[activeMemberPayment?.status ?? 'not-set']}
                    </span>
                  </div>
                  {activeMemberPayment && canSubmitPayment(activeMemberPayment) ? (
                    <div className="member-payment-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => submitPaymentConfirmation(activeMemberPayment.id)}
                      >
                        Я оплатил
                      </button>
                      <div className="delay-request-form">
                        <input
                          aria-label="Новая дата оплаты"
                          min={todayString()}
                          type="date"
                          value={delayDraftFor(activeMemberPayment).requestedDate}
                          onChange={(event) =>
                            updateDelayDraft(activeMemberPayment.id, {
                              requestedDate: event.target.value
                            })
                          }
                        />
                        <input
                          aria-label="Комментарий к отсрочке"
                          placeholder="Причина, необязательно"
                          value={delayDraftFor(activeMemberPayment).comment}
                          onChange={(event) =>
                            updateDelayDraft(activeMemberPayment.id, {
                              comment: event.target.value
                            })
                          }
                        />
                        <button
                          className="small-button secondary"
                          type="button"
                          onClick={() => requestPaymentDelay(activeMemberPayment.id)}
                        >
                          Запросить отсрочку
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {activeMemberPayment && paymentLockedText(activeMemberPayment) ? (
                    <p className="payment-locked-note">
                      {paymentLockedText(activeMemberPayment)}
                      <button type="button" onClick={() => openPrepayment(activeMemberPayment)}>
                        предоплату
                      </button>
                      .
                    </p>
                  ) : null}
                  {activeMemberPayment?.status === 'delay_requested' ? (
                    <p className="inline-note">
                      Запрос до {activeMemberPayment.delay_requested_date} отправлен тренеру.
                    </p>
                  ) : null}
                </div>

                <div className="crm-panel member-info-card">
                  <div className="member-card-label">Мой тренер</div>
                  <strong>
                    {activeMemberTrainer
                      ? `${activeMemberTrainer.first_name} ${activeMemberTrainer.last_name}`
                      : 'Не назначен'}
                  </strong>
                  <span>{activeMemberTrainer?.phone ?? activeMemberTrainer?.email ?? 'Контакт не указан'}</span>
                </div>

                <div className="crm-panel member-info-card">
                  <div className="member-card-label">Расписание</div>
                  <strong>{activeMemberGroup?.activity ?? 'Не назначено'}</strong>
                  <span>
                    {activeMemberSchedule
                      ? `${activeMemberSchedule.days} · ${activeMemberSchedule.time}${activeMemberSchedule.note ? ` · ${activeMemberSchedule.note}` : ''}`
                      : 'Тренер пока не добавил расписание'}
                  </span>
                </div>
              </section>
            ) : (
              <section className="metric-grid">
                <Metric label="Ученики" value={visibleMembers.length} />
                <Metric label="Получено" value={formatMoney(paidAmount)} />
                {hasRole(activeUser, 'owner') ? (
                  <>
                    <Metric label="Тренеры" value={trainers.length} />
                    <Metric label="Просрочено" value={overduePayments.length} />
                    <Metric label="Запрошено отсрочек" value={delayRequestedPayments.length} />
                    <Metric label="Одобрено отсрочек" value={delayedPayments.length} />
                  </>
                ) : (
                  <>
                    <Metric label="Подтвердить оплаты" value={confirmationPayments.length} />
                    <Metric label="Запросы отсрочки" value={delayRequestedPayments.length} />
                    <Metric label="Просрочено" value={overduePayments.length} />
                    <Metric label="Ближайшие оплаты" value={upcomingPayments.length} />
                  </>
                )}
              </section>
            )}

            {!hasRole(activeUser, 'member') ? (
            <section className="crm-overview-grid">
              <div className="crm-panel">
                <div className="crm-panel-header">
                  <div>
                    <h2>{hasRole(activeUser, 'owner') ? 'Контроль оплат' : 'Требуют действия'}</h2>
                    <p>
                      {hasRole(activeUser, 'owner')
                        ? 'Текущая ситуация по клубу'
                        : 'Подтверждения, отсрочки и просрочки'}
                    </p>
                  </div>
                  <button className="text-button" type="button" onClick={() => openSection('payments')}>
                    Все оплаты
                  </button>
                </div>
                <div className="crm-list">
                  {visibleMembers
                    .filter((member) => {
                      const payment = workspace.payments.find(
                        (item) => item.member_id === member.id && item.is_current !== false
                      );
                      return hasRole(activeUser, 'owner')
                        ? Boolean(payment)
                        : Boolean(
                            payment &&
                              ['payment_confirmation', 'delay_requested', 'overdue'].includes(
                                payment.status
                              )
                          );
                    })
                    .slice(0, 6)
                    .map((member) => {
                    const payment = workspace.payments.find(
                      (item) => item.member_id === member.id && item.is_current !== false
                    );
                    return (
                      <div className="crm-list-row" key={member.id}>
                        <div>
                          <strong>{userName(member.id)}</strong>
                          <span>{trainerFor(member.id)?.first_name ?? 'Без тренера'}</span>
                        </div>
                        <span className={`status-pill ${payment?.status ?? 'not-set'}`}>
                          {statusLabels[payment?.status ?? 'not-set']}
                        </span>
                      </div>
                    );
                  })}
                  {visibleMembers.length === 0 ? <p className="empty-state">Ученики ещё не добавлены.</p> : null}
                </div>
              </div>

              <div className="crm-panel">
                <div className="crm-panel-header">
                  <div>
                    <h2>{hasRole(activeUser, 'owner') ? 'По тренерам' : 'Ближайшие оплаты'}</h2>
                    <p>{hasRole(activeUser, 'owner') ? 'Ученики и контроль по ответственным' : 'Срок в течение трёх дней'}</p>
                  </div>
                  <button className="text-button" type="button" onClick={() => openSection('people')}>
                    Открыть
                  </button>
                </div>
                <div className="crm-summary">
                  {hasRole(activeUser, 'owner')
                    ? trainers.map((trainer) => {
                        const trainerPayments = currentPayments.filter(
                          (payment) => payment.trainer_id === trainer.id
                        );
                        return (
                          <div key={trainer.id}>
                            <span>{userName(trainer.id)}</span>
                            <strong>
                              {trainerPayments.filter((payment) => payment.status === 'overdue').length} /{' '}
                              {trainerPayments.length}
                            </strong>
                          </div>
                        );
                      })
                    : upcomingPayments.map((payment) => (
                        <div key={payment.id}>
                          <span>{userName(payment.member_id)} · {payment.due_date}</span>
                          <strong>{formatMoney(payment.amount, 0)}</strong>
                        </div>
                      ))}
                  {(hasRole(activeUser, 'owner') ? trainers : upcomingPayments).length === 0 ? (
                    <p className="empty-state">Нет данных для отображения.</p>
                  ) : null}
                </div>
              </div>
            </section>
            ) : null}
          </>
        ) : null}

        {activeSection === 'people' ? (
          <section className="crm-content-grid">
            <div className="crm-panel">
              <div className="crm-panel-header">
                <div>
                  <h2>{hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'Мои ученики' : 'Состав клуба'}</h2>
                  <p>{filteredPeopleForView.length} / {peopleForView.length}</p>
                </div>
              </div>
              <div className="people-toolbar">
                <label className="people-search">
                  <Search size={17} />
                  <input
                    placeholder="Найти человека"
                    value={peopleSearch}
                    onChange={(event) => setPeopleSearch(event.target.value)}
                  />
                </label>
                <select
                  aria-label="Фильтр по группе"
                  value={peopleGroupFilter}
                  onChange={(event) => setPeopleGroupFilter(event.target.value)}
                >
                  <option value="all">Все группы</option>
                  {peopleGroupsForFilter.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.activity} · {group.days} {group.time}
                    </option>
                  ))}
                  <option value="no-group">Без группы</option>
                </select>
              </div>
              <div className="people-accordion">
                {filteredPeopleForView.map((user) => {
                  const group = user.role === 'member' ? groupFor(user.id) : null;
                  const isOpen = expandedPeople[user.id] ?? false;
                  const contact = user.email ?? user.phone ?? 'Не указан';
                  return (
                    <article className={`person-accordion-row ${isOpen ? 'open' : ''}`} key={user.id}>
                      <button
                        className="person-accordion-summary"
                        type="button"
                        onClick={() =>
                          setExpandedPeople((current) => ({
                            ...current,
                            [user.id]: !isOpen
                          }))
                        }
                      >
                        <span>
                          <strong>{user.first_name} {user.last_name}</strong>
                          <small>{roleLabel(user)}</small>
                        </span>
                        <span className="person-group-chip">
                          {user.role === 'member'
                            ? group
                              ? `${group.activity} · ${group.days} ${group.time}`
                              : 'Без группы'
                            : 'Команда клуба'}
                        </span>
                        <ChevronRight className={isOpen ? 'open' : ''} size={18} />
                      </button>
                      {isOpen ? (
                        <div className="person-accordion-detail">
                          <div>
                            <span>Контакт</span>
                            <strong>{contact}</strong>
                          </div>
                          {user.role === 'member' ? (
                            <label>
                              Группа
                              <select
                                value={group?.id ?? ''}
                                disabled={isPendingAction(`assign-member-group:${user.id}`)}
                                onChange={(event) =>
                                  assignMemberToGroup(user.id, event.target.value)
                                }
                              >
                                <option value="">Без группы</option>
                                {visibleGroups.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.activity} · {item.days} {item.time}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {user.role === 'member' ? (
                            <button
                              className="small-button danger"
                              type="button"
                              disabled={isPendingAction(`delete-member:${user.id}`)}
                              onClick={() => void deleteMember(user.id)}
                            >
                              {buttonLabel(`delete-member:${user.id}`, 'Удалить')}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {filteredPeopleForView.length === 0 ? (
                  <p className="empty-state">По этому поиску никого нет.</p>
                ) : null}
              </div>
              <div className="crm-table legacy-people-table">
                <div className="crm-table-head">
                  <span>Имя</span><span>Роль</span><span>Группа</span><span>Контакт</span><span>Действия</span>
                </div>
                {peopleForView.map((user) => {
                  const group = user.role === 'member' ? groupFor(user.id) : null;
                  return (
                    <div className="crm-table-row" key={user.id}>
                      <strong>{user.first_name} {user.last_name}</strong>
                      <span>{roleLabel(user)}</span>
                      {user.role === 'member' ? (
                        <select
                          value={group?.id ?? ''}
                          disabled={isPendingAction(`assign-member-group:${user.id}`)}
                          onChange={(event) =>
                            assignMemberToGroup(user.id, event.target.value)
                          }
                        >
                          <option value="">Без группы</option>
                          {visibleGroups.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.activity} · {item.days} {item.time}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>—</span>
                      )}
                      <span>{user.email ?? user.phone ?? 'Не указан'}</span>
                      {user.role === 'member' ? (
                        <button
                          className="small-button danger"
                          type="button"
                          disabled={isPendingAction(`delete-member:${user.id}`)}
                          onClick={() => void deleteMember(user.id)}
                        >
                          {buttonLabel(`delete-member:${user.id}`, 'Удалить')}
                        </button>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!hasRole(activeUser, 'member') ? (
              <form className={`crm-panel crm-side-form form-stack${mobileFormOpen ? ' mobile-form-open' : ''}`} onSubmit={addPerson}>
                <div className="crm-panel-header">
                  <div>
                    <h2>{hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'Новый ученик' : 'Новый человек'}</h2>
                    <p>Добавление в клуб</p>
                  </div>
                  <Plus size={20} />
                </div>

                {hasRole(activeUser, 'owner') ? (
                  <div className="segmented-control">
                    <button
                      className={personDraft.role === 'trainer' ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setMemberInvite(null);
                        setPersonDraft((current) => ({ ...current, role: 'trainer' }));
                      }}
                    >
                      Тренер
                    </button>
                    <button
                      className={personDraft.role === 'member' ? 'active' : ''}
                      disabled={visibleGroups.length === 0}
                      type="button"
                      onClick={() => {
                        setMemberInvite(null);
                        setPersonDraft((current) => ({ ...current, role: 'member' }));
                      }}
                    >
                      Ученик
                    </button>
                  </div>
                ) : null}

                {!isMemberInviteForm ? (
                  <>
                    <label>Имя<input required value={personDraft.firstName} onChange={(event) => setPersonDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                    <label>Фамилия<input required value={personDraft.lastName} onChange={(event) => setPersonDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                  </>
                ) : null}
                {!isLocalMode &&
                !(
                  (hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
                  personDraft.role === 'member'
                ) ? (
                  <div className="split-fields">
                    <label>
                      Логин
                      <input
                        minLength={3}
                        pattern="[A-Za-z0-9._-]+"
                        required
                        value={personDraft.username}
                        onChange={(event) =>
                          setPersonDraft((current) => ({
                            ...current,
                            username: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Временный пароль
                      <input
                        minLength={6}
                        required
                        type="password"
                        value={personDraft.password}
                        onChange={(event) =>
                          setPersonDraft((current) => ({
                            ...current,
                            password: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
                {!(
                  (hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
                  personDraft.role === 'member'
                ) ? (
                  <label>Телефон <span className="optional-label">необязательно</span><input value={personDraft.phone} onChange={(event) => setPersonDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                ) : null}

                {(hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) || personDraft.role === 'member' ? (
                  <>
                    <label>
                      Группа
                      <select
                        required
                        value={personDraft.groupId}
                        onChange={(event) =>
                          setPersonDraft((current) => ({
                            ...current,
                            groupId: event.target.value
                          }))
                        }
                      >
                        <option value="">Выберите группу</option>
                        {visibleGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.activity} · {group.days} {group.time}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="inline-hint invite-form-hint">
                      Ученик сам создаст логин и пароль по ссылке. После регистрации он автоматически появится в этой группе.
                    </p>
                  </>
                ) : null}

                <button className="primary-button" type="submit">
                  {(hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) || personDraft.role === 'member' ? 'Создать приглашение' : 'Добавить тренера'}
                </button>

                {memberInvite &&
                ((hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
                  personDraft.role === 'member') ? (
                  <div className="invite-result">
                    <div>
                      <strong>Ссылка для группы {memberInvite.groupName}</strong>
                      <span>
                        Действует до {new Date(memberInvite.expiresAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    <input aria-label="Ссылка-приглашение" readOnly value={memberInvite.inviteUrl} />
                    <div className="invite-result-actions">
                      <button className="ghost-button" type="button" onClick={() => void copyMemberInvite()}>
                        <Copy size={17} /> Копировать
                      </button>
                      <button className="primary-button" type="button" onClick={() => void shareMemberInvite()}>
                        <Share2 size={17} /> Поделиться
                      </button>
                    </div>
                  </div>
                ) : null}
              </form>
            ) : null}
          </section>
        ) : null}

        {activeSection === 'payments' && hasRole(activeUser, 'member') ? (
          <section className="member-payment-page">
            <div className="crm-panel member-payment-focus">
              <div className="payment-split-overview">
                <section className="payment-current-card">
                  <div className="payment-card-heading">
                    <span>Мой счёт</span>
                    <span className={`status-pill ${activeMemberPayment?.status ?? 'not-set'}`}>
                      {statusLabels[activeMemberPayment?.status ?? 'not-set']}
                    </span>
                  </div>
                  <strong>{activeMemberPayment ? formatMoney(activeMemberPayment.amount) : 'Не назначен'}</strong>
                  <dl>
                    <div>
                      <dt>Период</dt>
                      <dd>{activeMemberPayment?.period_label ?? 'Текущий период'}</dd>
                    </div>
                    <div>
                      <dt>Оплатить до</dt>
                      <dd>{formatShortDate(activeMemberPayment?.due_date)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="payment-plan-card">
                  <div className="payment-card-heading">
                    <span>Условия</span>
                    <strong>{activeMemberPlan ? 'Настроены' : 'Не настроены'}</strong>
                  </div>
                  <dl>
                    <div><dt>Схема</dt><dd>{activeMemberPlan ? planLabels[activeMemberPlan.type] : '—'}</dd></div>
                    <div>
                      <dt>Формат</dt>
                      <dd>{activeMemberPlan?.type === 'monthly' ? formatLabels[activeMemberPlan.trainingFormat] : '—'}</dd>
                    </div>
                    <div><dt>Базовая сумма</dt><dd>{activeMemberPlan ? formatMoney(activeMemberPlan.baseAmount) : '—'}</dd></div>
                    <div><dt>Тренер</dt><dd>{activeMemberTrainer ? `${activeMemberTrainer.first_name} ${activeMemberTrainer.last_name}` : '—'}</dd></div>
                  </dl>
                </section>
              </div>

              {activeMemberPayment && canSubmitPayment(activeMemberPayment) ? (
                <div className="member-payment-controls">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isPendingAction(`submit-payment:${activeMemberPayment.id}`)}
                    onClick={() => submitPaymentConfirmation(activeMemberPayment.id)}
                  >
                    Я оплатил
                  </button>
                  <div className="payment-delay-form">
                    <div className="payment-detail-section-heading"><h3>Нужна отсрочка?</h3></div>
                    <label>
                      Новая дата
                      <input
                        min={todayString()}
                        type="date"
                        value={delayDraftFor(activeMemberPayment).requestedDate}
                        onChange={(event) => updateDelayDraft(activeMemberPayment.id, { requestedDate: event.target.value })}
                      />
                    </label>
                    <label>
                      Комментарий
                      <input
                        placeholder="Необязательно"
                        value={delayDraftFor(activeMemberPayment).comment}
                        onChange={(event) => updateDelayDraft(activeMemberPayment.id, { comment: event.target.value })}
                      />
                    </label>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={isPendingAction(`request-delay:${activeMemberPayment.id}`)}
                      onClick={() => requestPaymentDelay(activeMemberPayment.id)}
                    >
                      Запросить отсрочку
                    </button>
                  </div>
                </div>
              ) : null}

              {activeMemberPayment && paymentLockedText(activeMemberPayment) ? (
                <div className="payment-info-card">
                  <strong>Оплата ещё не открыта</strong>
                  <span>
                    {paymentLockedText(activeMemberPayment)}
                    <button type="button" onClick={() => openPrepayment(activeMemberPayment)}>
                      предоплату
                    </button>
                    .
                  </span>
                </div>
              ) : null}

              {activeMemberPayment && canSubmitPrepayment(activeMemberPayment) ? (
                <div className="payment-prepay-card" id={`prepayment-${activeMemberPayment.id}`}>
                  <div>
                    <strong>Предоплата</strong>
                    <span>Можно закрыть один или несколько месяцев одним платежом.</span>
                  </div>
                  <div className="prepay-months" aria-label="Количество месяцев предоплаты">
                    {[1, 2, 3].map((months) => (
                      <button
                        className={prepaymentMonthsFor(activeMemberPayment.id) === months ? 'active' : ''}
                        key={months}
                        type="button"
                        onClick={() =>
                          setPrepaymentMonths((current) => ({
                            ...current,
                            [activeMemberPayment.id]: months
                          }))
                        }
                      >
                        {months} мес.
                      </button>
                    ))}
                  </div>
                  <div className="prepay-total">
                    <span>{prepaymentPeriodLabel(activeMemberPayment.due_date, prepaymentMonthsFor(activeMemberPayment.id))}</span>
                    <strong>
                      {formatMoney(
                        Number(activeMemberPlan?.baseAmount ?? activeMemberPayment.amount) *
                        prepaymentMonthsFor(activeMemberPayment.id)
                      )}
                    </strong>
                  </div>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={isPendingAction(`submit-prepayment:${activeMemberPayment.id}`)}
                    onClick={() => submitPrepayment(activeMemberPayment.id)}
                  >
                    Отправить предоплату
                  </button>
                </div>
              ) : null}

              {activeMemberPayment?.status === 'delay_requested' ? (
                <p className="payment-locked-note">
                  Запрос отсрочки до {formatShortDate(activeMemberPayment.delay_requested_date)} отправлен тренеру.
                </p>
              ) : null}

              <div className="payment-detail-section">
                <button
                  className="payment-history-toggle"
                  type="button"
                  onClick={() =>
                    setHistoryOpenByMember((current) => ({
                      ...current,
                      [activeUser.id]: !activeMemberHistoryOpen
                    }))
                  }
                >
                  <span>
                    <strong>История оплат</strong>
                    <small>{activeMemberPaymentHistory.length} записей</small>
                  </span>
                  <ChevronRight className={activeMemberHistoryOpen ? 'open' : ''} size={18} />
                </button>
                {activeMemberHistoryOpen ? (
                  <div className="payment-detail-history">
                    {activeMemberPaymentHistory.map((payment) => (
                      <div key={payment.id}>
                        <span>{payment.period_label ?? payment.due_date}</span>
                        <strong>{formatMoney(payment.amount)}</strong>
                      </div>
                    ))}
                    {activeMemberPaymentHistory.length === 0 ? <p>Оплат пока нет.</p> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeSection === 'payments' && !hasRole(activeUser, 'member') ? (
          <section className="payments-workspace">
            <div className="crm-panel payments-registry">
              <div className="payments-toolbar">
                <div className="payment-view-tabs" role="tablist" aria-label="Фильтр оплат">
                  <button className={paymentView === 'all' ? 'active' : ''} type="button" onClick={() => setPaymentView('all')}>
                    Все <span>{visibleMembers.length}</span>
                  </button>
                  <button className={paymentView === 'actions' ? 'active' : ''} type="button" onClick={() => setPaymentView('actions')}>
                    Действия <span>{paymentActionCount}</span>
                  </button>
                  <button className={paymentView === 'overdue' ? 'active' : ''} type="button" onClick={() => setPaymentView('overdue')}>
                    Просрочено <span>{overduePayments.length}</span>
                  </button>
                  <button className={paymentView === 'paid' ? 'active' : ''} type="button" onClick={() => setPaymentView('paid')}>
                    История
                  </button>
                </div>
                <label className="payments-search">
                  <Search size={17} />
                  <input
                    aria-label="Поиск ученика"
                    placeholder="Найти ученика"
                    value={paymentSearch}
                    onChange={(event) => setPaymentSearch(event.target.value)}
                  />
                </label>
              </div>

              {paymentView === 'paid' ? (
                <div className="payments-history-list">
                  {paidPaymentResults.map((payment) => (
                      <button
                        className="payment-registry-row history"
                        key={payment.id}
                        type="button"
                        onClick={() => {
                          setSelectedPaymentMemberId(payment.member_id);
                          setPaymentEditOpen(false);
                        }}
                      >
                        <div className="payment-person">
                          <strong>{userName(payment.member_id)}</strong>
                          <span>{payment.period_label ?? payment.due_date}</span>
                        </div>
                        <strong className="payment-amount">{formatMoney(payment.amount)}</strong>
                        <span className="payment-due">{payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('ru-RU') : 'Подтверждено'}</span>
                        <span className="status-pill paid">Оплачено</span>
                        <ChevronRight className="payment-row-arrow" size={18} />
                      </button>
                    ))}
                  {paidPaymentResults.length === 0 ? (
                    <p className="empty-state">
                      {paymentSearch.trim()
                        ? 'По этому поиску подтверждённых оплат нет.'
                        : 'Подтверждённых оплат пока нет.'}
                    </p>
                  ) : null}
                </div>
              ) : paymentView === 'actions' ? (
                <div className="payment-action-groups">
                  {visiblePaymentActionGroups.map((group) => {
                    const groupOpen = paymentActionGroupsOpen[group.id] ?? group.members.length > 0;
                    return (
                      <section className={`payment-action-group ${groupOpen ? 'open' : ''}`} key={group.id}>
                        <button
                          className="payment-action-group-header"
                          type="button"
                          onClick={() =>
                            setPaymentActionGroupsOpen((current) => ({
                              ...current,
                              [group.id]: !groupOpen
                            }))
                          }
                        >
                          <ChevronRight className={groupOpen ? 'open' : ''} size={18} />
                          <div>
                            <h3>{group.title}</h3>
                            <p>{group.description}</p>
                          </div>
                          <strong>{group.members.length}</strong>
                        </button>
                        {groupOpen && group.members.length > 0 ? (
                        <div className="payment-registry-list compact">
                          {group.members.map((member) => renderPaymentRow(member))}
                        </div>
                        ) : null}
                      </section>
                    );
                  })}
                  {visiblePaymentActionGroups.length === 0 ? (
                    <p className="empty-state">
                      {paymentSearch.trim()
                        ? 'По этому поиску задач по оплатам нет.'
                        : 'Сейчас нет задач по оплатам.'}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="payment-registry-list">
                  <div className="payment-registry-head">
                    <span>Ученик</span>
                    <span>Сумма</span>
                    <span>Срок</span>
                    <span>Статус</span>
                    <span />
                  </div>
                  {filteredPaymentMembers.map((member) => renderPaymentRow(member))}
                  {filteredPaymentMembers.length === 0 ? (
                    <p className="empty-state">
                      {visibleMembers.length === 0 ? 'Ученики ещё не добавлены.' : 'По этому фильтру оплат нет.'}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {selectedPaymentMember ? (
              <>
                <button
                  className="payment-drawer-backdrop"
                  aria-label="Закрыть детали оплаты"
                  type="button"
                  onClick={() => setSelectedPaymentMemberId('')}
                />
                <aside className="payment-drawer" aria-label={`Оплата: ${userName(selectedPaymentMember.id)}`}>
                  <div className="payment-drawer-header">
                    <div>
                      <span>Оплата ученика</span>
                      <h2>{userName(selectedPaymentMember.id)}</h2>
                      <p>
                        {selectedPaymentGroup?.activity ?? 'Без группы'}
                        {selectedPayment?.period_label ? ` · ${selectedPayment.period_label}` : ''}
                      </p>
                    </div>
                    <button className="icon-button" aria-label="Закрыть" type="button" onClick={() => setSelectedPaymentMemberId('')}>
                      <X size={20} />
                    </button>
                  </div>

                  <div className="payment-drawer-body">
                    <div className="payment-split-overview">
                      <section className="payment-current-card">
                        <div className="payment-card-heading">
                          <span>Текущий счёт</span>
                          <span className={`status-pill ${selectedPayment?.status ?? 'not-set'}`}>{statusLabels[selectedPayment?.status ?? 'not-set']}</span>
                        </div>
                        <strong>{selectedPayment ? formatMoney(selectedPayment.amount) : 'Не назначен'}</strong>
                        <dl>
                          <div>
                            <dt>Период</dt>
                            <dd>{selectedPayment?.period_label ?? 'Текущий период'}</dd>
                          </div>
                          <div>
                            <dt>Оплатить до</dt>
                            <dd>{formatShortDate(selectedPayment?.due_date)}</dd>
                          </div>
                        </dl>
                      </section>

                      <section className="payment-plan-card">
                        <div className="payment-card-heading">
                          <span>Условия оплаты</span>
                          <strong>{selectedPaymentPlan ? 'Настроены' : 'Не настроены'}</strong>
                        </div>
                        <dl>
                          <div>
                            <dt>Схема</dt>
                            <dd>{selectedPaymentPlan ? planLabels[selectedPaymentPlan.type] : '—'}</dd>
                          </div>
                          <div>
                            <dt>Формат</dt>
                            <dd>
                              {selectedPaymentPlan?.type === 'monthly'
                                ? formatLabels[selectedPaymentPlan.trainingFormat]
                                : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>Базовая сумма</dt>
                            <dd>
                              {selectedPaymentPlan ? formatMoney(selectedPaymentPlan.baseAmount) : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>День оплаты</dt>
                            <dd>
                              {selectedPaymentPlan?.billingDay
                                ? `${selectedPaymentPlan.billingDay} число`
                                : selectedPaymentPlan?.type === 'one_time'
                                  ? 'Разово'
                                  : '—'}
                            </dd>
                          </div>
                        </dl>
                      </section>
                    </div>

                    {(hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')) && !paymentEditOpen ? (
                      <button className="ghost-button payment-edit-trigger" type="button" onClick={() => setPaymentEditOpen(true)}>
                        {selectedPayment ? 'Редактировать оплату' : 'Назначить оплату'}
                      </button>
                    ) : null}

                    {(hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')) && paymentEditOpen ? (
                      <div className="payment-edit-form">
                        <div className="payment-detail-section-heading">
                          <h3>{selectedPayment ? 'Редактировать счёт' : 'Назначить счёт'}</h3>
                          <button className="text-button" type="button" onClick={() => setPaymentEditOpen(false)}>Отмена</button>
                        </div>
                        <div className="split-fields">
                          <label>
                            Сумма счёта
                            <input
                              min="1"
                              step="0.01"
                              type="number"
                              value={paymentEditFor(selectedPaymentMember.id).currentAmount}
                              onChange={(event) => updatePaymentEdit(selectedPaymentMember.id, { currentAmount: event.target.value })}
                            />
                          </label>
                          <label>
                            Оплатить до
                            <input
                              type="date"
                              value={paymentEditFor(selectedPaymentMember.id).dueDate}
                              onChange={(event) => updatePaymentEdit(selectedPaymentMember.id, { dueDate: event.target.value })}
                            />
                          </label>
                        </div>
                        <details className="payment-plan-options">
                          <summary>
                            <span>
                              Условия на будущее
                              <small>Схема, формат и повторение</small>
                            </span>
                            <ChevronRight size={17} />
                          </summary>
                          <div className="payment-plan-options-body">
                            <label>
                              Схема
                              <select
                                value={paymentEditFor(selectedPaymentMember.id).type}
                                onChange={(event) => updatePaymentEdit(selectedPaymentMember.id, { type: event.target.value as BillingPlanType })}
                              >
                                <option value="monthly">Абонемент</option>
                                <option value="one_time">Разовая</option>
                              </select>
                            </label>
                            {paymentEditFor(selectedPaymentMember.id).type === 'monthly' ? (
                              <label>
                                Формат
                                <select
                                  value={paymentEditFor(selectedPaymentMember.id).trainingFormat}
                                  onChange={(event) => updatePaymentEdit(selectedPaymentMember.id, { trainingFormat: event.target.value as TrainingFormat })}
                                >
                                  <option value="group">Группа</option>
                                  <option value="individual">Индивидуально</option>
                                </select>
                              </label>
                            ) : null}
                            {paymentEditFor(selectedPaymentMember.id).type !== 'one_time' ? (
                              <label className="payment-future-toggle">
                                <input
                                  checked={paymentEditFor(selectedPaymentMember.id).updateFuture}
                                  type="checkbox"
                                  onChange={(event) => updatePaymentEdit(selectedPaymentMember.id, { updateFuture: event.target.checked })}
                                />
                                Использовать эту сумму в следующих месяцах
                              </label>
                            ) : null}
                          </div>
                        </details>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={isPendingAction(`save-payment:${selectedPaymentMember.id}`)}
                          onClick={() => void saveMemberPayment(selectedPaymentMember.id)}
                        >
                          {buttonLabel(`save-payment:${selectedPaymentMember.id}`, selectedPayment ? 'Сохранить изменения' : 'Назначить оплату')}
                        </button>
                      </div>
                    ) : null}

                    {selectedPayment?.status === 'payment_confirmation' && (hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')) ? (
                      <div className="payment-decision-card">
                        <div>
                          <strong>Ученик сообщил об оплате</strong>
                          <span>Проверьте поступление и примите решение.</span>
                        </div>
                        <div className="payment-primary-actions">
                          <button className="primary-button" type="button" disabled={isPendingAction(`decide-payment:${selectedPayment.id}`)} onClick={() => updatePaymentStatus(selectedPayment.id, 'paid')}>
                            Подтвердить
                          </button>
                          <button className="ghost-button" type="button" disabled={isPendingAction(`decide-payment:${selectedPayment.id}`)} onClick={() => updatePaymentStatus(selectedPayment.id, 'active')}>
                            Отклонить
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {selectedPayment?.status === 'delay_requested' && (hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')) ? (
                      <div className="payment-decision-card">
                        <div>
                          <strong>Запрошена отсрочка до {formatShortDate(selectedPayment.delay_requested_date)}</strong>
                          <span>{selectedPayment.delay_comment || 'Без комментария'}</span>
                        </div>
                        <div className="payment-primary-actions">
                          <button className="primary-button" type="button" disabled={isPendingAction(`decide-delay:${selectedPayment.id}`)} onClick={() => decidePaymentDelay(selectedPayment.id, true)}>
                            Одобрить
                          </button>
                          <button className="ghost-button" type="button" disabled={isPendingAction(`decide-delay:${selectedPayment.id}`)} onClick={() => decidePaymentDelay(selectedPayment.id, false)}>
                            Отклонить
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {hasRole(activeUser, 'member') && selectedPayment && canSubmitPayment(selectedPayment) ? (
                      <div className="member-payment-controls">
                        <button className="primary-button" type="button" disabled={isPendingAction(`submit-payment:${selectedPayment.id}`)} onClick={() => submitPaymentConfirmation(selectedPayment.id)}>
                          Я оплатил
                        </button>
                        <div className="payment-delay-form">
                          <div className="payment-detail-section-heading"><h3>Нужна отсрочка?</h3></div>
                          <label>
                            Новая дата
                            <input
                              min={todayString()}
                              type="date"
                              value={delayDraftFor(selectedPayment).requestedDate}
                              onChange={(event) => updateDelayDraft(selectedPayment.id, { requestedDate: event.target.value })}
                            />
                          </label>
                          <label>
                            Комментарий
                            <input
                              placeholder="Необязательно"
                              value={delayDraftFor(selectedPayment).comment}
                              onChange={(event) => updateDelayDraft(selectedPayment.id, { comment: event.target.value })}
                            />
                          </label>
                          <button className="ghost-button" type="button" disabled={isPendingAction(`request-delay:${selectedPayment.id}`)} onClick={() => requestPaymentDelay(selectedPayment.id)}>
                            Запросить отсрочку
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {hasRole(activeUser, 'member') && selectedPayment && paymentLockedText(selectedPayment) ? (
                      <div className="payment-info-card">
                        <strong>Оплата ещё не открыта</strong>
                        <span>
                          {paymentLockedText(selectedPayment)}
                          <button type="button" onClick={() => openPrepayment(selectedPayment)}>
                            предоплату
                          </button>
                          .
                        </span>
                      </div>
                    ) : null}

                    {selectedPayment && canSubmitPrepayment(selectedPayment) ? (
                      <div className="payment-prepay-card" id={`prepayment-${selectedPayment.id}`}>
                        <div>
                          <strong>Предоплата</strong>
                          <span>Можно оплатить раньше срока или закрыть несколько месяцев одним платежом.</span>
                        </div>
                        <div className="prepay-months" aria-label="Количество месяцев предоплаты">
                          {[1, 2, 3].map((months) => (
                            <button
                              className={prepaymentMonthsFor(selectedPayment.id) === months ? 'active' : ''}
                              key={months}
                              type="button"
                              onClick={() =>
                                setPrepaymentMonths((current) => ({
                                  ...current,
                                  [selectedPayment.id]: months
                                }))
                              }
                            >
                              {months} мес.
                            </button>
                          ))}
                        </div>
                        <div className="prepay-total">
                          <span>{prepaymentPeriodLabel(selectedPayment.due_date, prepaymentMonthsFor(selectedPayment.id))}</span>
                          <strong>
                            {formatMoney(
                              Number(selectedPaymentPlan?.baseAmount ?? selectedPayment.amount) *
                              prepaymentMonthsFor(selectedPayment.id)
                            )}
                          </strong>
                        </div>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={isPendingAction(`submit-prepayment:${selectedPayment.id}`)}
                          onClick={() => submitPrepayment(selectedPayment.id)}
                        >
                          Отправить предоплату
                        </button>
                      </div>
                    ) : null}

                    <div className="payment-detail-section">
                      <div className="payment-detail-section-heading">
                        <h3>Ответственность</h3>
                      </div>
                      <dl className="payment-detail-list">
                        <div><dt>Группа</dt><dd>{selectedPaymentGroup?.activity ?? 'Без группы'}</dd></div>
                        <div><dt>Тренер</dt><dd>{selectedPaymentTrainer ? `${selectedPaymentTrainer.first_name} ${selectedPaymentTrainer.last_name}` : '—'}</dd></div>
                      </dl>
                    </div>

                    <div className="payment-detail-section">
                      <button
                        className="payment-history-toggle"
                        type="button"
                        onClick={() =>
                          setHistoryOpenByMember((current) => ({
                            ...current,
                            [selectedPaymentMember.id]: !selectedPaymentHistoryOpen
                          }))
                        }
                      >
                        <span>
                          <strong>История оплат</strong>
                          <small>{selectedPaymentHistory.length} записей</small>
                        </span>
                        <ChevronRight
                          className={selectedPaymentHistoryOpen ? 'open' : ''}
                          size={18}
                        />
                      </button>
                      {selectedPaymentHistoryOpen ? (
                        <div className="payment-detail-history">
                          {selectedPaymentHistory.map((payment) => (
                            <div key={payment.id}>
                              <span>{payment.period_label ?? payment.due_date}</span>
                              <strong>{formatMoney(payment.amount)}</strong>
                            </div>
                          ))}
                          {selectedPaymentHistory.length === 0 ? <p>Оплат пока нет.</p> : null}
                        </div>
                      ) : null}
                    </div>

                    {(hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')) && selectedPayment && selectedPayment.status !== 'paid' ? (
                      <details className="payment-more-actions">
                        <summary><MoreHorizontal size={18} /> Другие действия</summary>
                        <button className="ghost-button danger" type="button" disabled={isPendingAction(`delete-payment:${selectedPayment.id}`)} onClick={() => void deleteMemberPayment(selectedPayment)}>
                          Удалить счёт
                        </button>
                      </details>
                    ) : null}
                  </div>
                </aside>
              </>
            ) : null}
          </section>
        ) : null}

        {activeSection === 'groups' && !hasRole(activeUser, 'member') ? (
          <section className="crm-content-grid">
            <div className="crm-panel">
              <div className="crm-panel-header">
                <div>
                  <h2>{hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'Мои группы' : 'Группы клуба'}</h2>
                  <p>Направление сразу определяет расписание учеников</p>
                </div>
              </div>
              <div className="group-list">
                {visibleGroups.map((group) => {
                  const trainer = workspace.users.find((user) => user.id === group.trainerId);
                  const memberCount = workspace.groupMembers.filter(
                    (assignment) => assignment.groupId === group.id
                  ).length;
                  return (
                    <article className="group-row" key={group.id}>
                      <div className="group-activity">
                        <strong>{group.activity}</strong>
                        <span>{trainer ? `${trainer.first_name} ${trainer.last_name}` : 'Без тренера'}</span>
                      </div>
                      <div><span>Дни</span><strong>{group.days}</strong></div>
                      <div><span>Время</span><strong>{group.time}</strong></div>
                      <div><span>Ученики</span><strong>{memberCount}</strong></div>
                      <div><span>Комментарий</span><strong>{group.note || '—'}</strong></div>
                      {hasRole(activeUser, 'trainer') ? (
                        <div className="row-actions">
                          <button className="small-button" type="button" onClick={() => startGroupEdit(group)}>
                            Редактировать
                          </button>
                          <button
                            className="small-button secondary"
                            type="button"
                            disabled={isPendingAction(`delete-group:${group.id}`)}
                            onClick={() => deleteGroup(group.id)}
                          >
                            {buttonLabel(`delete-group:${group.id}`, 'Удалить')}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {visibleGroups.length === 0 ? (
                  <p className="empty-state">Групп пока нет. Создайте первую справа.</p>
                ) : null}
              </div>
            </div>

            {hasRole(activeUser, 'trainer') ? (
              <form className={`crm-panel crm-side-form form-stack${mobileFormOpen ? ' mobile-form-open' : ''}`} onSubmit={createGroup}>
                <div className="crm-panel-header">
                  <div>
                    <h2>Новая группа</h2>
                    <p>Одно направление и расписание</p>
                  </div>
                  <Plus size={20} />
                </div>
                {hasRole(activeUser, 'owner') ? (
                  <label>
                    Ответственный тренер
                    <select
                      required
                      value={groupDraft.trainerId}
                      onChange={(event) =>
                        setGroupDraft((current) => ({
                          ...current,
                          trainerId: event.target.value
                        }))
                      }
                    >
                      <option value="">Выберите тренера</option>
                      {trainers.map((trainer) => (
                        <option key={trainer.id} value={trainer.id}>
                          {userName(trainer.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Вид деятельности
                  <input
                    placeholder="Например, ММА или грепплинг"
                    required
                    value={groupDraft.activity}
                    onChange={(event) =>
                      setGroupDraft((current) => ({
                        ...current,
                        activity: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Дни
                  <div className="weekday-grid">
                    {weekDays.map((day) => {
                      const selected = groupDraft.days.split(', ').includes(day);
                      return (
                        <label key={day} className="weekday-checkbox">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleGroupDay(day)}
                          />
                          {day}
                        </label>
                      );
                    })}
                  </div>
                </label>
                <label>
                  Время
                  <input
                    type="time"
                    required
                    value={groupDraft.time}
                    onChange={(event) =>
                      setGroupDraft((current) => ({ ...current, time: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Комментарий <span className="optional-label">необязательно</span>
                  <input
                    placeholder="Зал, возраст или уровень"
                    value={groupDraft.note}
                    onChange={(event) =>
                      setGroupDraft((current) => ({ ...current, note: event.target.value }))
                    }
                  />
                </label>
                <div className="form-actions full-width-actions">
                  <button
                    className="primary-button full-width-button"
                    type="submit"
                    disabled={isPendingAction(`save-group:${editingGroupId || 'new'}`)}
                  >
                    {buttonLabel(`save-group:${editingGroupId || 'new'}`, editingGroupId ? 'Сохранить группу' : 'Создать группу')}
                  </button>
                  {editingGroupId ? (
                    <button className="small-button secondary" type="button" onClick={cancelGroupEdit}>
                      Отменить
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        {activeSection === 'schedule' ? (
          <section className="crm-panel">
            <div className="crm-panel-header">
              <div>
                <h2>{activeUser.role === 'member' ? 'Моё расписание' : 'Расписание учеников'}</h2>
                <p>
                  {activeUser.role === 'member'
                    ? 'Актуальные дни и время тренировок'
                    : 'Одна понятная строка расписания на ученика'}
                </p>
              </div>
            </div>

            {activeUser.role === 'member' ? (
              <div className="member-schedule-detail">
                <div>
                  <span>Направление</span>
                  <strong>{activeMemberGroup?.activity ?? 'Не назначено'}</strong>
                </div>
                <div>
                  <span>Дни</span>
                  <strong>{activeMemberSchedule?.days ?? 'Не назначены'}</strong>
                </div>
                <div>
                  <span>Время</span>
                  <strong>{activeMemberSchedule?.time ?? 'Не назначено'}</strong>
                </div>
                <div>
                  <span>Тренер</span>
                  <strong>
                    {activeMemberTrainer
                      ? `${activeMemberTrainer.first_name} ${activeMemberTrainer.last_name}`
                      : 'Не назначен'}
                  </strong>
                </div>
                <div>
                  <span>Комментарий</span>
                  <strong>{activeMemberSchedule?.note || 'Нет комментария'}</strong>
                </div>
              </div>
            ) : (
              <div className="schedule-table">
                <div className="schedule-head">
                  <span>Ученик</span><span>Дни</span><span>Время</span><span>Комментарий</span><span>Действие</span>
                </div>
                {visibleMembers.map((member) => {
                  const edit = scheduleEditFor(member.id);
                  return (
                    <div className="schedule-row" key={member.id}>
                      <div>
                        <strong>{userName(member.id)}</strong>
                        <span>{trainerFor(member.id)?.first_name ?? 'Без тренера'}</span>
                      </div>
                      <input
                        placeholder="Пн, Ср, Пт"
                        value={edit.days}
                        onChange={(event) =>
                          updateScheduleEdit(member.id, { days: event.target.value })
                        }
                      />
                      <input
                        placeholder="18:00"
                        value={edit.time}
                        onChange={(event) =>
                          updateScheduleEdit(member.id, { time: event.target.value })
                        }
                      />
                      <input
                        placeholder="Зал или группа"
                        value={edit.note}
                        onChange={(event) =>
                          updateScheduleEdit(member.id, { note: event.target.value })
                        }
                      />
                      <button
                        className="small-button"
                        type="button"
                        onClick={() => saveSchedule(member.id)}
                      >
                        Сохранить
                      </button>
                    </div>
                  );
                })}
                {visibleMembers.length === 0 ? (
                  <p className="empty-state">Ученики ещё не добавлены.</p>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        {activeSection === 'expenses' && activeUser.role === 'owner' ? (
          <section className="crm-content-grid">
            <div className="crm-panel">
              <div className="crm-panel-header">
                <div>
                  <h2>Расходы клуба</h2>
                  <p>К оплате: {formatMoney(pendingExpenses)}</p>
                </div>
              </div>
              <div className="expense-table">
                <div className="expense-head">
                  <span>Расход</span><span>Тип</span><span>Сумма</span><span>Срок</span><span>Статус</span>
                </div>
                {currentExpenses.map((expense) => (
                  <div className="expense-row" key={expense.id}>
                    <div>
                      <strong>{expense.name}</strong>
                      <span>{expense.periodLabel}</span>
                    </div>
                    <span>{expense.type === 'recurring' ? 'Базовый ежемесячный' : 'Разовый'}</span>
                    <strong>{formatMoney(expense.amount)}</strong>
                    <span>{expense.dueDate}</span>
                    <button className="small-button" type="button" onClick={() => markExpensePaid(expense.id)}>
                      Отметить оплаченным
                    </button>
                  </div>
                ))}
                {currentExpenses.length === 0 ? (
                  <p className="empty-state">Текущих расходов пока нет.</p>
                ) : null}
              </div>

              <div className="payment-history">
                <div className="crm-panel-header">
                  <div>
                    <h2>История расходов</h2>
                    <p>Всего оплачено: {formatMoney(paidExpenses)}</p>
                  </div>
                </div>
                {[...workspace.expenses]
                  .filter((expense) => expense.status === 'paid')
                  .reverse()
                  .map((expense) => (
                    <div className="payment-history-row" key={expense.id}>
                      <div>
                        <strong>{expense.name}</strong>
                        <span>{expense.periodLabel}</span>
                      </div>
                      <strong>{formatMoney(expense.amount)}</strong>
                      <span>
                        {expense.paidAt
                          ? new Date(expense.paidAt).toLocaleDateString('ru-RU')
                          : 'Оплачено'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <form className="crm-panel crm-side-form form-stack" onSubmit={createExpense}>
              <div className="crm-panel-header">
                <div>
                  <h2>Новый расход</h2>
                  <p>Добавить обязательство клуба</p>
                </div>
                <Plus size={20} />
              </div>
              <label>
                Название
                <input
                  placeholder="Например, аренда"
                  required
                  value={expenseDraft.name}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                Сумма
                <input
                  min="1"
                  required
                  step="0.01"
                  type="number"
                  value={expenseDraft.amount}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <label>
                Срок оплаты
                <input
                  required
                  type="date"
                  value={expenseDraft.dueDate}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                />
              </label>
              <label>
                Тип расхода
                <select
                  value={expenseDraft.type}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      type: event.target.value as ExpenseDraft['type']
                    }))
                  }
                >
                  <option value="recurring">Базовый ежемесячный</option>
                  <option value="one_time">Разовый</option>
                </select>
              </label>
              <button className="primary-button" type="submit">
                Добавить расход
              </button>
            </form>
          </section>
        ) : null}

        {activeSection === 'notifications' ? (
          <section className="crm-panel">
            <div className="crm-panel-header">
              <div>
                <h2>Журнал уведомлений</h2>
                <p>Сообщения для текущего пользователя</p>
              </div>
              {unreadNotifications.length > 0 ? <button className="small-button secondary" type="button" onClick={markNotificationsRead}>Отметить прочитанными</button> : null}
            </div>
            <div className="notification-list">
              {[...userNotifications].reverse().map((notification) => (
                <article className={notification.read ? 'notification-row' : 'notification-row unread'} key={notification.id}>
                  <Bell size={18} />
                  <div><strong>{notification.message}</strong><span>{new Date(notification.createdAt).toLocaleString('ru-RU')}</span></div>
                  {notification.paymentId ? (
                    <button
                      className="small-button secondary"
                      type="button"
                      onClick={() => openNotificationPayment(notification.paymentId)}
                    >
                      Открыть
                    </button>
                  ) : null}
                </article>
              ))}
              {userNotifications.length === 0 ? <p className="empty-state">Уведомлений пока нет.</p> : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function NavButton({
  active,
  count,
  icon,
  label,
  onClick
}: {
  active: boolean;
  count?: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button className={active ? 'crm-nav-button active' : 'crm-nav-button'} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
      {count ? <strong>{count}</strong> : null}
    </button>
  );
}
