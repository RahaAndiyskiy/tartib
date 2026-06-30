'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Plus,
  RotateCcw,
  Settings,
  CalendarDays,
  Layers3,
  UserRound,
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
  type LocalNotification,
  type LocalTrainingGroup,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import {
  enablePushNotifications,
  pushPermissionState,
  pushSupported,
  type PushAvailability
} from '@shared/lib/pushClient';
import type {
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
import { ExpensesSection } from './components/ExpensesSection';
import { OverviewSection } from './components/OverviewSection';
import { ScheduleSection } from './components/ScheduleSection';
import { SettingsSection } from './components/SettingsSection';
import {
  markNotificationsReadAction,
  NotificationsModal
} from '@/modules/notifications';
import {
  saveOrganizationSettingsAction,
  saveProfileSettingsAction
} from '@/modules/account';
import {
  createExpenseAction,
  markExpensePaidAction
} from '@/modules/expenses';
import {
  patchScheduleEdit,
  saveScheduleAction,
  scheduleEditForMember
} from '@/modules/schedule';
import {
  assignMemberToGroupAction,
  createMemberInviteAction,
  deleteMemberAction,
  PeoplePanel,
  submitPersonDraftAction
} from '@/modules/people';
import {
  applyGroupDefaultPaymentToMembers,
  decidePaymentDelayAction,
  decidePaymentStatusAction,
  deleteMemberPaymentAction,
  MemberPaymentPanel,
  PaymentDrawer,
  PaymentWorkspaceRegistryPanel,
  requestPaymentDelayAction,
  saveLocalMemberPayment,
  saveRemoteMemberPaymentAction,
  submitPaymentConfirmationAction,
  submitPrepaymentAction,
  upsertBillingPlan,
  upsertPayment,
  validateSavePaymentDraft,
  type PaymentView
} from '@/modules/payments';
import { useDashboardData } from './model/useDashboardData';

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

  const weekDays = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'];

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
      const nextError = data.error ?? 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґР°РЅРЅС‹Рµ РєР»СѓР±Р°.';
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

  const dashboardData = useDashboardData({
    workspace,
    activeUserId,
    historyOpenByMember,
    peopleSearch,
    peopleGroupFilter
  });

  const {
    activeUser,
    trainers,
    visibleGroups,
    visibleMembers,
    assignmentsByMemberId,
    groupsById,
    currentPaymentByMemberId,
    activePlanByMemberId,
    trainerFor,
    groupFor,
    userName,
    paymentOverview,
    paymentRegistry,
    selectedPaymentDetails,
    todayTasks,
    todayTaskCount,
    todayTaskHeadline,
    activeMemberDetails,
    activeMemberTrainer,
    activeMemberGroup,
    activeMemberSchedule,
    unreadNotifications,
    userNotifications,
    peopleForView,
    filteredPeopleForView,
    currentExpenses,
    paidExpenses,
    pendingExpenses,
    paymentUi
  } = dashboardData;

  const {
    currentPayments,
    paidAmount,
    delayRequestedPayments,
    overduePayments,
    delayedPayments,
    paymentActionCount
  } = paymentOverview;
  const {
    filteredMembers: filteredPaymentMembers,
    visibleActionGroups: visiblePaymentActionGroups,
    paidResults: paidPaymentResults
  } = paymentRegistry;
  const {
    member: selectedPaymentMember,
    payment: selectedPayment,
    plan: selectedPaymentPlan,
    group: selectedPaymentGroup,
    trainer: selectedPaymentTrainer,
    history: selectedPaymentHistory,
    historyOpen: selectedPaymentHistoryOpen
  } = selectedPaymentDetails;
  const {
    payment: activeMemberPayment,
    plan: activeMemberPlan,
    history: activeMemberPaymentHistory,
    historyOpen: activeMemberHistoryOpen
  } = activeMemberDetails;
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
  } = paymentUi;

  const isPendingAction = (key: string): boolean => pendingAction === key;
  const buttonLabel = (key: string, defaultLabel: string): string =>
    isPendingAction(key)
      ? key.startsWith('create-invite:')
        ? 'Р“РѕС‚РѕРІРёРј СЃСЃС‹Р»РєСѓ...'
        : defaultLabel.toLowerCase().includes('СѓРґР°Р»')
          ? 'РЈРґР°Р»СЏРµРј...'
          : 'РЎРѕС…СЂР°РЅСЏРµРј...'
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
  const isMemberInviteForm =
    Boolean(activeUser) &&
    !isLocalMode &&
    ((hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
      personDraft.role === 'member');

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
      setMessage(data.error ?? 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РґРµР№СЃС‚РІРёРµ.');
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
      setMessage('РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№С‚Рµ РіСЂСѓРїРїСѓ, С‡С‚РѕР±С‹ РґР°С‚СЊ СЃСЃС‹Р»РєСѓ РЅР° РІСЃС‚СѓРїР»РµРЅРёРµ.');
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
      setMessage(result.localMode ? 'Р’ Р»РѕРєР°Р»СЊРЅРѕРј СЂРµР¶РёРјРµ СЃСЃС‹Р»РєР° РїРѕРєР°Р·Р°РЅР° РґР»СЏ РїСЂРѕРІРµСЂРєРё РёРЅС‚РµСЂС„РµР№СЃР°.' : '');
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
    setMessage('РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°.');
  }

  async function shareMemberInvite(): Promise<void> {
    if (!memberInvite) return;
    if (navigator.share) {
      await navigator.share({
        title: `РџСЂРёРіР»Р°С€РµРЅРёРµ РІ РіСЂСѓРїРїСѓ ${memberInvite.groupName}`,
        text: 'Р—Р°РІРµСЂС€РёС‚Рµ СЂРµРіРёСЃС‚СЂР°С†РёСЋ РІ Tartib Рё РїСЂРёСЃРѕРµРґРёРЅРёС‚РµСЃСЊ Рє РіСЂСѓРїРїРµ.',
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
    setMessage('Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РіСЂСѓРїРїС‹. Р’РЅРµСЃРёС‚Рµ РёР·РјРµРЅРµРЅРёСЏ Рё СЃРѕС…СЂР°РЅРёС‚Рµ.');
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

    setMessage('Р“СЂСѓРїРїР° СѓРґР°Р»РµРЅР°.');
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
      setMessage('РЈ СЌС‚РѕРіРѕ СѓС‡РµРЅРёРєР° РЅРµ РЅР°Р·РЅР°С‡РµРЅ С‚СЂРµРЅРµСЂ.');
      return;
    }
    if (!validation.ok && validation.reason === 'missing_due_date') {
      setMessage('РЈРєР°Р¶РёС‚Рµ СЃСѓРјРјСѓ Рё СЃСЂРѕРє РѕРїР»Р°С‚С‹.');
      return;
    }
    if (!validation.ok && validation.reason === 'invalid_amount') {
      setMessage('РЎСѓРјРјР° РѕРїР»Р°С‚С‹ РґРѕР»Р¶РЅР° Р±С‹С‚СЊ Р±РѕР»СЊС€Рµ РЅСѓР»СЏ.');
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
        setMessage('РћРїР»Р°С‚Р° СЃРѕС…СЂР°РЅРµРЅР°.');
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
    setMessage(result.paymentExisted ? 'РћРїР»Р°С‚Р° РѕР±РЅРѕРІР»РµРЅР°.' : 'РћРїР»Р°С‚Р° РЅР°Р·РЅР°С‡РµРЅР°.');
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

    const result = createExpenseAction({
      workspace,
      draft: expenseDraft,
      now: new Date().toISOString(),
      createId,
      periodLabel
    });

    if (!result) return;
    if ('error' in result) {
      setMessage(result.error);
      return;
    }

    saveWorkspace(result.workspace);
    setExpenseDraft(emptyExpenseDraft);
    setMessage(result.message);
  }

  function markExpensePaid(expenseId: string): void {
    const result = markExpensePaidAction({
      workspace,
      expenseId,
      now: new Date().toISOString(),
      createId,
      nextMonthDate,
      periodLabel
    });

    if (!result) return;
    saveWorkspace(result.workspace);
    setMessage(result.message);
  }

  function scheduleEditFor(memberId: string): ScheduleEdit {
    return scheduleEditForMember({
      workspace,
      edits: scheduleEdits,
      memberId
    });
  }

  function updateScheduleEdit(memberId: string, patch: Partial<ScheduleEdit>): void {
    setScheduleEdits((current) =>
      patchScheduleEdit({
        current,
        workspace,
        memberId,
        patch
      })
    );
  }

  function saveSchedule(memberId: string): void {
    const result = saveScheduleAction({
      workspace,
      activeUser,
      memberId,
      edit: scheduleEdits[memberId] ?? scheduleEditFor(memberId),
      trainer: trainerFor(memberId),
      now: new Date().toISOString(),
      createId
    });

    if (!result) return;
    if ('error' in result) {
      setMessage(result.error);
      return;
    }

    saveWorkspace(result.workspace);
    setMessage(result.message);
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
      setMessage('Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ СЌС‚РёРј Р±СЂР°СѓР·РµСЂРѕРј.');
      return;
    }

    try {
      const nextStatus = await enablePushNotifications();
      setPushStatus(nextStatus);
      setMessage(
        nextStatus === 'granted'
          ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РІРєР»СЋС‡РµРЅС‹.'
          : nextStatus === 'disabled'
            ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РїРѕРєР° РЅРµ РЅР°СЃС‚СЂРѕРµРЅС‹ РЅР° СЃРµСЂРІРµСЂРµ.'
            : nextStatus === 'blocked'
              ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅС‹ РІ РЅР°СЃС‚СЂРѕР№РєР°С… Р±СЂР°СѓР·РµСЂР°.'
              : 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅРµ РІРєР»СЋС‡РµРЅС‹.'
      );
    } catch (error) {
      console.warn('[push] enable failed', error);
      setMessage(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РІРєР»СЋС‡РёС‚СЊ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ.');
    }
  }

  async function saveProfileSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await saveProfileSettingsAction({
      workspace,
      activeUser,
      draft: settingsDraft,
      isLocalMode,
      runRemoteActionData,
      saveWorkspace,
      setWorkspace,
      setPendingAction,
      setMessage
    });
  }

  async function saveOrganizationSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await saveOrganizationSettingsAction({
      workspace,
      activeUser,
      draft: settingsDraft,
      isLocalMode,
      runRemoteActionData,
      saveWorkspace,
      setWorkspace,
      setPendingAction,
      setMessage
    });
  }
  function handleReset(): void {
    const nextWorkspace = resetWorkspace();
    const owner = nextWorkspace.users[0];
    setWorkspace(nextWorkspace);
    setActiveUserId(owner.id);
    setMessage('РўРµСЃС‚РѕРІС‹Рµ РґР°РЅРЅС‹Рµ СЃР±СЂРѕС€РµРЅС‹.');
  }

  function openNewWindow(): void {
    window.open('/dashboard', '_blank', 'noopener,noreferrer');
  }

  async function signOut(): Promise<void> {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  const sectionMeta: Record<DashboardSection, { title: string; description: string }> = {
    overview: {
      title: 'РћР±Р·РѕСЂ',
      description: 'Р“Р»Р°РІРЅС‹Рµ РїРѕРєР°Р·Р°С‚РµР»Рё Рё С‚РµРєСѓС‰Р°СЏ СЃРёС‚СѓР°С†РёСЏ РІ РєР»СѓР±Рµ'
    },
    people: {
      title:
        activeUser && hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
          ? 'РњРѕРё СѓС‡РµРЅРёРєРё'
          : 'РљРѕРјР°РЅРґР°',
      description: 'РўСЂРµРЅРµСЂС‹, СѓС‡РµРЅРёРєРё Рё СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµ РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚Рё'
    },
    payments: {
      title: activeUser?.role === 'member' ? 'РњРѕСЏ РѕРїР»Р°С‚Р°' : 'РћРїР»Р°С‚С‹',
      description: 'РўРµРєСѓС‰РёРµ СЃСѓРјРјС‹, СЃСЂРѕРєРё Рё РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СѓС‡РµРЅРёРєРѕРІ'
    },
    groups: {
      title: 'Р“СЂСѓРїРїС‹',
      description: 'РќР°РїСЂР°РІР»РµРЅРёСЏ, РґРЅРё Рё РІСЂРµРјСЏ Р·Р°РЅСЏС‚РёР№ С‚СЂРµРЅРµСЂРѕРІ'
    },
    schedule: {
      title: activeUser?.role === 'member' ? 'РњРѕС‘ СЂР°СЃРїРёСЃР°РЅРёРµ' : 'Р Р°СЃРїРёСЃР°РЅРёРµ',
      description:
        activeUser?.role === 'member'
          ? 'Р”РЅРё Рё РІСЂРµРјСЏ РІР°С€РёС… С‚СЂРµРЅРёСЂРѕРІРѕРє'
          : 'Р Р°СЃРїРёСЃР°РЅРёРµ С‚СЂРµРЅРёСЂРѕРІРѕРє СѓС‡РµРЅРёРєРѕРІ'
    },
    expenses: {
      title: 'Р Р°СЃС…РѕРґС‹',
      description: 'РђСЂРµРЅРґР°, РєРѕРјРјСѓРЅР°Р»СЊРЅС‹Рµ Рё РґСЂСѓРіРёРµ Р·Р°С‚СЂР°С‚С‹ РєР»СѓР±Р°'
    },
    settings: {
      title: 'РќР°СЃС‚СЂРѕР№РєРё',
      description: 'РџСЂРѕС„РёР»СЊ, СѓРІРµРґРѕРјР»РµРЅРёСЏ Рё РїР°СЂР°РјРµС‚СЂС‹ РєР»СѓР±Р°'
    }
  };

  if (!workspace || !activeUser) {
    return (
      <main className="app-shell loading-state">
        <section className="loading-card">
          <strong>Р—Р°РіСЂСѓР¶Р°РµРј РєР»СѓР±...</strong>
          {workspaceLoadError ? (
            <>
              <p>{workspaceLoadError}</p>
              <div>
                <button className="primary-button" type="button" onClick={() => void refreshRemoteWorkspace('manual', 0)}>
                  РџРѕРІС‚РѕСЂРёС‚СЊ
                </button>
                <button className="ghost-button" type="button" onClick={() => { window.location.href = '/login'; }}>
                  Р’РѕР№С‚Рё Р·Р°РЅРѕРІРѕ
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
            <span>РЈРїСЂР°РІР»РµРЅРёРµ РєР»СѓР±РѕРј</span>
          </div>
        </div>

        <div className="crm-organization">
          <span>РћСЂРіР°РЅРёР·Р°С†РёСЏ</span>
          <strong>{workspace.organization.name}</strong>
        </div>

        <nav className="crm-nav" aria-label="Р Р°Р·РґРµР»С‹">
          <NavButton
            active={activeSection === 'overview'}
            icon={<LayoutDashboard size={18} />}
            label="РћР±Р·РѕСЂ"
            onClick={() => openSection('overview')}
          />
          {!hasRole(activeUser, 'member') ? (
            <NavButton
              active={activeSection === 'people'}
              icon={<Users size={18} />}
              label={
                hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
                  ? 'РњРѕРё СѓС‡РµРЅРёРєРё'
                  : 'РљРѕРјР°РЅРґР°'
              }
              onClick={() => openSection('people')}
            />
          ) : null}
          <NavButton
            active={activeSection === 'payments'}
            icon={<CreditCard size={18} />}
            label="РћРїР»Р°С‚С‹"
            onClick={() => openSection('payments')}
          />
          {hasRole(activeUser, 'member') ? (
            <NavButton
              active={activeSection === 'schedule'}
              icon={<CalendarDays size={18} />}
              label="Р Р°СЃРїРёСЃР°РЅРёРµ"
              onClick={() => openSection('schedule')}
            />
          ) : (
            <NavButton
              active={activeSection === 'groups'}
              icon={<Layers3 size={18} />}
              label="Р“СЂСѓРїРїС‹"
              onClick={() => openSection('groups')}
            />
          )}
          <NavButton
            active={activeSection === 'settings'}
            icon={<Settings size={18} />}
            label="РќР°СЃС‚СЂРѕР№РєРё"
            mobileHidden
            onClick={() => openSection('settings')}
          />
        </nav>

        <div className="crm-sidebar-footer">
          {isLocalMode ? (
            <label className="crm-role-select">
              Р Р°Р±РѕС‚Р°С‚СЊ РєР°Рє
              <select value={activeUser.id} onChange={(event) => selectActiveUser(event.target.value)}>
                {workspace.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} В· {roleLabel(user)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="crm-sidebar-action" type="button" onClick={openNewWindow}>
            <ExternalLink size={16} />
            РќРѕРІРѕРµ РѕРєРЅРѕ
          </button>
          {isLocalMode ? (
            <button className="crm-sidebar-action danger" type="button" onClick={handleReset}>
              <RotateCcw size={16} />
              РЎР±СЂРѕСЃРёС‚СЊ РґР°РЅРЅС‹Рµ
            </button>
          ) : (
            <button className="crm-sidebar-action" type="button" onClick={() => void signOut()}>
              <LogOut size={16} />
              Р’С‹Р№С‚Рё
            </button>
          )}
        </div>
      </aside>

      <main className="crm-main">
        {mobileAccountOpen ? (
          <button
            aria-label="Р—Р°РєСЂС‹С‚СЊ РјРµРЅСЋ Р°РєРєР°СѓРЅС‚Р°"
            className="mobile-account-dismiss"
            type="button"
            onClick={() => setMobileAccountOpen(false)}
          />
        ) : null}
        {mobileFormOpen ? (
          <button
            aria-label="Р—Р°РєСЂС‹С‚СЊ С„РѕСЂРјСѓ РґРѕР±Р°РІР»РµРЅРёСЏ"
            className="mobile-form-backdrop"
            type="button"
            onClick={() => setMobileFormOpen(false)}
          />
        ) : null}
        <div className={mobileAccountOpen ? 'mobile-topbar account-open' : 'mobile-topbar'}>
          <div className="mobile-account-cluster">
            <button
              aria-expanded={mobileAccountOpen}
              aria-label="РњРµРЅСЋ Р°РєРєР°СѓРЅС‚Р°"
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
              aria-label="РђРєРєР°СѓРЅС‚"
              className="mobile-account-action action-account"
              type="button"
              tabIndex={mobileAccountOpen ? 0 : -1}
              onClick={() => openSection('settings')}
            >
              <UserRound size={18} />
            </button>
            <button
              aria-label="РќР°СЃС‚СЂРѕР№РєРё"
              className="mobile-account-action action-settings"
              type="button"
              tabIndex={mobileAccountOpen ? 0 : -1}
              onClick={() => openSection('settings')}
            >
              <Settings size={18} />
            </button>
            {!isLocalMode ? (
              <button
                aria-label="Р’С‹Р№С‚Рё"
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
            aria-label="РЈРІРµРґРѕРјР»РµРЅРёСЏ"
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
              aria-label="РЈРІРµРґРѕРјР»РµРЅРёСЏ"
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
                aria-label="Р”РѕР±Р°РІРёС‚СЊ"
                className="mobile-create-button"
                type="button"
                onClick={() => setMobileFormOpen(true)}
              >
                <Plus size={18} />
                {activeSection === 'groups' ? 'РќРѕРІР°СЏ РіСЂСѓРїРїР°' : 'Р”РѕР±Р°РІРёС‚СЊ'}
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
          <OverviewSection
            activeUser={activeUser}
            activeMemberPayment={activeMemberPayment}
            activeMemberTrainer={activeMemberTrainer}
            activeMemberGroup={activeMemberGroup}
            activeMemberSchedule={activeMemberSchedule}
            todayTasks={todayTasks}
            todayTaskCount={todayTaskCount}
            todayTaskHeadline={todayTaskHeadline}
            visibleGroups={visibleGroups}
            paidAmount={paidAmount}
            currentPayments={currentPayments}
            overduePayments={overduePayments}
            delayRequestedPayments={delayRequestedPayments}
            delayedPayments={delayedPayments}
            delayDraftFor={delayDraftFor}
            updateDelayDraft={updateDelayDraft}
            submitPaymentConfirmation={(paymentId) => void submitPaymentConfirmation(paymentId)}
            requestPaymentDelay={(paymentId) => void requestPaymentDelay(paymentId)}
            openPrepayment={openPrepayment}
            openPaymentsView={openPaymentsView}
            openOverviewInviteFlow={openOverviewInviteFlow}
            isPendingAction={isPendingAction}
          />
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
                    <h2>{hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'РќРѕРІС‹Р№ СѓС‡РµРЅРёРє' : 'РќРѕРІС‹Р№ С‡РµР»РѕРІРµРє'}</h2>
                    <p>Р”РѕР±Р°РІР»РµРЅРёРµ РІ РєР»СѓР±</p>
                  </div>
                  <button
                    className="form-close-button"
                    aria-label="Р—Р°РєСЂС‹С‚СЊ С„РѕСЂРјСѓ"
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
                      РўСЂРµРЅРµСЂ
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
                      РЈС‡РµРЅРёРє
                    </button>
                  </div>
                ) : null}

                {!isMemberInviteForm ? (
                  <>
                    <label>РРјСЏ<input required value={personDraft.firstName} onChange={(event) => setPersonDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                    <label>Р¤Р°РјРёР»РёСЏ<input required value={personDraft.lastName} onChange={(event) => setPersonDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                  </>
                ) : null}
                {!isLocalMode &&
                !(
                  (hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
                  personDraft.role === 'member'
                ) ? (
                  <div className="split-fields">
                    <label>
                      Р›РѕРіРёРЅ
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
                      Р’СЂРµРјРµРЅРЅС‹Р№ РїР°СЂРѕР»СЊ
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
                  <label>РўРµР»РµС„РѕРЅ <span className="optional-label">РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ</span><input value={personDraft.phone} onChange={(event) => setPersonDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                ) : null}

                {(hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) || personDraft.role === 'member' ? (
                  <>
                    <label>
                      Р“СЂСѓРїРїР°
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
                        <option value="">Р’С‹Р±РµСЂРёС‚Рµ РіСЂСѓРїРїСѓ</option>
                        {visibleGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.activity} В· {group.days} {group.time}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="inline-hint invite-form-hint">
                      РЈС‡РµРЅРёРє СЃР°Рј СЃРѕР·РґР°СЃС‚ Р»РѕРіРёРЅ Рё РїР°СЂРѕР»СЊ РїРѕ СЃСЃС‹Р»РєРµ. РџРѕСЃР»Рµ СЂРµРіРёСЃС‚СЂР°С†РёРё РѕРЅ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕСЏРІРёС‚СЃСЏ РІ СЌС‚РѕР№ РіСЂСѓРїРїРµ.
                    </p>
                  </>
                ) : null}

                <button className="primary-button" type="submit">
                  {(hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) || personDraft.role === 'member' ? 'РЎРѕР·РґР°С‚СЊ РїСЂРёРіР»Р°С€РµРЅРёРµ' : 'Р”РѕР±Р°РІРёС‚СЊ С‚СЂРµРЅРµСЂР°'}
                </button>

                {memberInvite &&
                ((hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
                  personDraft.role === 'member') ? (
                  <InviteResultCard
                    invite={memberInvite}
                    inputLabel="РЎСЃС‹Р»РєР°-РїСЂРёРіР»Р°С€РµРЅРёРµ"
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
                  inputLabel="РЎСЃС‹Р»РєР° РґР»СЏ РЅР°Р±РѕСЂР°"
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
                  editingGroupId ? 'РЎРѕС…СЂР°РЅРёС‚СЊ РіСЂСѓРїРїСѓ' : 'РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ'
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
          <ScheduleSection
            activeUser={activeUser}
            visibleMembers={visibleMembers}
            activeMemberGroup={activeMemberGroup}
            activeMemberSchedule={activeMemberSchedule}
            activeMemberTrainer={activeMemberTrainer}
            userName={userName}
            trainerFor={trainerFor}
            scheduleEditFor={scheduleEditFor}
            updateScheduleEdit={updateScheduleEdit}
            saveSchedule={saveSchedule}
          />
        ) : null}
        {activeSection === 'expenses' && activeUser.role === 'owner' ? (
          <ExpensesSection
            workspace={workspace}
            currentExpenses={currentExpenses}
            paidExpenses={paidExpenses}
            pendingExpenses={pendingExpenses}
            expenseDraft={expenseDraft}
            onExpenseDraftChange={setExpenseDraft}
            onCreateExpense={createExpense}
            onMarkExpensePaid={markExpensePaid}
          />
        ) : null}
        {activeSection === 'settings' ? (
          <SettingsSection
            activeUser={activeUser}
            settingsDraft={settingsDraft}
            pushStatus={pushStatus}
            isLocalMode={isLocalMode}
            isPendingAction={isPendingAction}
            onSettingsDraftChange={setSettingsDraft}
            onSaveProfile={saveProfileSettings}
            onSaveOrganization={saveOrganizationSettings}
            onEnablePush={() => void enablePush()}
            onSignOut={() => void signOut()}
          />
        ) : null}
      </main>
    </div>
  );
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
