'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Plus,
  RotateCcw,
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
  type LocalTrainingGroup,
  type LocalTrainingSchedule,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat
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
  const source = new Date(`${date}T12:00:00`);
  const year = source.getMonth() === 11 ? source.getFullYear() + 1 : source.getFullYear();
  const month = (source.getMonth() + 1) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(billingDay ?? source.getDate(), lastDay);

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function periodLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`)
  );
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
  const [editingGroupId, setEditingGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [mobileFormOpen, setMobileFormOpen] = useState(false);

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

    const response = await fetch('/api/workspace', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const data = (await response.json()) as {
      workspace?: LocalWorkspace;
      activeUserId?: string;
      error?: string;
    };

    if (!response.ok || !data.workspace || !data.activeUserId) {
      setMessage(data.error ?? 'Не удалось загрузить данные клуба.');
      return;
    }

    setWorkspace(data.workspace);
    setActiveUserId(data.activeUserId);
  }

  async function runRemoteAction(payload: Record<string, unknown>): Promise<boolean> {
    const supabase = getSupabaseClient();
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) {
      window.location.href = '/login';
      return false;
    }

    const response = await fetch('/api/workspace/actions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? 'Не удалось выполнить действие.');
      return false;
    }

    await loadRemoteWorkspace();
    return true;
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
      const success = await runRemoteAction({
        action: 'create_user',
        role: effectiveRole,
        firstName: personDraft.firstName,
        lastName: personDraft.lastName,
        username: personDraft.username,
        password: personDraft.password,
        phone: personDraft.phone,
        groupId: personDraft.groupId,
        paymentType: personDraft.paymentType,
        trainingFormat: personDraft.trainingFormat,
        amount: Number(personDraft.initialAmount) || undefined,
        dueDate: personDraft.initialDueDate || undefined
      });
      if (success) {
        setPersonDraft(emptyPersonDraft);
        setMobileFormOpen(false);
        setMessage(effectiveRole === 'member' ? 'Ученик создан.' : 'Тренер создан.');
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
      const success = await runRemoteAction({
        action: 'save_group',
        id: editingGroupId || undefined,
        trainerId,
        activity: groupDraft.activity,
        days: groupDraft.days,
        time: groupDraft.time,
        note: groupDraft.note
      });
      if (success) {
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
      const success = await runRemoteAction({ action: 'delete_group', groupId });
      if (success) {
        if (editingGroupId === groupId) cancelGroupEdit();
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

    const group = workspace.groups.find((item) => item.id === groupId);
    if (!group) return;

    if (!isLocalMode) {
      const success = await runRemoteAction({
        action: 'assign_member_group',
        memberId,
        groupId
      });
      if (success) setMessage('Ученик назначен в группу.');
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

  async function saveMemberPayment(memberId: string): Promise<void> {
    if (!workspace || !activeUser) return;

    const edit = paymentEdits[memberId];
    const assignment = workspace.assignments.find((item) => item.member_id === memberId);
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
      const success = await runRemoteAction({
        action: 'save_payment',
        memberId,
        type: edit.type,
        trainingFormat: edit.trainingFormat,
        amount: calculatedAmount,
        dueDate: edit.dueDate,
        updateFuture: edit.updateFuture
      });
      if (success) {
        setPaymentEdits((current) => {
          const next = { ...current };
          delete next[memberId];
          return next;
        });
        setMessage('Оплата сохранена.');
      }
      return;
    }

    const existingPayment = workspace.payments.find(
      (payment) => payment.member_id === memberId && payment.is_current !== false
    );
    const existingPlan = workspace.billingPlans.find((plan) => plan.memberId === memberId && plan.active);
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

  async function updatePaymentStatus(paymentId: string, status: PaymentRequestStatus): Promise<void> {
    if (!workspace) return;

    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    if (!isLocalMode) {
      const success = await runRemoteAction({
        action: 'decide_payment',
        paymentId,
        approved: status === 'paid'
      });
      if (success) {
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
      shouldAdvance && payment ? nextMonthDate(payment.due_date, plan.billingDay) : null;
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
      const success = await runRemoteAction({
        action: 'request_delay',
        paymentId,
        requestedDate: draft.requestedDate,
        comment: draft.comment
      });
      if (success) setMessage('Запрос отсрочки отправлен.');
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
      const success = await runRemoteAction({
        action: 'decide_delay',
        paymentId,
        approved
      });
      if (success) setMessage(approved ? 'Отсрочка одобрена.' : 'Отсрочка отклонена.');
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

    if (!isLocalMode) {
      const success = await runRemoteAction({ action: 'submit_payment', paymentId });
      if (success) setMessage('Подтверждение отправлено ответственному лицу.');
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
          message: `${userName(payment.member_id)} сообщил об оплате ${Number(payment.amount).toFixed(2)} ₽.`,
          createdAt: now,
          read: false,
          paymentId
        }
      ]
    });
    setMessage('Подтверждение отправлено ответственному лицу.');
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
      await runRemoteAction({ action: 'mark_notifications_read' });
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
    const assignment = workspace.assignments.find((item) => item.member_id === memberId);
    return workspace.users.find((user) => user.id === assignment?.trainer_id) ?? null;
  }

  function groupFor(memberId: string): LocalTrainingGroup | null {
    if (!workspace) return null;
    const assignment = workspace.groupMembers.find((item) => item.memberId === memberId);
    return workspace.groups.find((group) => group.id === assignment?.groupId) ?? null;
  }

  function userName(userId: string): string {
    const user = workspace?.users.find((item) => item.id === userId);
    return user ? `${user.first_name} ${user.last_name}` : 'Неизвестно';
  }

  function paymentEditFor(memberId: string): PaymentEdit {
    const existingEdit = paymentEdits[memberId];
    if (existingEdit) return existingEdit;

    const payment = workspace?.payments.find(
      (item) => item.member_id === memberId && item.is_current !== false
    );
    const plan = workspace?.billingPlans.find((item) => item.memberId === memberId && item.active);
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
              count={peopleForView.length}
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
            count={currentPayments.filter((payment) => payment.status !== 'paid').length}
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
              count={visibleGroups.length}
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
                      ? `${Number(activeMemberPayment.amount).toFixed(2)} ₽`
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
                  {activeMemberPayment &&
                  ['active', 'overdue', 'delayed'].includes(activeMemberPayment.status) ? (
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
                <Metric label="Получено" value={`${paidAmount.toFixed(2)} ₽`} />
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
                          <strong>{Number(payment.amount).toFixed(0)} ₽</strong>
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
                  <p>{peopleForView.length} записей</p>
                </div>
              </div>
              <div className="crm-table">
                <div className="crm-table-head">
                  <span>Имя</span><span>Роль</span><span>Группа</span><span>Контакт</span>
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
                      onClick={() => setPersonDraft((current) => ({ ...current, role: 'trainer' }))}
                    >
                      Тренер
                    </button>
                    <button
                      className={personDraft.role === 'member' ? 'active' : ''}
                      disabled={visibleGroups.length === 0}
                      type="button"
                      onClick={() => setPersonDraft((current) => ({ ...current, role: 'member' }))}
                    >
                      Ученик
                    </button>
                  </div>
                ) : null}

                <label>Имя<input required value={personDraft.firstName} onChange={(event) => setPersonDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                <label>Фамилия<input required value={personDraft.lastName} onChange={(event) => setPersonDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                {!isLocalMode ? (
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
                <label>Телефон <span className="optional-label">необязательно</span><input value={personDraft.phone} onChange={(event) => setPersonDraft((current) => ({ ...current, phone: event.target.value }))} /></label>

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
                    <label>
                      Схема оплаты
                      <select
                        value={personDraft.paymentType}
                        onChange={(event) =>
                          setPersonDraft((current) => ({
                            ...current,
                            paymentType: event.target.value as BillingPlanType
                          }))
                        }
                      >
                        <option value="monthly">Абонемент</option>
                        <option value="one_time">Разовая оплата</option>
                      </select>
                    </label>
                    {personDraft.paymentType === 'monthly' ? (
                      <label>
                        Формат занятий
                        <select
                          value={personDraft.trainingFormat}
                          onChange={(event) =>
                            setPersonDraft((current) => ({
                              ...current,
                              trainingFormat: event.target.value as TrainingFormat
                            }))
                          }
                        >
                          <option value="group">Группа</option>
                          <option value="individual">Индивидуально</option>
                        </select>
                      </label>
                    ) : null}
                    <div className="split-fields">
                      <label>Сумма<input min="1" step="0.01" type="number" value={personDraft.initialAmount} onChange={(event) => setPersonDraft((current) => ({ ...current, initialAmount: event.target.value }))} /></label>
                      <label>Срок<input type="date" value={personDraft.initialDueDate} onChange={(event) => setPersonDraft((current) => ({ ...current, initialDueDate: event.target.value }))} /></label>
                    </div>
                  </>
                ) : null}

                <button className="primary-button" type="submit">
                  {(hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) || personDraft.role === 'member' ? 'Добавить ученика' : 'Добавить тренера'}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}

        {activeSection === 'payments' ? (
          <section className="crm-panel">
            <div className="crm-panel-header">
              <div>
                <h2>Реестр оплат</h2>
                <p>Одна текущая оплата на каждого ученика</p>
              </div>
            </div>
            <div className="crm-payment-table">
              <div className="crm-payment-head">
                <span>Ученик</span><span>Схема</span><span>Расчёт периода</span><span>Срок</span><span>Статус</span><span>Действие</span>
              </div>
              {visibleMembers.map((member) => {
                const payment = workspace.payments.find(
                  (item) => item.member_id === member.id && item.is_current !== false
                );
                const plan = workspace.billingPlans.find(
                  (item) => item.memberId === member.id && item.active
                );
                const edit = paymentEditFor(member.id);
                const canManage = hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer');
                return (
                  <div className="crm-payment-row" key={member.id}>
                    <div>
                      <strong>{userName(member.id)}</strong>
                      <span>{payment?.period_label ?? 'Текущий период'}</span>
                    </div>
                    {canManage ? (
                      <div className="payment-scheme-fields">
                        <span className="mobile-field-label">Схема</span>
                        <select
                          value={edit.type}
                          onChange={(event) =>
                            updatePaymentEdit(member.id, {
                              type: event.target.value as BillingPlanType
                            })
                          }
                        >
                          <option value="monthly">Абонемент</option>
                          <option value="one_time">Разовая</option>
                        </select>
                        {edit.type === 'monthly' ? (
                          <select
                            value={edit.trainingFormat}
                            onChange={(event) =>
                              updatePaymentEdit(member.id, {
                                trainingFormat: event.target.value as TrainingFormat
                              })
                            }
                          >
                            <option value="group">Группа</option>
                            <option value="individual">Индивидуально</option>
                          </select>
                        ) : null}
                      </div>
                    ) : (
                      <span className="mobile-labeled-value" data-label="Схема">
                        {plan
                          ? `${planLabels[plan.type]}${plan.type === 'monthly' ? ` · ${formatLabels[plan.trainingFormat]}` : ''}`
                          : 'Не настроена'}
                      </span>
                    )}
                    {canManage ? (
                      <div className="payment-calculation">
                        <span className="mobile-field-label">Сумма</span>
                        <input
                          min="1"
                          placeholder="Сумма периода"
                          step="0.01"
                          type="number"
                          value={edit.currentAmount}
                          onChange={(event) =>
                            updatePaymentEdit(member.id, { currentAmount: event.target.value })
                          }
                        />
                        {edit.type !== 'one_time' ? (
                          <label className="payment-future-toggle">
                            <input
                              checked={edit.updateFuture}
                              type="checkbox"
                              onChange={(event) =>
                                 updatePaymentEdit(member.id, {
                                   updateFuture: event.target.checked
                                 })
                              }
                            />
                            Применить к следующим периодам
                          </label>
                        ) : null}
                      </div>
                    ) : (
                      <span className="mobile-labeled-value" data-label="Сумма">{payment ? `${Number(payment.amount).toFixed(2)} ₽` : 'Не назначена'}</span>
                    )}
                    <div className="mobile-payment-field">
                      <span className="mobile-field-label">Срок</span>
                      {canManage ? <input type="date" value={edit.dueDate} onChange={(event) => updatePaymentEdit(member.id, { dueDate: event.target.value })} /> : <span>{payment?.due_date ?? '—'}</span>}
                    </div>
                    <div className="mobile-payment-field">
                      <span className="mobile-field-label">Статус</span>
                      <span className={`status-pill ${payment?.status ?? 'not-set'}`}>{statusLabels[payment?.status ?? 'not-set']}</span>
                    </div>
                    <div className="row-actions">
                      {canManage ? <button className="small-button" type="button" onClick={() => saveMemberPayment(member.id)}>{payment ? 'Сохранить' : 'Назначить'}</button> : null}
                      {hasRole(activeUser, 'member') &&
                      payment &&
                      ['active', 'overdue', 'delayed'].includes(payment.status) ? (
                        <>
                          <button className="small-button" type="button" onClick={() => submitPaymentConfirmation(payment.id)}>Я оплатил</button>
                          <div className="delay-request-compact">
                            <input
                              aria-label="Новая дата оплаты"
                              min={todayString()}
                              type="date"
                              value={delayDraftFor(payment).requestedDate}
                              onChange={(event) =>
                                updateDelayDraft(payment.id, { requestedDate: event.target.value })
                              }
                            />
                            <input
                              aria-label="Комментарий к отсрочке"
                              placeholder="Комментарий"
                              value={delayDraftFor(payment).comment}
                              onChange={(event) =>
                                updateDelayDraft(payment.id, { comment: event.target.value })
                              }
                            />
                            <button className="small-button secondary" type="button" onClick={() => requestPaymentDelay(payment.id)}>Отсрочка</button>
                          </div>
                        </>
                      ) : null}
                      {canManage && payment?.status === 'payment_confirmation' ? (
                        <>
                          <button className="small-button" type="button" onClick={() => updatePaymentStatus(payment.id, 'paid')}>Подтвердить</button>
                          <button className="small-button secondary" type="button" onClick={() => updatePaymentStatus(payment.id, 'active')}>Отклонить</button>
                        </>
                      ) : null}
                      {canManage && payment?.status === 'delay_requested' ? (
                        <>
                          <span className="action-context">
                            До {payment.delay_requested_date}
                            {payment.delay_comment ? ` · ${payment.delay_comment}` : ''}
                          </span>
                          <button className="small-button" type="button" onClick={() => decidePaymentDelay(payment.id, true)}>Одобрить</button>
                          <button className="small-button secondary" type="button" onClick={() => decidePaymentDelay(payment.id, false)}>Отклонить</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {visibleMembers.length === 0 ? <p className="empty-state">Ученики ещё не добавлены.</p> : null}
            </div>
            <div className="payment-history">
              <div className="crm-panel-header">
                <div>
                  <h2>История подтверждённых оплат</h2>
                  <p>Доступна владельцу, ответственному тренеру и ученику</p>
                </div>
              </div>
              {[...visiblePayments]
                .filter((payment) => payment.status === 'paid')
                .reverse()
                .map((payment) => (
                  <div className="payment-history-row" key={payment.id}>
                    <div>
                      <strong>{userName(payment.member_id)}</strong>
                      <span>{payment.period_label ?? payment.due_date}</span>
                    </div>
                    <strong>{Number(payment.amount).toFixed(2)} ₽</strong>
                    <span>{payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('ru-RU') : 'Подтверждено'}</span>
                  </div>
                ))}
              {visiblePayments.filter((payment) => payment.status === 'paid').length === 0 ? (
                <p className="empty-state">Подтверждённых оплат пока нет.</p>
              ) : null}
            </div>
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
                          <button className="small-button secondary" type="button" onClick={() => deleteGroup(group.id)}>
                            Удалить
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
                <div className="form-actions">
                  <button className="primary-button" type="submit">
                    {editingGroupId ? 'Сохранить группу' : 'Создать группу'}
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
                  <p>К оплате: {pendingExpenses.toFixed(2)} ₽</p>
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
                    <strong>{Number(expense.amount).toFixed(2)} ₽</strong>
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
                    <p>Всего оплачено: {paidExpenses.toFixed(2)} ₽</p>
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
                      <strong>{Number(expense.amount).toFixed(2)} ₽</strong>
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
