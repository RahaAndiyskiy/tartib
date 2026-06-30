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
  Plus,
  RotateCcw,
  Settings,
  Share2,
  CalendarDays,
  Clock3,
  Layers3,
  UserRound,
  Wallet,
  Users
} from 'lucide-react';
import {
  createId,
  reconcileWorkspace,
  readActiveUserId,
  readWorkspace,
  resetWorkspace,
  writeActiveUserId,
  writeWorkspace,
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
  PaymentRequest,
} from '@shared/types/domain';
import {
  hasRole,
  roleLabel
} from '@/core/roles';
import {
  buildGroupDraftFromGroup,
  canManageGroups,
  canViewGroups,
  deleteGroupAction,
  GroupsPanel,
  mapGroupsById,
  selectVisibleGroups,
  submitGroupDraftAction,
  upsertGroupInWorkspace
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
  ExpenseDraft,
  GroupDraft,
  MemberInviteResult,
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
  todayString
} from './utils';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { GroupFormModal } from './GroupFormModal';
import { InviteLinkModal } from './InviteLinkModal';
import { InviteResultCard } from './InviteResultCard';
import {
  markNotificationsReadAction,
  NotificationsModal
} from '@/modules/notifications';
import {
  assignMemberToGroupAction,
  createMemberInviteAction,
  deleteMemberAction,
  filterPeopleForView,
  mapAssignmentsByMemberId,
  mapGroupMembershipByMemberId,
  PeoplePanel,
  selectAllMembers,
  selectPeopleForView,
  selectTrainers,
  selectVisibleMembers,
  submitPersonDraftAction
} from '@/modules/people';
import {
  applyGroupDefaultPaymentToMembers,
  buildMemberPaymentDetails,
  buildPaymentOverview,
  buildPaymentRegistry,
  buildPaymentTasks,
  buildSelectedPaymentDetails,
  decidePaymentDelayAction,
  decidePaymentStatusAction,
  deleteMemberPaymentAction,
  mapActivePlansByMemberId,
  mapCurrentPaymentsByMemberId,
  MemberPaymentPanel,
  PaymentDrawer,
  PaymentWorkspaceRegistryPanel,
  paymentTaskHeadline,
  requestPaymentDelayAction,
  saveLocalMemberPayment,
  saveRemoteMemberPaymentAction,
  selectVisiblePayments,
  submitPaymentConfirmationAction,
  submitPrepaymentAction,
  upsertBillingPlan,
  upsertPayment,
  usePaymentUiState,
  validateSavePaymentDraft,
  type PaymentView
} from '@/modules/payments';

export function DashboardApp(): React.ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const debugPerformance = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [activeUserId, setActiveUserId] = useState('');
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPersonDraft);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(emptyExpenseDraft);
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, ScheduleEdit>>({});
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    firstName: '',
    lastName: '',
    phone: '',
    organizationName: ''
  });
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
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleGroupFilter, setPeopleGroupFilter] = useState('all');
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({});
  const [groupEditorOpenByMember, setGroupEditorOpenByMember] = useState<Record<string, boolean>>({});
  const [historyOpenByMember, setHistoryOpenByMember] = useState<Record<string, boolean>>({});
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

  const {
    paymentEdits,
    paymentView,
    setPaymentView,
    paymentSearch,
    setPaymentSearch,
    selectedPaymentMemberId,
    setSelectedPaymentMemberId,
    paymentEditOpen,
    setPaymentEditOpen,
    paymentActionGroupsOpen,
    setPaymentActionGroupsOpen,
    setPrepaymentMonths,
    paymentEditFor,
    updatePaymentEdit,
    clearPaymentEdit,
    delayDraftFor,
    updateDelayDraft: updatePaymentDelayDraft,
    prepaymentMonthsFor,
    openPaymentsView: openPaymentUiView,
    selectPaymentMember
  } = usePaymentUiState({ currentPaymentByMemberId, activePlanByMemberId });

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
    openPaymentUiView(view);
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
  }

  function openNotificationPayment(paymentId?: string | null): void {
    if (!paymentId || !workspace) return;
    const payment = workspace.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    setActiveSection('payments');
    selectPaymentMember(payment.member_id, payment.status === 'paid' ? 'paid' : 'all');
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
    selectPaymentMember(payment.member_id, 'all');
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

    const result = await submitPersonDraftAction({
      workspace,
      activeUser,
      draft: personDraft,
      isLocalMode,
      runRemoteAction,
      now: new Date().toISOString(),
      periodLabel
    });

    if (result.kind === 'idle') return;

    if (result.kind === 'validation_error') {
      setMessage(result.message);
      return;
    }

    if (result.kind === 'create_member_invite') {
      await createMemberInviteForGroup(result.groupId);
      setPersonDraft((current) => ({
        ...emptyPersonDraft,
        role: 'member',
        groupId: current.groupId
      }));
      return;
    }

    if (result.kind === 'remote_trainer_created') {
      setPersonDraft(emptyPersonDraft);
      setMobileFormOpen(false);
      setMessage(result.message);
      return;
    }

    saveWorkspace(result.workspace);
    setPersonDraft(emptyPersonDraft);
    setMessage(result.message);
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

    const result = await submitGroupDraftAction({
      workspace,
      activeUser,
      editingGroupId,
      draft: groupDraft,
      isLocalMode,
      now: new Date().toISOString(),
      createId,
      runRemoteActionWithPending,
      syncDefaultPayments: ({ workspace: syncWorkspace, memberIds, trainerId, amount, billingDay, now }) =>
        applyGroupDefaultPaymentToMembers({
          workspace: syncWorkspace,
          memberIds,
          trainerId,
          amount,
          billingDay,
          dueDate: dueDateForBillingDay(billingDay),
          now,
          createId,
          periodLabel,
          statusForDueDate: (date) =>
            dateAtNoon(date) < dateAtNoon(todayString()) ? 'overdue' : 'active'
        })
    });

    if (result.kind === 'idle') return;

    if (result.kind === 'validation_error') {
      setMessage(result.message);
      return;
    }

    if (result.workspace) {
      saveWorkspace(result.workspace);
    } else {
      setWorkspace((current) => (current ? upsertGroupInWorkspace(current, result.group) : current));
    }

    setGroupDraft(emptyGroupDraft);
    setEditingGroupId('');
    setMobileFormOpen(false);
    setLastCreatedGroupId(result.wasEditing ? '' : result.group.id);
    if (result.refreshRemote) {
      void refreshRemoteWorkspace('group-save', 0);
    }
    setMessage(result.message);
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

    const validation = validateSavePaymentDraft({ edit, trainerId });
    if (!validation.ok && validation.reason === 'missing_trainer') {
      setMessage('У этого ученика не назначен тренер.');
      return;
    }
    if (!validation.ok && validation.reason === 'missing_due_date') {
      setMessage('Укажите сумму и срок оплаты.');
      return;
    }
    if (!validation.ok && validation.reason === 'invalid_amount') {
      setMessage('Сумма оплаты должна быть больше нуля.');
      return;
    }
    if (!edit || !trainerId || !validation.ok) return;

    if (!isLocalMode) {
      const data = await saveRemoteMemberPaymentAction({
        memberId,
        edit,
        amount: validation.amount,
        source: validation.source,
        runRemoteActionWithPending
      });
      if (data?.payment && data.billingPlan) {
        setWorkspace((current) =>
          current ? upsertPayment(upsertBillingPlan(current, data.billingPlan), data.payment) : current
        );
        clearPaymentEdit(memberId);
        setMessage('Оплата сохранена.');
      }
      return;
    }

    const existingPayment = currentPaymentByMemberId.get(memberId);
    const existingPlan = activePlanByMemberId.get(memberId);
    const result = saveLocalMemberPayment({
      workspace,
      memberId,
      trainerId,
      edit,
      amount: validation.amount,
      source: validation.source,
      existingPayment,
      existingPlan,
      now: new Date().toISOString(),
      createId,
      periodLabel
    });
    saveWorkspace(result.workspace);
    clearPaymentEdit(memberId);
    setMessage(result.paymentExisted ? 'Оплата обновлена.' : 'Оплата назначена.');
  }

  async function deleteMemberPayment(payment: PaymentRequest): Promise<void> {
    await deleteMemberPaymentAction({
      workspace,
      payment,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      clearPaymentEdit,
      confirmDelete: (message) => window.confirm(message),
      now: new Date().toISOString(),
      createId
    });
  }

  async function updatePaymentStatus(paymentId: string, status: PaymentRequest['status']): Promise<void> {
    const payment = workspace?.payments.find((item) => item.id === paymentId);

    await decidePaymentStatusAction({
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
      now: new Date().toISOString(),
      createId,
      statusAfterRejectedAction: (item) =>
        item.delay_status === 'approved' &&
        item.delay_requested_date &&
        dateAtNoon(item.delay_requested_date) >= dateAtNoon(todayString())
          ? 'delayed'
          : dateAtNoon(item.due_date) < dateAtNoon(todayString())
            ? 'overdue'
            : 'active',
      addMonthsDate,
      periodLabel
    });
  }

  function updateDelayDraft(paymentId: string, patch: Parameters<typeof updatePaymentDelayDraft>[1]): void {
    const payment = workspace?.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    updatePaymentDelayDraft(payment, patch);
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
    if (!activeUser || !hasRole(activeUser, 'member')) return;

    const payment = workspace?.payments.find((item) => item.id === paymentId);
    const draft = payment ? delayDraftFor(payment) : { requestedDate: '', comment: '' };

    await requestPaymentDelayAction({
      workspace,
      payment,
      requestedDate: draft.requestedDate,
      comment: draft.comment,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      now: new Date().toISOString(),
      createId,
      userName,
      isInvalidRequestedDate: (requestedDate, dueDate) =>
        !requestedDate ||
        dateAtNoon(requestedDate) <= dateAtNoon(dueDate) ||
        dateAtNoon(requestedDate) < dateAtNoon(todayString())
    });
  }

  async function decidePaymentDelay(paymentId: string, approved: boolean): Promise<void> {
    if (!activeUser || (!hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner'))) {
      return;
    }

    const payment = workspace?.payments.find((item) => item.id === paymentId);

    await decidePaymentDelayAction({
      workspace,
      payment,
      approved,
      actorId: activeUser.id,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      now: new Date().toISOString(),
      createId,
      statusForDueDate: (dueDate) =>
        dateAtNoon(dueDate) < dateAtNoon(todayString())
          ? 'overdue'
          : approved
            ? 'delayed'
            : 'active',
      periodLabel
    });
  }

  async function submitPaymentConfirmation(paymentId: string): Promise<void> {
    const payment = workspace?.payments.find((item) => item.id === paymentId);

    await submitPaymentConfirmationAction({
      workspace,
      payment,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      canSubmitPayment,
      now: new Date().toISOString(),
      createId,
      userName
    });
  }

  async function submitPrepayment(paymentId: string): Promise<void> {
    if (!activeUser || !hasRole(activeUser, 'member')) return;

    const payment = workspace?.payments.find((item) => item.id === paymentId);
    if (!payment || !canSubmitPrepayment(payment)) return;

    await submitPrepaymentAction({
      workspace,
      payment,
      plan: activePlanByMemberId.get(payment.member_id),
      months: prepaymentMonthsFor(paymentId),
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      now: new Date().toISOString(),
      createId,
      userName,
      prepaymentPeriodLabel
    });
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
    await markNotificationsReadAction({
      workspace,
      unreadCount: unreadNotifications.length,
      activeUserId,
      isLocalMode,
      runRemoteActionData,
      saveWorkspace,
      setWorkspace
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
          <MemberPaymentPanel
            activeUser={activeUser}
            activeMemberPlan={activeMemberPlan}
            activeMemberPayment={activeMemberPayment}
            activeMemberPaymentHistory={activeMemberPaymentHistory}
            activeMemberTrainer={activeMemberTrainer}
            activeMemberHistoryOpen={activeMemberHistoryOpen}
            statusLabels={statusLabels}
            planLabels={planLabels}
            formatLabels={formatLabels}
            todayString={todayString}
            formatShortDate={formatShortDate}
            prepaymentPeriodLabel={prepaymentPeriodLabel}
            canSubmitPayment={canSubmitPayment}
            canSubmitPrepayment={canSubmitPrepayment}
            paymentLockedText={paymentLockedText}
            delayDraftFor={delayDraftFor}
            updateDelayDraft={updateDelayDraft}
            prepaymentMonthsFor={prepaymentMonthsFor}
            setPrepaymentMonths={setPrepaymentMonths}
            setHistoryOpenByMember={setHistoryOpenByMember}
            isPendingAction={isPendingAction}
            submitPaymentConfirmation={(paymentId) => void submitPaymentConfirmation(paymentId)}
            requestPaymentDelay={(paymentId) => void requestPaymentDelay(paymentId)}
            openPrepayment={openPrepayment}
            submitPrepayment={(paymentId) => void submitPrepayment(paymentId)}
          />
        ) : null}
        {activeSection === 'payments' && !hasRole(activeUser, 'member') ? (
          <section className="payments-workspace">
            <PaymentWorkspaceRegistryPanel
              paymentView={paymentView}
              paymentSearch={paymentSearch}
              visibleMembers={visibleMembers}
              filteredPaymentMembers={filteredPaymentMembers}
              visiblePaymentActionGroups={visiblePaymentActionGroups}
              paidPaymentResults={paidPaymentResults}
              paymentActionCount={paymentActionCount}
              overduePaymentCount={overduePayments.length}
              paymentActionGroupsOpen={paymentActionGroupsOpen}
              currentPaymentByMemberId={currentPaymentByMemberId}
              activePlanByMemberId={activePlanByMemberId}
              selectedPaymentMemberId={selectedPaymentMemberId}
              planLabels={planLabels}
              statusLabels={statusLabels}
              userName={userName}
              groupFor={groupFor}
              formatShortDate={formatShortDate}
              setPaymentView={setPaymentView}
              setPaymentSearch={setPaymentSearch}
              setPaymentActionGroupsOpen={setPaymentActionGroupsOpen}
              setSelectedPaymentMemberId={setSelectedPaymentMemberId}
              setPaymentEditOpen={setPaymentEditOpen}
            />
            {selectedPaymentMember ? (
              <PaymentDrawer
                activeUser={activeUser}
                selectedPaymentMember={selectedPaymentMember}
                selectedPayment={selectedPayment}
                selectedPaymentPlan={selectedPaymentPlan}
                selectedPaymentGroup={selectedPaymentGroup}
                selectedPaymentTrainer={selectedPaymentTrainer}
                selectedPaymentHistory={selectedPaymentHistory}
                selectedPaymentHistoryOpen={selectedPaymentHistoryOpen}
                paymentEditOpen={paymentEditOpen}
                paymentEdit={paymentEditFor(selectedPaymentMember.id)}
                statusLabels={statusLabels}
                planLabels={planLabels}
                formatLabels={formatLabels}
                userName={userName}
                formatShortDate={formatShortDate}
                todayString={todayString}
                prepaymentPeriodLabel={prepaymentPeriodLabel}
                canManagePayments={hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')}
                canSubmitPayment={canSubmitPayment}
                canSubmitPrepayment={canSubmitPrepayment}
                paymentLockedText={paymentLockedText}
                delayDraftFor={delayDraftFor}
                updateDelayDraft={updateDelayDraft}
                prepaymentMonthsFor={prepaymentMonthsFor}
                setPrepaymentMonths={setPrepaymentMonths}
                setHistoryOpenByMember={setHistoryOpenByMember}
                isPendingAction={isPendingAction}
                buttonLabel={buttonLabel}
                onClose={() => setSelectedPaymentMemberId('')}
                onEditOpenChange={setPaymentEditOpen}
                onEditChange={updatePaymentEdit}
                onSavePayment={(memberId) => void saveMemberPayment(memberId)}
                onUpdatePaymentStatus={(paymentId, status) => void updatePaymentStatus(paymentId, status)}
                onDecidePaymentDelay={(paymentId, approved) => void decidePaymentDelay(paymentId, approved)}
                onSubmitPaymentConfirmation={(paymentId) => void submitPaymentConfirmation(paymentId)}
                onRequestPaymentDelay={(paymentId) => void requestPaymentDelay(paymentId)}
                onOpenPrepayment={openPrepayment}
                onSubmitPrepayment={(paymentId) => void submitPrepayment(paymentId)}
                onDeletePayment={(payment) => void deleteMemberPayment(payment)}
              />
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
