'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Share2,
  CalendarDays,
  Clock3,
  Layers3,
  UserRound,
  Wallet,
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
  type LocalNotification,
  type LocalTrainingGroup,
  type LocalTrainingSchedule,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import {
  enablePushNotifications,
  pushPermissionState,
  pushSupported,
  type PushAvailability
} from '@shared/lib/pushClient';
import { formatMoney } from '@shared/constants/app';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat
} from '@shared/types/domain';
import {
  hasRole,
  roleLabel
} from '@/core/roles';
import {
  buildGroupDraftFromGroup,
  buildLocalTrainingGroup,
  canManageGroups,
  canViewGroups,
  deleteGroupAction,
  GroupsPanel,
  mapGroupsById,
  parseGroupPaymentDefaults,
  replaceGroupInWorkspace,
  resolveGroupTrainerId,
  saveRemoteGroupAction,
  selectVisibleGroups,
  upsertGroupInWorkspace,
  validateGroupDraft
} from '@/modules/groups';
import {
  emptyExpenseDraft,
  emptyGroupDraft,
  emptyPersonDraft,
  formatLabels,
  planLabels,
  statusLabels
} from './constants';
import type {
  DashboardSection,
  DelayDraft,
  ExpenseDraft,
  GroupDraft,
  MemberInviteResult,
  PaymentEdit,
  PersonDraft,
  ScheduleEdit,
  SettingsDraft
} from './types';
import {
  addMonthsDate,
  canSubmitPayment,
  dateAtNoon,
  dueDateForBillingDay,
  formatShortDate,
  nextMonthDate,
  paymentLockedText,
  periodLabel,
  prepaymentPeriodLabel,
  statusAfterRejectedAction,
  todayString
} from './utils';
import { NotificationsModal } from './NotificationsModal';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { GroupFormModal } from './GroupFormModal';
import { InviteLinkModal } from './InviteLinkModal';
import { InviteResultCard } from './InviteResultCard';
import { PaymentRegistryRow } from './PaymentRegistryRow';
import {
  assignMemberToGroupAction,
  createMemberInviteAction,
  createTrainerAction,
  deleteMemberAction,
  filterPeopleForView,
  mapAssignmentsByMemberId,
  mapGroupMembershipByMemberId,
  PeoplePanel,
  selectAllMembers,
  selectPeopleForView,
  selectTrainers,
  selectVisibleMembers
} from '@/modules/people';
import {
  applyRemotePaymentDeletion,
  applyRemotePaymentMutation,
  buildMemberPaymentDetails,
  buildPaymentOverview,
  buildPaymentRegistry,
  buildPaymentTasks,
  buildSelectedPaymentDetails,
  decideLocalPaymentDelay,
  decideLocalPaymentStatus,
  deleteLocalPayment,
  mapActivePlansByMemberId,
  mapCurrentPaymentsByMemberId,
  paymentTaskHeadline,
  requestLocalPaymentDelay,
  selectVisiblePayments,
  submitLocalPaymentConfirmation,
  submitLocalPrepayment,
  upsertBillingPlan,
  upsertPayment,
  type RemotePaymentDeletionResult,
  type RemotePaymentMutationResult,
  type PaymentView
} from '@/modules/payments';

export function DashboardApp(): React.ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const debugPerformance = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [activeUserId, setActiveUserId] = useState('');
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPersonDraft);
  const [paymentEdits, setPaymentEdits] = useState<Record<string, PaymentEdit>>({});
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(emptyExpenseDraft);
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, ScheduleEdit>>({});
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    firstName: '',
    lastName: '',
    phone: '',
    organizationName: ''
  });
  const [delayDrafts, setDelayDrafts] = useState<Record<string, DelayDraft>>({});
  const [prepaymentMonths, setPrepaymentMonths] = useState<Record<string, number>>({});
  const [editingGroupId, setEditingGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [pushStatus, setPushStatus] = useState<PushAvailability>('unsupported');
  const [workspaceLoadError, setWorkspaceLoadError] = useState('');
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [memberInvite, setMemberInvite] = useState<MemberInviteResult | null>(null);
  const [memberInvitesByGroup, setMemberInvitesByGroup] = useState<Record<string, MemberInviteResult>>({});
  const [lastCreatedGroupId, setLastCreatedGroupId] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [paymentView, setPaymentView] = useState<PaymentView>('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleGroupFilter, setPeopleGroupFilter] = useState('all');
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({});
  const [groupEditorOpenByMember, setGroupEditorOpenByMember] = useState<Record<string, boolean>>({});
  const [selectedPaymentMemberId, setSelectedPaymentMemberId] = useState('');
  const [paymentEditOpen, setPaymentEditOpen] = useState(false);
  const [historyOpenByMember, setHistoryOpenByMember] = useState<Record<string, boolean>>({});
  const [paymentActionGroupsOpen, setPaymentActionGroupsOpen] = useState<Record<string, boolean>>({});
  const remoteRefreshInFlightRef = useRef(false);
  const lastRemoteRefreshAtRef = useRef(0);

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

  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const supabase = getSupabaseClient();
    const sessionResult = forceRefresh
      ? await supabase.auth.refreshSession()
      : await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;

    if (token || forceRefresh) {
      return token ?? null;
    }

    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  }, []);

  const loadRemoteWorkspace = useCallback(async (options: { silent?: boolean } = {}): Promise<boolean> => {
    const token = await getAccessToken();

    if (!token) {
      window.location.href = '/login';
      return false;
    }

    const start = performance.now();
    const requestWorkspace = (accessToken: string): Promise<Response> =>
      fetch('/api/workspace', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
    let response = await requestWorkspace(token);

    if (response.status === 401) {
      const refreshedToken = await getAccessToken(true);
      if (refreshedToken) {
        response = await requestWorkspace(refreshedToken);
      }
    }

    const data = (await response.json()) as {
      workspace?: LocalWorkspace;
      activeUserId?: string;
      error?: string;
    };
    if (debugPerformance) {
      console.info('[performance] client workspace load', `loadRemoteWorkspace ${Math.round(performance.now() - start)}ms`);
    }

    if (!response.ok || !data.workspace || !data.activeUserId) {
      const nextError = data.error ?? 'Не удалось загрузить данные клуба.';
      setWorkspaceLoadError(nextError);
      if (!options.silent) {
        setMessage(nextError);
      }
      return false;
    }

    setWorkspaceLoadError('');
    setWorkspace(data.workspace);
    setActiveUserId(data.activeUserId);
    return true;
  }, [debugPerformance, getAccessToken]);

  const refreshRemoteWorkspace = useCallback(async (reason: string, minIntervalMs = 10_000): Promise<void> => {
    if (isLocalMode || remoteRefreshInFlightRef.current) return;

    const now = Date.now();
    if (minIntervalMs > 0 && now - lastRemoteRefreshAtRef.current < minIntervalMs) {
      return;
    }

    remoteRefreshInFlightRef.current = true;
    lastRemoteRefreshAtRef.current = now;

    try {
      const loaded = await loadRemoteWorkspace({ silent: reason !== 'initial' });
      if (loaded && debugPerformance) {
        console.info('[workspace] refreshed', reason);
      }
    } catch (error) {
      console.warn('[workspace] refresh failed', reason, error);
    } finally {
      remoteRefreshInFlightRef.current = false;
    }
  }, [debugPerformance, isLocalMode, loadRemoteWorkspace]);

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
      void refreshRemoteWorkspace('initial', 0);
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
  }, [isLocalMode, refreshRemoteWorkspace]);

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (isLocalMode) {
      setPushStatus('disabled');
      return;
    }

    setPushStatus(pushPermissionState());
  }, [isLocalMode]);

  useEffect(() => {
    if (isLocalMode) return;

    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshRemoteWorkspace('visible', 5_000);
      }
    };
    const refreshOnFocus = (): void => {
      void refreshRemoteWorkspace('focus', 8_000);
    };
    const refreshOnPageShow = (): void => {
      void refreshRemoteWorkspace('pageshow', 0);
    };

    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('pageshow', refreshOnPageShow);
    const remoteRefreshTimer = window.setInterval(() => {
      void refreshRemoteWorkspace('interval', 60_000);
    }, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('pageshow', refreshOnPageShow);
      window.clearInterval(remoteRefreshTimer);
    };
  }, [isLocalMode, refreshRemoteWorkspace]);

  useEffect(() => {
    if (isLocalMode) return;
    void refreshRemoteWorkspace(`section:${activeSection}`, 4_000);
  }, [activeSection, isLocalMode, refreshRemoteWorkspace]);

  const activeUser = useMemo(
    () => workspace?.users.find((user) => user.id === activeUserId) ?? null,
    [activeUserId, workspace]
  );

  useEffect(() => {
    if (!activeUser || !workspace) return;

    setSettingsDraft({
      firstName: activeUser.first_name,
      lastName: activeUser.last_name,
      phone: activeUser.phone ?? '',
      organizationName: workspace.organization.name
    });
  }, [activeUser, workspace]);

  useEffect(() => {
    if (isLocalMode || !workspace?.organization.id || !activeUserId) return;

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`workspace-live:${workspace.organization.id}:${activeUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_requests',
          filter: `organization_id=eq.${workspace.organization.id}`
        },
        () => {
          void refreshRemoteWorkspace('realtime:payments', 1_000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${activeUserId}`
        },
        () => {
          void refreshRemoteWorkspace('realtime:notifications', 1_000);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeUserId, isLocalMode, refreshRemoteWorkspace, workspace?.organization.id]);

  const trainers = useMemo(() => selectTrainers(workspace), [workspace]);

  const allMembers = useMemo(() => selectAllMembers(workspace), [workspace]);

  const visibleGroups = useMemo(() => selectVisibleGroups(workspace, activeUser), [activeUser, workspace]);

  const visibleMembers = useMemo(
    () =>
      selectVisibleMembers({
        activeUser,
        allMembers,
        assignments: workspace?.assignments ?? []
      }),
    [activeUser, allMembers, workspace?.assignments]
  );

  const visiblePayments = useMemo(
    () => selectVisiblePayments(workspace, activeUser),
    [activeUser, workspace]
  );

  const usersById = useMemo(() => {
    if (!workspace) return new Map<string, AppUser>();
    return new Map(workspace.users.map((user) => [user.id, user]));
  }, [workspace]);

  const assignmentsByMemberId = useMemo(
    () => mapAssignmentsByMemberId(workspace?.assignments ?? []),
    [workspace?.assignments]
  );

  const groupsById = useMemo(() => mapGroupsById(workspace?.groups ?? []), [workspace?.groups]);

  const groupMembershipByMemberId = useMemo(
    () => mapGroupMembershipByMemberId(workspace?.groupMembers ?? []),
    [workspace?.groupMembers]
  );

  const currentPaymentByMemberId = useMemo(
    () => mapCurrentPaymentsByMemberId(workspace?.payments ?? []),
    [workspace?.payments]
  );

  const activePlanByMemberId = useMemo(
    () => mapActivePlansByMemberId(workspace?.billingPlans ?? []),
    [workspace?.billingPlans]
  );

  const isPendingAction = (key: string): boolean => pendingAction === key;
  const buttonLabel = (key: string, defaultLabel: string): string =>
    isPendingAction(key)
      ? key.startsWith('create-invite:')
        ? 'Готовим ссылку...'
        : defaultLabel.toLowerCase().includes('удал')
          ? 'Удаляем...'
          : 'Сохраняем...'
      : defaultLabel;

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

  const paymentOverview = useMemo(
    () =>
      buildPaymentOverview({
        visiblePayments,
        visibleMembers,
        currentPaymentByMemberId
      }),
    [currentPaymentByMemberId, visibleMembers, visiblePayments]
  );
  const {
    currentPayments,
    paidAmount,
    confirmationPayments,
    delayRequestedPayments,
    overduePayments,
    delayedPayments,
    paymentActionCount
  } = paymentOverview;
  const currentExpenses = workspace?.expenses.filter((expense) => expense.isCurrent) ?? [];
  const paidExpenses = workspace?.expenses
    .filter((expense) => expense.status === 'paid')
    .reduce((sum, expense) => sum + Number(expense.amount), 0) ?? 0;
  const pendingExpenses = currentExpenses
    .filter((expense) => expense.status === 'pending')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const paymentRegistry = buildPaymentRegistry({
    visiblePayments,
    visibleMembers,
    currentPaymentByMemberId,
    paymentView,
    paymentSearch,
    userName
  });
  const {
    filteredMembers: filteredPaymentMembers,
    visibleActionGroups: visiblePaymentActionGroups,
    paidResults: paidPaymentResults
  } = paymentRegistry;
  const selectedPaymentDetails = buildSelectedPaymentDetails({
    selectedMemberId: selectedPaymentMemberId,
    visibleMembers,
    visiblePayments,
    currentPaymentByMemberId,
    activePlanByMemberId,
    usersById,
    historyOpenByMember,
    groupForMember: groupFor
  });
  const {
    member: selectedPaymentMember,
    payment: selectedPayment,
    plan: selectedPaymentPlan,
    group: selectedPaymentGroup,
    trainer: selectedPaymentTrainer,
    history: selectedPaymentHistory,
    historyOpen: selectedPaymentHistoryOpen
  } = selectedPaymentDetails;
  const todayTasks = buildPaymentTasks({
    confirmationPayments,
    delayRequestedPayments,
    overduePayments
  }).map((task) => ({
    ...task,
    onClick: () => openPaymentsView(task.id === 'overdue' ? 'overdue' : 'actions')
  }));
  const todayTaskCount = todayTasks.reduce((sum, task) => sum + task.count, 0);
  const todayTaskHeadline = paymentTaskHeadline(todayTaskCount);
  const activeMemberDetails = useMemo(
    () =>
      buildMemberPaymentDetails({
        activeUser,
        currentPayments,
        visiblePayments,
        activePlanByMemberId,
        historyOpenByMember
      }),
    [activePlanByMemberId, activeUser, currentPayments, historyOpenByMember, visiblePayments]
  );
  const {
    payment: activeMemberPayment,
    plan: activeMemberPlan,
    history: activeMemberPaymentHistory,
    historyOpen: activeMemberHistoryOpen
  } = activeMemberDetails;
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

  async function runRemoteAction(payload: Record<string, unknown>): Promise<boolean> {
    const data = await runRemoteActionData<{ ok: boolean }>(payload);
    return Boolean(data);
  }

  async function runRemoteActionData<T>(payload: Record<string, unknown>): Promise<T | null> {
    const token = await getAccessToken();
    if (!token) {
      window.location.href = '/login';
      return null;
    }

    const start = performance.now();
    const requestAction = (accessToken: string): Promise<Response> =>
      fetch('/api/workspace/actions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    let response = await requestAction(token);

    if (response.status === 401) {
      const refreshedToken = await getAccessToken(true);
      if (refreshedToken) {
        response = await requestAction(refreshedToken);
      }
    }

    const data = (await response.json()) as T & { error?: string };
    if (debugPerformance) {
      console.info('[performance] action', `runRemoteAction ${Math.round(performance.now() - start)}ms`, payload.action ?? 'unknown');
    }

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
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
    setInvitePickerOpen(false);
  }

  function openSection(section: DashboardSection): void {
    setActiveSection(section);
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
    setInvitePickerOpen(false);
  }

  function openNotifications(): void {
    setNotificationsOpen(true);
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setInvitePickerOpen(false);
    if (unreadNotifications.length > 0) {
      void markNotificationsRead();
    }
  }

  function openPaymentsView(view: PaymentView): void {
    setActiveSection('payments');
    setPaymentView(view);
    setSelectedPaymentMemberId('');
    setPaymentEditOpen(false);
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
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
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
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

  function openCreateGroup(): void {
    setActiveSection('groups');
    setMobileFormOpen(true);
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
    setMessage('');
  }

  function openInviteFlow(groupId?: string): void {
    setActiveSection(groupId ? 'groups' : 'people');
    setMobileFormOpen(true);
    setMemberInvite(null);
    setMessage('');
    setPersonDraft((current) => ({
      ...current,
      role: 'member',
      groupId: groupId ?? current.groupId
    }));
  }

  function openOverviewInviteFlow(): void {
    if (visibleGroups.length === 0) {
      setMessage('Сначала создайте группу, чтобы дать ссылку на вступление.');
      return;
    }

    setMessage('');
    setMemberInvite(null);
    if (visibleGroups.length === 1) {
      void createMemberInviteForGroup(visibleGroups[0].id);
      return;
    }

    setInvitePickerOpen(true);
  }

  function closeOverviewInviteModal(): void {
    setInvitePickerOpen(false);
    setMemberInvite(null);
    setMessage('');
  }

  async function createMemberInviteForGroup(groupId: string): Promise<void> {
    const selectedGroup = workspace?.groups.find((group) => group.id === groupId);
    if (!workspace) return;

    const result = await createMemberInviteAction({
      group: selectedGroup ?? null,
      groupId,
      cachedInvite: memberInvitesByGroup[groupId],
      isLocalMode,
      origin: window.location.origin,
      runRemoteActionWithPending
    });

    if (result) {
      setMemberInvite(result.invite);
      setMemberInvitesByGroup((current) => ({ ...current, [groupId]: result.invite }));
      setLastCreatedGroupId('');
      setMessage(result.localMode ? 'В локальном режиме ссылка показана для проверки интерфейса.' : '');
    }
  }

  function closeMemberInvite(): void {
    setMemberInvite(null);
    setMessage('');
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
        await createMemberInviteForGroup(personDraft.groupId);
        if (selectedGroup) {
          setPersonDraft((current) => ({
            ...emptyPersonDraft,
            role: 'member',
            groupId: current.groupId
          }));
        }
        return;
      }

      const success = await createTrainerAction({
        firstName: personDraft.firstName,
        lastName: personDraft.lastName,
        username: personDraft.username,
        password: personDraft.password,
        phone: personDraft.phone,
        runRemoteAction
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
          source: 'individual',
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

    const trainerId = resolveGroupTrainerId(activeUser, groupDraft);
    const defaults = parseGroupPaymentDefaults(groupDraft);
    const validationError = validateGroupDraft(groupDraft, trainerId, defaults);

    if (validationError === 'missing_required') {
      setMessage('Укажите направление, дни и время.');
      return;
    }
    if (validationError === 'invalid_payment_defaults') {
      setMessage('Укажите корректную сумму и день оплаты группы.');
      return;
    }

    if (!isLocalMode) {
      const savedGroup = await saveRemoteGroupAction({
        editingGroupId,
        trainerId,
        draft: groupDraft,
        defaults,
        runRemoteActionWithPending
      });
      if (savedGroup) {
        const wasEditingGroup = Boolean(editingGroupId);
        setWorkspace((current) =>
          current ? upsertGroupInWorkspace(current, savedGroup) : current
        );
        setGroupDraft(emptyGroupDraft);
        setEditingGroupId('');
        setMobileFormOpen(false);
        setLastCreatedGroupId(wasEditingGroup ? '' : savedGroup.id);
        void refreshRemoteWorkspace('group-save', 0);
        setMessage(wasEditingGroup ? 'Группа обновлена.' : 'Группа создана. Теперь можно создать ссылку для набора.');
      }
      return;
    }

    const now = new Date().toISOString();
    const group = buildLocalTrainingGroup({
      id: createId(),
      trainerId,
      draft: groupDraft,
      defaults,
      now
    });

    if (editingGroupId) {
      const memberIds = workspace.groupMembers
        .filter((assignment) => assignment.groupId === editingGroupId)
        .map((assignment) => assignment.memberId);
      const dueDate = defaults.hasDefaultPayment ? dueDateForBillingDay(defaults.defaultBillingDay) : '';
      const updatedPlans = defaults.hasDefaultPayment
        ? workspace.billingPlans.map((plan) =>
            memberIds.includes(plan.memberId) && plan.active && plan.source !== 'individual'
              ? {
                  ...plan,
                  trainerId,
                  type: 'monthly' as const,
                  trainingFormat: 'group' as const,
                  source: 'group_default' as const,
                  baseAmount: defaults.defaultAmount,
                  billingDay: defaults.defaultBillingDay,
                  updatedAt: now
                }
              : plan
          )
        : workspace.billingPlans;
      const planMemberIds = new Set(updatedPlans.filter((plan) => plan.active).map((plan) => plan.memberId));
      const nextPlans = defaults.hasDefaultPayment
        ? [
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
                baseAmount: defaults.defaultAmount,
                billingDay: defaults.defaultBillingDay,
                active: true,
                createdAt: now,
                updatedAt: now
              }))
          ]
        : workspace.billingPlans;
      const currentPlanByMemberId = new Map(nextPlans.filter((plan) => plan.active).map((plan) => [plan.memberId, plan]));
      const currentPaymentMemberIds = new Set(
        workspace.payments.filter((payment) => payment.is_current).map((payment) => payment.member_id)
      );
      const nextPayments = defaults.hasDefaultPayment
        ? [
            ...workspace.payments.map((payment) => {
              const plan = currentPlanByMemberId.get(payment.member_id);
              if (!payment.is_current || !memberIds.includes(payment.member_id) || !plan) return payment;
              if (plan.source === 'individual') return payment;
              if (['payment_confirmation', 'delay_requested', 'paid'].includes(payment.status)) return payment;
              return {
                ...payment,
                trainer_id: trainerId,
                amount: defaults.defaultAmount,
                due_date: dueDate,
                status: (dateAtNoon(dueDate) < dateAtNoon(todayString()) ? 'overdue' : 'active') as PaymentRequestStatus,
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
                  amount: defaults.defaultAmount,
                  due_date: dueDate,
                  status: (dateAtNoon(dueDate) < dateAtNoon(todayString()) ? 'overdue' : 'active') as PaymentRequestStatus,
                  created_at: now,
                  plan_id: plan?.id,
                  period_label: periodLabel(dueDate),
                  is_current: true,
                  coverage_months: 1,
                  paid_at: null
                };
              })
          ]
        : workspace.payments;
      saveWorkspace({
        ...replaceGroupInWorkspace(workspace, editingGroupId, group),
        billingPlans: nextPlans,
        payments: nextPayments
      });
      setMessage('Группа обновлена.');
    } else {
      saveWorkspace(upsertGroupInWorkspace(workspace, group));
      setLastCreatedGroupId(group.id);
      setMessage('Группа создана. Теперь можно создать ссылку для набора.');
    }

    setGroupDraft(emptyGroupDraft);
    setEditingGroupId('');
  }

  function startGroupEdit(group: LocalTrainingGroup): void {
    if (!activeUser || !hasRole(activeUser, 'trainer')) return;

    setEditingGroupId(group.id);
    setLastCreatedGroupId('');
    setMemberInvite(null);
    setGroupDraft(buildGroupDraftFromGroup(group));
    setMobileFormOpen(true);
    setMessage('Редактирование группы. Внесите изменения и сохраните.');
  }

  function cancelGroupEdit(): void {
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
    setMobileFormOpen(false);
    setMessage('');
  }

  async function deleteGroup(groupId: string): Promise<void> {
    if (!workspace || !activeUser || !hasRole(activeUser, 'trainer')) return;

    const deleted = await deleteGroupAction({
      workspace,
      groupId,
      isLocalMode,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace
    });
    if (!deleted) return;

    if (editingGroupId === groupId) {
      cancelGroupEdit();
    }
    if (lastCreatedGroupId === groupId) {
      setLastCreatedGroupId('');
    }

    setMessage('Группа удалена.');
  }

  async function assignMemberToGroup(memberId: string, groupId: string): Promise<void> {
    await assignMemberToGroupAction({
      workspace,
      group: groupsById.get(groupId) ?? null,
      memberId,
      groupId,
      isLocalMode,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage
    });
  }

  async function deleteMember(memberId: string): Promise<void> {
    await deleteMemberAction({
      workspace,
      memberId,
      isLocalMode,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage
    });
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
    const planSource = edit.individualTerms || edit.type === 'one_time' ? 'individual' : 'group_default';

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
          updateFuture: edit.updateFuture,
          source: planSource
        },
        `save-payment:${memberId}`
      );
      if (data?.payment && data.billingPlan) {
        setWorkspace((current) =>
          current ? upsertPayment(upsertBillingPlan(current, data.billingPlan), data.payment) : current
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
      source: planSource,
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
      existingPlan.source !== planSource;
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
      const data = await runRemoteActionWithPending<RemotePaymentDeletionResult>(
        { action: 'delete_payment', paymentId: payment.id },
        `delete-payment:${payment.id}`
      );
      if (data?.deletedPaymentId) {
        setWorkspace((current) =>
          current ? applyRemotePaymentDeletion(current, data, activeUserId) : current
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
    saveWorkspace(deleteLocalPayment({ workspace, payment, now, createId }));
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
      const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
        {
          action: 'decide_payment',
          paymentId,
          approved: status === 'paid'
        },
        `decide-payment:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current ? applyRemotePaymentMutation(current, data, activeUserId) : current
        );
        setMessage(status === 'paid' ? 'Оплата подтверждена.' : 'Подтверждение отклонено.');
      }
      return;
    }
    const now = new Date().toISOString();
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
    const activeRecurringPlan =
      resolvedStatus === 'paid' &&
      payment.is_current !== false &&
      plan?.active &&
      plan.type !== 'one_time'
        ? plan
        : null;
    const shouldAdvance = Boolean(activeRecurringPlan);
    const nextDueDate =
      activeRecurringPlan
        ? addMonthsDate(payment.due_date, activeRecurringPlan.billingDay, payment.coverage_months ?? 1)
        : null;
    const nextAmount =
      Number(activeRecurringPlan?.baseAmount ?? 0);
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
      const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
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
          current ? applyRemotePaymentMutation(current, data, activeUserId) : current
        );
        setMessage('Запрос отсрочки отправлен.');
      }
      return;
    }

    const now = new Date().toISOString();
    saveWorkspace(
      requestLocalPaymentDelay({
        workspace,
        payment,
        requestedDate: draft.requestedDate,
        comment: draft.comment,
        now,
        createId,
        userName
      })
    );
    setMessage('Запрос отсрочки отправлен.');
  }

  async function decidePaymentDelay(paymentId: string, approved: boolean): Promise<void> {
    if (!workspace || !activeUser || (!hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner'))) {
      return;
    }

    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== 'delay_requested') return;

    if (!isLocalMode) {
      const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
        {
          action: 'decide_delay',
          paymentId,
          approved
        },
        `decide-delay:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current ? applyRemotePaymentMutation(current, data, activeUserId) : current
        );
        setMessage(approved ? 'Отсрочка одобрена.' : 'Отсрочка отклонена.');
      }
      return;
    }
    const now = new Date().toISOString();
    saveWorkspace(
      decideLocalPaymentDelay({
        workspace,
        payment,
        approved,
        actorId: activeUser.id,
        now,
        createId,
        statusForDueDate: (dueDate) =>
          dateAtNoon(dueDate) < dateAtNoon(todayString())
            ? 'overdue'
            : approved
              ? 'delayed'
              : 'active',
        periodLabel
      })
    );
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
      const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
        { action: 'submit_payment', paymentId },
        `submit-payment:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current ? applyRemotePaymentMutation(current, data, activeUserId) : current
        );
        setMessage('Подтверждение отправлено ответственному лицу.');
      }
      return;
    }
    const now = new Date().toISOString();

    saveWorkspace(submitLocalPaymentConfirmation({ workspace, payment, now, createId, userName }));
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
      const data = await runRemoteActionWithPending<RemotePaymentMutationResult>(
        { action: 'submit_prepayment', paymentId, months },
        `submit-prepayment:${paymentId}`
      );
      if (data?.payment) {
        setWorkspace((current) =>
          current ? applyRemotePaymentMutation(current, data, activeUserId) : current
        );
        setMessage('Предоплата отправлена тренеру на подтверждение.');
      }
      return;
    }

    const now = new Date().toISOString();
    saveWorkspace(
      submitLocalPrepayment({
        workspace,
        payment,
        months,
        amount,
        periodLabel: prepaymentPeriodLabel(payment.due_date, months),
        now,
        createId,
        userName
      })
    );
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

  async function enablePush(): Promise<void> {
    if (!pushSupported()) {
      setPushStatus('unsupported');
      setMessage('Push-уведомления не поддерживаются этим браузером.');
      return;
    }

    try {
      const nextStatus = await enablePushNotifications();
      setPushStatus(nextStatus);
      setMessage(
        nextStatus === 'granted'
          ? 'Push-уведомления включены.'
          : nextStatus === 'disabled'
            ? 'Push-уведомления пока не настроены на сервере.'
            : nextStatus === 'blocked'
              ? 'Push-уведомления заблокированы в настройках браузера.'
              : 'Push-уведомления не включены.'
      );
    } catch (error) {
      console.warn('[push] enable failed', error);
      setMessage(error instanceof Error ? error.message : 'Не удалось включить push-уведомления.');
    }
  }

  async function saveProfileSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!workspace || !activeUser) return;

    const firstName = settingsDraft.firstName.trim();
    const lastName = settingsDraft.lastName.trim();
    const phone = settingsDraft.phone.trim();
    if (!firstName || !lastName) {
      setMessage('Укажите имя и фамилию.');
      return;
    }

    if (!isLocalMode) {
      setPendingAction('update-profile');
      try {
        const data = await runRemoteActionData<{ user: AppUser }>({
          action: 'update_profile',
          firstName,
          lastName,
          phone
        });
        if (data?.user) {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  users: current.users.map((user) =>
                    user.id === data.user.id
                      ? {
                          ...data.user,
                          roles: user.roles
                        }
                      : user
                  )
                }
              : current
          );
          setMessage('Профиль сохранён.');
        }
      } finally {
        setPendingAction(null);
      }
      return;
    }

    saveWorkspace({
      ...workspace,
      users: workspace.users.map((user) =>
        user.id === activeUser.id
          ? {
              ...user,
              first_name: firstName,
              last_name: lastName,
              phone: phone || null
            }
          : user
      )
    });
    setMessage('Профиль сохранён.');
  }

  async function saveOrganizationSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!workspace || !activeUser || !hasRole(activeUser, 'owner')) return;

    const name = settingsDraft.organizationName.trim();
    if (!name) {
      setMessage('Укажите название клуба.');
      return;
    }

    if (!isLocalMode) {
      setPendingAction('update-organization');
      try {
        const data = await runRemoteActionData<{ organization: LocalWorkspace['organization'] }>({
          action: 'update_organization',
          name
        });
        if (data?.organization) {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  organization: data.organization
                }
              : current
          );
          setMessage('Настройки клуба сохранены.');
        }
      } finally {
        setPendingAction(null);
      }
      return;
    }

    saveWorkspace({
      ...workspace,
      organization: {
        ...workspace.organization,
        name
      }
    });
    setMessage('Настройки клуба сохранены.');
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
      <PaymentRegistryRow
        key={member.id}
        memberName={userName(member.id)}
        payment={payment}
        plan={plan}
        group={group}
        isSelected={selectedPaymentMemberId === member.id}
        onSelect={() => {
          setSelectedPaymentMemberId(member.id);
          setPaymentEditOpen(false);
        }}
      />
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
      individualTerms: plan?.source === 'individual',
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

  const peopleForView = selectPeopleForView({
    activeUser,
    visibleMembers,
    users: workspace?.users ?? []
  });
  const filteredPeopleForView = filterPeopleForView({
    people: peopleForView,
    search: peopleSearch,
    groupFilter: peopleGroupFilter,
    getMemberGroup: groupFor
  });
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
    settings: {
      title: 'Настройки',
      description: 'Профиль, уведомления и параметры клуба'
    }
  };

  if (!workspace || !activeUser) {
    return (
      <main className="app-shell loading-state">
        <section className="loading-card">
          <strong>Загружаем клуб...</strong>
          {workspaceLoadError ? (
            <>
              <p>{workspaceLoadError}</p>
              <div>
                <button className="primary-button" type="button" onClick={() => void refreshRemoteWorkspace('manual', 0)}>
                  Повторить
                </button>
                <button className="ghost-button" type="button" onClick={() => { window.location.href = '/login'; }}>
                  Войти заново
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>
    );
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
            active={activeSection === 'settings'}
            icon={<Settings size={18} />}
            label="Настройки"
            mobileHidden
            onClick={() => openSection('settings')}
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
        {mobileAccountOpen ? (
          <button
            aria-label="Закрыть меню аккаунта"
            className="mobile-account-dismiss"
            type="button"
            onClick={() => setMobileAccountOpen(false)}
          />
        ) : null}
        {mobileFormOpen ? (
          <button
            aria-label="Закрыть форму добавления"
            className="mobile-form-backdrop"
            type="button"
            onClick={() => setMobileFormOpen(false)}
          />
        ) : null}
        <div className={mobileAccountOpen ? 'mobile-topbar account-open' : 'mobile-topbar'}>
          <div className="mobile-account-cluster">
            <button
              aria-expanded={mobileAccountOpen}
              aria-label="Меню аккаунта"
              className="mobile-avatar-button"
              type="button"
              onClick={() => setMobileAccountOpen((current) => !current)}
            >
              <span>
                {activeUser.first_name.slice(0, 1)}
                {activeUser.last_name.slice(0, 1)}
              </span>
            </button>
            <button
              aria-label="Аккаунт"
              className="mobile-account-action action-account"
              type="button"
              tabIndex={mobileAccountOpen ? 0 : -1}
              onClick={() => openSection('settings')}
            >
              <UserRound size={18} />
            </button>
            <button
              aria-label="Настройки"
              className="mobile-account-action action-settings"
              type="button"
              tabIndex={mobileAccountOpen ? 0 : -1}
              onClick={() => openSection('settings')}
            >
              <Settings size={18} />
            </button>
            {!isLocalMode ? (
              <button
                aria-label="Выйти"
                className="mobile-account-action action-logout"
                type="button"
                tabIndex={mobileAccountOpen ? 0 : -1}
                onClick={() => {
                  setMobileAccountOpen(false);
                  setLogoutConfirmOpen(true);
                }}
              >
                <LogOut size={18} />
              </button>
            ) : null}
          </div>
          <div className="mobile-title">
            <strong>{workspace.organization.name}</strong>
            <span>{roleLabel(activeUser)}</span>
          </div>
          <button
            aria-label="Уведомления"
            aria-expanded={notificationsOpen}
            className="mobile-notification-button"
            type="button"
            onClick={openNotifications}
          >
            <Bell size={18} />
            {unreadNotifications.length > 0 ? <strong>{unreadNotifications.length}</strong> : null}
          </button>
        </div>
        <header className="crm-header">
          <div>
            <h1>{sectionMeta[activeSection].title}</h1>
            <p>{sectionMeta[activeSection].description}</p>
          </div>
          <div className="crm-header-actions">
            <button
              aria-label="Уведомления"
              aria-expanded={notificationsOpen}
              className="header-notification-button desktop-notification-button"
              type="button"
              onClick={openNotifications}
            >
              <Bell size={19} />
              {unreadNotifications.length > 0 ? <strong>{unreadNotifications.length}</strong> : null}
            </button>
            {!hasRole(activeUser, 'member') &&
            (activeSection === 'people' || activeSection === 'groups') ? (
              <button
                aria-expanded={mobileFormOpen}
                aria-label="Добавить"
                className="mobile-create-button"
                type="button"
                onClick={() => setMobileFormOpen(true)}
              >
                <Plus size={18} />
                {activeSection === 'groups' ? 'Новая группа' : 'Добавить'}
              </button>
            ) : null}
            <div className="crm-user-badge">
              <span>{roleLabel(activeUser)}</span>
              <strong>{activeUser.first_name} {activeUser.last_name}</strong>
            </div>
          </div>
        </header>

        {message ? <p className="notice success">{message}</p> : null}

        {notificationsOpen ? (
          <NotificationsModal
            notifications={userNotifications}
            unreadCount={unreadNotifications.length}
            pushStatus={pushStatus}
            paymentForNotification={notificationPayment}
            canDecidePayment={canDecideNotificationPayment}
            isPendingAction={isPendingAction}
            onClose={() => setNotificationsOpen(false)}
            onEnablePush={() => void enablePush()}
            onMarkRead={() => void markNotificationsRead()}
            onDecidePayment={(paymentId, status) => void updatePaymentStatus(paymentId, status)}
            onDecideDelay={(paymentId, approved) => void decidePaymentDelay(paymentId, approved)}
            onOpenPayment={openNotificationPayment}
          />
        ) : null}

        {logoutConfirmOpen ? (
          <LogoutConfirmModal
            onCancel={() => setLogoutConfirmOpen(false)}
            onConfirm={() => void signOut()}
          />
        ) : null}

        {invitePickerOpen || (activeSection === 'overview' && memberInvite) ? (
          <InviteLinkModal
            invite={memberInvite}
            groups={visibleGroups}
            isPendingGroup={(groupId) => isPendingAction(`create-invite:${groupId}`)}
            onCreateInvite={(groupId) => void createMemberInviteForGroup(groupId)}
            onCopy={() => void copyMemberInvite()}
            onShare={() => void shareMemberInvite()}
            onClose={closeOverviewInviteModal}
          />
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
              <>
              <section className="today-card">
                <div className="today-card-heading">
                  <span className="today-card-icon"><CalendarDays size={20} /></span>
                  <strong>Сегодня</strong>
                </div>
                <h2>
                  {todayTaskCount > 0 ? todayTaskHeadline : 'Сегодня всё спокойно'}
                </h2>
                {todayTasks.length > 0 ? (
                  <div className="today-task-list">
                    {todayTasks.map((task) => (
                      <button key={task.id} type="button" onClick={task.onClick}>
                        <span>
                          <strong>{task.count}</strong>
                          <small>{task.label}</small>
                        </span>
                        <span className="today-task-action">
                          Открыть <ChevronRight size={18} />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="today-calm">
                    <span>Новых подтверждений, отсрочек и просрочек нет.</span>
                  </div>
                )}
              </section>

              <section className="quick-actions-panel overview-invite-panel">
                <div>
                  <span>Основное действие</span>
                  <strong>Ссылка на вступление</strong>
                </div>
                <div className="quick-actions single-action">
                  <button
                    className="quick-action-card"
                    type="button"
                    disabled={visibleGroups.length === 0 || (visibleGroups.length === 1 && isPendingAction(`create-invite:${visibleGroups[0].id}`))}
                    onClick={openOverviewInviteFlow}
                  >
                    <Share2 size={18} />
                    <span>
                      {visibleGroups.length === 0
                        ? 'Нет групп'
                        : visibleGroups.length === 1 && isPendingAction(`create-invite:${visibleGroups[0].id}`)
                          ? 'Готовим ссылку...'
                          : 'Ссылка на вступление'}
                    </span>
                  </button>
                </div>
              </section>

              <section className="metric-grid">
                <Metric
                  hint="История оплат"
                  icon={<Wallet size={18} />}
                  label="Получено"
                  tone="violet"
                  value={formatMoney(paidAmount)}
                  onClick={() => openPaymentsView('paid')}
                />
                <Metric
                  hint="Открыть список"
                  icon={<CreditCard size={18} />}
                  label="Активные оплаты"
                  tone="violet"
                  value={currentPayments.length}
                  onClick={() => openPaymentsView('all')}
                />
                <Metric
                  hint="Требует оплаты"
                  icon={<AlertTriangle size={18} />}
                  label="Просрочено"
                  tone="danger"
                  value={overduePayments.length}
                  onClick={() => openPaymentsView('overdue')}
                />
                <Metric
                  hint="ждёт / одобрено"
                  icon={<Clock3 size={18} />}
                  label="Отсрочки"
                  tone="violet"
                  value={`${delayRequestedPayments.length} / ${delayedPayments.length}`}
                  onClick={() => openPaymentsView('actions')}
                />
              </section>
              </>
            )}

          </>
        ) : null}

        {activeSection === 'people' ? (
          <section className="crm-content-grid">
            <PeoplePanel
              activeUser={activeUser}
              people={peopleForView}
              filteredPeople={filteredPeopleForView}
              groups={visibleGroups}
              groupFilter={peopleGroupFilter}
              search={peopleSearch}
              expandedPeople={expandedPeople}
              groupEditorOpenByMember={groupEditorOpenByMember}
              getMemberGroup={groupFor}
              isPendingAction={isPendingAction}
              buttonLabel={buttonLabel}
              onGroupFilterChange={setPeopleGroupFilter}
              onSearchChange={setPeopleSearch}
              onTogglePerson={(userId, nextOpen) =>
                setExpandedPeople((current) => ({
                  ...current,
                  [userId]: nextOpen
                }))
              }
              onToggleGroupEditor={(memberId, nextOpen) =>
                setGroupEditorOpenByMember((current) => ({
                  ...current,
                  [memberId]: nextOpen
                }))
              }
              onAssignMemberToGroup={(memberId, groupId) => void assignMemberToGroup(memberId, groupId)}
              onDeleteMember={(memberId) => void deleteMember(memberId)}
              onCreateGroup={openCreateGroup}
              onOpenInviteFlow={openInviteFlow}
            />
            {!hasRole(activeUser, 'member') ? (
              <form className={`crm-panel crm-side-form form-stack${mobileFormOpen ? ' mobile-form-open' : ''}`} onSubmit={addPerson}>
                <div className="crm-panel-header">
                  <div>
                    <h2>{hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'Новый ученик' : 'Новый человек'}</h2>
                    <p>Добавление в клуб</p>
                  </div>
                  <button
                    className="form-close-button"
                    aria-label="Закрыть форму"
                    type="button"
                    onClick={() => setMobileFormOpen(false)}
                  >
                    <Plus size={20} />
                  </button>
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
                  <InviteResultCard
                    invite={memberInvite}
                    inputLabel="Ссылка-приглашение"
                    onCopy={() => void copyMemberInvite()}
                    onClose={closeMemberInvite}
                    onShare={() => void shareMemberInvite()}
                  />
                ) : null}
              </form>
            ) : null}
          </section>
        ) : null}

        {activeSection === 'payments' && hasRole(activeUser, 'member') ? (
          <section className="member-payment-page">
            <div className="crm-panel member-payment-focus">
              <div className="payment-concept-strip">
                <div>
                  <span>Условия</span>
                  <strong>{activeMemberPlan ? formatMoney(activeMemberPlan.baseAmount) : 'Не настроены'}</strong>
                </div>
                <ChevronRight size={16} />
                <div>
                  <span>Текущий счёт</span>
                  <strong>{activeMemberPayment ? statusLabels[activeMemberPayment.status] : 'Нет счёта'}</strong>
                </div>
                <ChevronRight size={16} />
                <div>
                  <span>История</span>
                  <strong>{activeMemberPaymentHistory.length} оплат</strong>
                </div>
              </div>
              <div className="payment-split-overview">
                <section className="payment-current-card">
                  <div className="payment-card-heading">
                    <span>Текущий счёт</span>
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
                    <span>Условия оплаты</span>
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
                    <div className="empty-state action-empty">
                      <p>
                        {paymentSearch.trim()
                          ? 'По этому поиску подтверждённых оплат нет.'
                          : 'Подтверждённых оплат пока нет.'}
                      </p>
                      <button className="small-button secondary" type="button" onClick={() => setPaymentView('all')}>
                        Все оплаты
                      </button>
                    </div>
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
                    <div className="empty-state action-empty">
                      <p>
                        {paymentSearch.trim()
                          ? 'По этому поиску задач по оплатам нет.'
                          : 'Сейчас нет задач по оплатам.'}
                      </p>
                      <button className="small-button secondary" type="button" onClick={() => setPaymentView('all')}>
                        Все оплаты
                      </button>
                    </div>
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
                    <div className="empty-state action-empty">
                      <p>
                        {visibleMembers.length === 0 ? 'Ученики ещё не добавлены.' : 'По этому фильтру оплат нет.'}
                      </p>
                      {paymentView !== 'all' ? (
                        <button className="small-button secondary" type="button" onClick={() => setPaymentView('all')}>
                          Все оплаты
                        </button>
                      ) : null}
                    </div>
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
                    <div className="payment-concept-strip">
                      <div>
                        <span>Условия</span>
                        <strong>{selectedPaymentPlan ? formatMoney(selectedPaymentPlan.baseAmount) : 'Не настроены'}</strong>
                      </div>
                      <ChevronRight size={16} />
                      <div>
                        <span>Текущий счёт</span>
                        <strong>{selectedPayment ? statusLabels[selectedPayment.status] : 'Нет счёта'}</strong>
                      </div>
                      <ChevronRight size={16} />
                      <div>
                        <span>История</span>
                        <strong>{selectedPaymentHistory.length} оплат</strong>
                      </div>
                    </div>
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
                            <dt>Источник</dt>
                            <dd>
                              {selectedPaymentPlan?.source === 'individual'
                                ? 'Индивидуальные'
                                : selectedPaymentPlan
                                  ? 'Условия группы'
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
                        {selectedPayment ? 'Изменить' : 'Настроить'}
                      </button>
                    ) : null}

                    {(hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')) && paymentEditOpen ? (
                      <div className="payment-edit-form">
                        <div className="payment-detail-section-heading">
                          <h3>{selectedPayment ? 'Условия и текущий счёт' : 'Новая оплата ученика'}</h3>
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
                              <>
                                <label className="payment-future-toggle">
                                  <input
                                    checked={paymentEditFor(selectedPaymentMember.id).individualTerms}
                                    type="checkbox"
                                    onChange={(event) =>
                                      updatePaymentEdit(selectedPaymentMember.id, {
                                        individualTerms: event.target.checked,
                                        updateFuture: event.target.checked
                                          ? true
                                          : paymentEditFor(selectedPaymentMember.id).updateFuture
                                      })
                                    }
                                  />
                                  Индивидуальные условия оплаты
                                </label>
                                <label className="payment-future-toggle">
                                  <input
                                    checked={paymentEditFor(selectedPaymentMember.id).updateFuture}
                                    type="checkbox"
                                    disabled={paymentEditFor(selectedPaymentMember.id).individualTerms}
                                    onChange={(event) => updatePaymentEdit(selectedPaymentMember.id, { updateFuture: event.target.checked })}
                                  />
                                  Использовать эту сумму в следующих месяцах
                                </label>
                              </>
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

        {activeSection === 'groups' && canViewGroups(activeUser) ? (
          <section className="crm-content-grid">
            <GroupsPanel
              activeUser={activeUser}
              workspace={workspace}
              groups={visibleGroups}
              lastCreatedGroupId={lastCreatedGroupId}
              isPendingAction={isPendingAction}
              buttonLabel={buttonLabel}
              onCreateGroup={openCreateGroup}
              onCreateInvite={(groupId) => void createMemberInviteForGroup(groupId)}
              onEditGroup={startGroupEdit}
              onDeleteGroup={(groupId) => void deleteGroup(groupId)}
            />
            {memberInvite ? (
                <InviteResultCard
                  invite={memberInvite}
                  inputLabel="Ссылка для набора"
                  className="group-invite-result"
                  onCopy={() => void copyMemberInvite()}
                  onClose={closeMemberInvite}
                  onShare={() => void shareMemberInvite()}
                />
              ) : null}

            {canManageGroups(activeUser) ? (
              <GroupFormModal
                draft={groupDraft}
                trainers={trainers}
                weekDays={weekDays}
                isOwner={hasRole(activeUser, 'owner')}
                isEditing={Boolean(editingGroupId)}
                isOpen={mobileFormOpen}
                isPending={isPendingAction(`save-group:${editingGroupId || 'new'}`)}
                submitLabel={buttonLabel(
                  `save-group:${editingGroupId || 'new'}`,
                  editingGroupId ? 'Сохранить группу' : 'Создать группу'
                )}
                trainerName={userName}
                onDraftChange={(patch) => setGroupDraft((current) => ({ ...current, ...patch }))}
                onToggleDay={toggleGroupDay}
                onSubmit={createGroup}
                onClose={() => setMobileFormOpen(false)}
                onCancelEdit={cancelGroupEdit}
              />
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

        {activeSection === 'settings' ? (
          <section className="settings-grid">
            <form className="crm-panel settings-card form-stack" onSubmit={saveProfileSettings}>
              <div className="crm-panel-header">
                <div>
                  <h2>Профиль</h2>
                  <p>Имя, контакт и данные для входа</p>
                </div>
                <Settings size={20} />
              </div>
              <div className="settings-card-body">
                <div className="settings-avatar-preview">
                  <span aria-hidden="true">
                    {activeUser.first_name.slice(0, 1)}
                    {activeUser.last_name.slice(0, 1)}
                  </span>
                  <div>
                    <strong>Фото профиля</strong>
                    <p>Загрузку аватара добавим после подключения Storage и правил доступа.</p>
                  </div>
                </div>
                <div className="split-fields">
                  <label>
                    Имя
                    <input
                      required
                      value={settingsDraft.firstName}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({ ...current, firstName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Фамилия
                    <input
                      required
                      value={settingsDraft.lastName}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({ ...current, lastName: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Телефон
                  <input
                    inputMode="tel"
                    placeholder="Номер для связи"
                    value={settingsDraft.phone}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </label>
                <div className="settings-readonly-list">
                  <div>
                    <span>Логин</span>
                    <strong>{activeUser.username ?? 'Не указан'}</strong>
                  </div>
                  <div>
                    <span>Email</span>
                    <strong>{activeUser.email ?? 'Не используется'}</strong>
                  </div>
                  <div>
                    <span>Роль</span>
                    <strong>{roleLabel(activeUser)}</strong>
                  </div>
                </div>
                <button className="primary-button" type="submit" disabled={isPendingAction('update-profile')}>
                  {isPendingAction('update-profile') ? 'Сохраняем...' : 'Сохранить профиль'}
                </button>
              </div>
            </form>

            <div className="settings-side-stack">
              {hasRole(activeUser, 'owner') ? (
                <form className="crm-panel settings-card form-stack" onSubmit={saveOrganizationSettings}>
                  <div className="crm-panel-header">
                    <div>
                      <h2>Клуб</h2>
                      <p>Название, которое видят тренеры и ученики</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <label>
                      Название клуба
                      <input
                        required
                        value={settingsDraft.organizationName}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({ ...current, organizationName: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={isPendingAction('update-organization')}
                    >
                      {isPendingAction('update-organization') ? 'Сохраняем...' : 'Сохранить клуб'}
                    </button>
                  </div>
                </form>
              ) : null}

              <section className="crm-panel settings-card">
                <div className="crm-panel-header">
                  <div>
                    <h2>Уведомления</h2>
                    <p>Push для важных оплат и запросов</p>
                  </div>
                  <Bell size={20} />
                </div>
                <div className="settings-card-body">
                  <div className="settings-status-row">
                    <span>Статус</span>
                    <strong>
                      {pushStatus === 'granted'
                        ? 'Включены'
                        : pushStatus === 'blocked'
                          ? 'Заблокированы'
                          : pushStatus === 'disabled'
                            ? 'Не настроены'
                            : pushStatus === 'unsupported'
                              ? 'Не поддерживаются'
                              : 'Выключены'}
                    </strong>
                  </div>
                  {pushStatus === 'granted' ? (
                    <p className="inline-note">Вы будете получать важные события по оплатам, когда браузер разрешает push.</p>
                  ) : pushStatus !== 'unsupported' && pushStatus !== 'blocked' ? (
                    <button className="primary-button" type="button" onClick={() => void enablePush()}>
                      Включить push
                    </button>
                  ) : (
                    <p className="inline-note">
                      Проверьте разрешения браузера или откройте приложение как PWA, если push недоступен.
                    </p>
                  )}
                </div>
              </section>

              {!isLocalMode ? (
                <section className="crm-panel settings-card">
                  <div className="settings-card-body">
                    <button className="small-button secondary settings-logout-button" type="button" onClick={() => void signOut()}>
                      <LogOut size={16} />
                      Выйти из аккаунта
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

      </main>
    </div>
  );
}

function Metric({
  hint,
  icon,
  label,
  onClick,
  tone = 'violet',
  value
}: {
  hint?: string;
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  tone?: 'violet' | 'danger';
  value: React.ReactNode;
}): React.ReactElement {
  const content = (
    <>
      {icon ? <span className="metric-icon">{icon}</span> : null}
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </>
  );

  if (onClick) {
    return (
      <button className={`metric-card metric-card-button ${tone}`} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={`metric-card ${tone}`}>{content}</article>;
}

function NavButton({
  active,
  count,
  icon,
  label,
  mobileHidden,
  onClick
}: {
  active: boolean;
  count?: number;
  icon: React.ReactNode;
  label: string;
  mobileHidden?: boolean;
  onClick: () => void;
}): React.ReactElement {
  const ignoreNextClickRef = useRef(false);

  function handleTouchEnd(event: React.TouchEvent<HTMLButtonElement>): void {
    event.preventDefault();
    ignoreNextClickRef.current = true;
    onClick();
    window.setTimeout(() => {
      ignoreNextClickRef.current = false;
    }, 350);
  }

  function handleClick(): void {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    onClick();
  }

  return (
    <button
      className={`${active ? 'crm-nav-button active' : 'crm-nav-button'}${mobileHidden ? ' mobile-hidden' : ''}`}
      type="button"
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
    >
      {icon}
      <span>{label}</span>
      {count ? <strong>{count}</strong> : null}
    </button>
  );
}
