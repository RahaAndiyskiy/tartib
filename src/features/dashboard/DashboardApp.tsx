'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  createId,
  type LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type { PaymentRequest } from '@shared/types/domain';
import {
  hasRole
} from '@/core/roles';
import {
  buildGroupDraftFromGroup,
  canManageGroups,
  canViewGroups,
  deleteGroupAction,
  submitGroupDraftAction,
  upsertGroupInWorkspace
} from '@/modules/groups';
import {
  emptyGroupDraft,
  formatLabels,
  planLabels,
  statusLabels
} from './constants';
import type {
  DashboardSection,
  GroupDraft
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
import { DashboardOverlays } from './components/DashboardOverlays';
import { DashboardShell } from './components/DashboardShell';
import { ExpensesSection } from './components/ExpensesSection';
import { GroupsSection } from './components/GroupsSection';
import { OverviewSection } from './components/OverviewSection';
import { PersonFormPanel } from './components/PersonFormPanel';
import { PaymentWorkspaceSection } from './components/PaymentWorkspaceSection';
import { ScheduleSection } from './components/ScheduleSection';
import { SettingsSection } from './components/SettingsSection';
import {
  assignMemberToGroupAction,
  deleteMemberAction,
  PeoplePanel,
} from '@/modules/people';
import {
  applyGroupDefaultPaymentToMembers,
  decidePaymentDelayAction,
  decidePaymentStatusAction,
  deleteMemberPaymentAction,
  MemberPaymentPanel,
  requestPaymentDelayAction,
  saveLocalMemberPayment,
  saveRemoteMemberPaymentAction,
  submitPaymentConfirmationAction,
  submitPrepaymentAction,
  upsertBillingPlan,
  upsertPayment,
  validateSavePaymentDraft
} from '@/modules/payments';
import { useDashboardData } from './model/useDashboardData';
import { buildSectionMeta } from './model/navigation';
import { useAccountRuntime } from './model/useAccountRuntime';
import { useDashboardChrome } from './model/useDashboardChrome';
import { useExpensesController } from './model/useExpensesController';
import { useNotificationsController } from './model/useNotificationsController';
import { usePendingAction } from './model/usePendingAction';
import { usePeopleFlowController } from './model/usePeopleFlowController';
import { usePaymentNavigation } from './model/usePaymentNavigation';
import { useScheduleController } from './model/useScheduleController';
import { useSettingsController } from './model/useSettingsController';
import { useWorkspaceRuntime } from './model/useWorkspaceRuntime';

export function DashboardApp(): React.ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const debugPerformance = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [editingGroupId, setEditingGroupId] = useState('');
  const [message, setMessage] = useState('');
  const chrome = useDashboardChrome('overview');
  const {
    activeSection,
    mobileFormOpen,
    mobileAccountOpen,
    notificationsOpen,
    logoutConfirmOpen,
    invitePickerOpen
  } = chrome;
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleGroupFilter, setPeopleGroupFilter] = useState('all');
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({});
  const [groupEditorOpenByMember, setGroupEditorOpenByMember] = useState<Record<string, boolean>>({});
  const [historyOpenByMember, setHistoryOpenByMember] = useState<Record<string, boolean>>({});
  const {
    workspace,
    activeUserId,
    workspaceLoadError,
    setWorkspace,
    setActiveUserId,
    saveWorkspace,
    refreshRemoteWorkspace,
    runRemoteAction,
    runRemoteActionData
  } = useWorkspaceRuntime({
    activeSection,
    debugPerformance,
    isLocalMode,
    setMessage
  });
  const {
    buttonLabel,
    isPendingAction,
    runRemoteActionWithPending
  } = usePendingAction({ runRemoteActionData });
  const {
    enablePush,
    handleReset,
    openNewWindow,
    pushStatus,
    signOut
  } = useAccountRuntime({
    isLocalMode,
    setActiveUserId,
    setMessage,
    setWorkspace
  });
  const {
    createExpense,
    expenseDraft,
    markExpensePaid,
    setExpenseDraft
  } = useExpensesController({
    createId,
    nextMonthDate,
    periodLabel,
    saveWorkspace,
    setMessage,
    workspace
  });

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

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
  const {
    saveOrganizationSettings,
    saveProfileSettings,
    setSettingsDraft,
    settingsDraft
  } = useSettingsController({
    activeUser,
    isLocalMode,
    runRemoteActionWithPending,
    saveWorkspace,
    setMessage,
    setWorkspace,
    workspace
  });
  const {
    markNotificationsRead,
    openNotifications
  } = useNotificationsController({
    activeUserId,
    isLocalMode,
    openNotificationsPanel: chrome.openNotifications,
    runRemoteActionData,
    saveWorkspace,
    setWorkspace,
    unreadNotifications,
    workspace
  });
  const {
    saveSchedule,
    scheduleEditFor,
    updateScheduleEdit
  } = useScheduleController({
    activeUser,
    createId,
    saveWorkspace,
    setMessage,
    trainerFor,
    workspace
  });
  const {
    canDecideNotificationPayment,
    canSubmitPrepayment,
    notificationPayment,
    openNotificationPayment,
    openPaymentsView,
    openPrepayment
  } = usePaymentNavigation({
    activePlanByMemberId,
    activeUser,
    openPaymentUiView,
    openPayments: chrome.openPayments,
    selectPaymentMember,
    workspace
  });
  const {
    addPerson,
    clearMemberInvite,
    closeMemberInvite,
    closeOverviewInviteModal,
    copyMemberInvite,
    createMemberInviteForGroup,
    isMemberInviteForm,
    lastCreatedGroupId,
    memberInvite,
    openInviteFlow,
    openOverviewInviteFlow,
    personDraft,
    selectActiveUser,
    setLastCreatedGroupId,
    shareMemberInvite,
    updatePersonDraft
  } = usePeopleFlowController({
    activeSection,
    activeUser,
    closeInvitePicker: chrome.closeInvitePicker,
    closeMobileForm: chrome.closeMobileForm,
    groups: visibleGroups,
    isLocalMode,
    openFormSection: chrome.openFormSection,
    openInvitePicker: chrome.openInvitePicker,
    periodLabel,
    runRemoteAction,
    runRemoteActionWithPending,
    saveWorkspace,
    setActiveUserId,
    setMessage,
    switchActiveUserSection: chrome.switchActiveUserSection,
    users: workspace?.users ?? [],
    workspace
  });

  function openSection(section: DashboardSection): void {
    chrome.openSection(section);
  }

  function openCreateGroup(): void {
    chrome.openFormSection('groups');
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
    setMessage('');
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
    chrome.closeMobileForm();
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
    clearMemberInvite();
    setGroupDraft(buildGroupDraftFromGroup(group));
    chrome.openMobileForm();
    setMessage('Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РіСЂСѓРїРїС‹. Р’РЅРµСЃРёС‚Рµ РёР·РјРµРЅРµРЅРёСЏ Рё СЃРѕС…СЂР°РЅРёС‚Рµ.');
  }

  function cancelGroupEdit(): void {
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
    chrome.closeMobileForm();
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
  const sectionMeta = buildSectionMeta(activeUser);

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
    <DashboardShell
      workspace={workspace}
      activeUser={activeUser}
      activeSection={activeSection}
      sectionMeta={sectionMeta}
      isLocalMode={isLocalMode}
      mobileAccountOpen={mobileAccountOpen}
      mobileFormOpen={mobileFormOpen}
      notificationsOpen={notificationsOpen}
      unreadNotificationCount={unreadNotifications.length}
      onOpenSection={openSection}
      onSelectActiveUser={selectActiveUser}
      onOpenNewWindow={openNewWindow}
      onReset={handleReset}
      onSignOut={() => void signOut()}
      onRequestLogout={chrome.requestLogout}
      onToggleMobileAccount={chrome.toggleMobileAccount}
      onCloseMobileAccount={chrome.closeMobileAccount}
      onOpenMobileForm={chrome.openMobileForm}
      onCloseMobileForm={chrome.closeMobileForm}
      onOpenNotifications={openNotifications}
    >
        {message ? <p className="notice success">{message}</p> : null}

        <DashboardOverlays
          notificationsOpen={notificationsOpen}
          logoutConfirmOpen={logoutConfirmOpen}
          inviteModalOpen={invitePickerOpen || (activeSection === 'overview' && Boolean(memberInvite))}
          notifications={userNotifications}
          unreadCount={unreadNotifications.length}
          pushStatus={pushStatus}
          invite={memberInvite}
          groups={visibleGroups}
          paymentForNotification={notificationPayment}
          canDecidePayment={canDecideNotificationPayment}
          isPendingAction={isPendingAction}
          isPendingInviteGroup={(groupId) => isPendingAction(`create-invite:${groupId}`)}
          onCloseNotifications={chrome.closeNotifications}
          onEnablePush={() => void enablePush()}
          onMarkNotificationsRead={() => void markNotificationsRead()}
          onDecidePayment={(paymentId, status) => void updatePaymentStatus(paymentId, status)}
          onDecideDelay={(paymentId, approved) => void decidePaymentDelay(paymentId, approved)}
          onOpenNotificationPayment={openNotificationPayment}
          onCancelLogout={chrome.closeLogoutConfirm}
          onConfirmLogout={() => void signOut()}
          onCreateInvite={(groupId) => void createMemberInviteForGroup(groupId)}
          onCopyInvite={() => void copyMemberInvite()}
          onShareInvite={() => void shareMemberInvite()}
          onCloseInvite={closeOverviewInviteModal}
        />
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
            <PersonFormPanel
              activeUser={activeUser}
              draft={personDraft}
              groups={visibleGroups}
              invite={memberInvite}
              isLocalMode={isLocalMode}
              isOpen={mobileFormOpen}
              isMemberInviteForm={isMemberInviteForm}
              onSubmit={addPerson}
              onClose={chrome.closeMobileForm}
              onDraftChange={updatePersonDraft}
              onClearInvite={clearMemberInvite}
              onCopyInvite={() => void copyMemberInvite()}
              onCloseInvite={closeMemberInvite}
              onShareInvite={() => void shareMemberInvite()}
            />
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
          <PaymentWorkspaceSection
            activeUser={activeUser}
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
            selectedPaymentMember={selectedPaymentMember}
            selectedPayment={selectedPayment}
            selectedPaymentPlan={selectedPaymentPlan}
            selectedPaymentGroup={selectedPaymentGroup}
            selectedPaymentTrainer={selectedPaymentTrainer}
            selectedPaymentHistory={selectedPaymentHistory}
            selectedPaymentHistoryOpen={selectedPaymentHistoryOpen}
            paymentEditOpen={paymentEditOpen}
            statusLabels={statusLabels}
            planLabels={planLabels}
            formatLabels={formatLabels}
            userName={userName}
            groupFor={groupFor}
            formatShortDate={formatShortDate}
            todayString={todayString}
            prepaymentPeriodLabel={prepaymentPeriodLabel}
            canSubmitPayment={canSubmitPayment}
            canSubmitPrepayment={canSubmitPrepayment}
            paymentLockedText={paymentLockedText}
            delayDraftFor={delayDraftFor}
            updateDelayDraft={updateDelayDraft}
            prepaymentMonthsFor={prepaymentMonthsFor}
            setPrepaymentMonths={setPrepaymentMonths}
            setHistoryOpenByMember={setHistoryOpenByMember}
            setPaymentView={setPaymentView}
            setPaymentSearch={setPaymentSearch}
            setPaymentActionGroupsOpen={setPaymentActionGroupsOpen}
            setSelectedPaymentMemberId={setSelectedPaymentMemberId}
            setPaymentEditOpen={setPaymentEditOpen}
            isPendingAction={isPendingAction}
            buttonLabel={buttonLabel}
            paymentEditFor={paymentEditFor}
            updatePaymentEdit={updatePaymentEdit}
            saveMemberPayment={(memberId) => void saveMemberPayment(memberId)}
            updatePaymentStatus={(paymentId, status) => void updatePaymentStatus(paymentId, status)}
            decidePaymentDelay={(paymentId, approved) => void decidePaymentDelay(paymentId, approved)}
            submitPaymentConfirmation={(paymentId) => void submitPaymentConfirmation(paymentId)}
            requestPaymentDelay={(paymentId) => void requestPaymentDelay(paymentId)}
            openPrepayment={openPrepayment}
            submitPrepayment={(paymentId) => void submitPrepayment(paymentId)}
            deleteMemberPayment={(payment) => void deleteMemberPayment(payment)}
          />
        ) : null}
        {activeSection === 'groups' ? (
          <GroupsSection
            activeUser={activeUser}
            workspace={workspace}
            groups={visibleGroups}
            trainers={trainers}
            draft={groupDraft}
            invite={memberInvite}
            weekDays={weekDays}
            canView={canViewGroups(activeUser)}
            canManage={canManageGroups(activeUser)}
            isOwner={hasRole(activeUser, 'owner')}
            isEditing={Boolean(editingGroupId)}
            isOpen={mobileFormOpen}
            isPending={isPendingAction(`save-group:${editingGroupId || 'new'}`)}
            lastCreatedGroupId={lastCreatedGroupId}
            submitLabel={buttonLabel(
              `save-group:${editingGroupId || 'new'}`,
              editingGroupId ? 'Сохранить группу' : 'Создать группу'
            )}
            trainerName={userName}
            isPendingAction={isPendingAction}
            buttonLabel={buttonLabel}
            onCreateGroup={openCreateGroup}
            onCreateInvite={(groupId) => void createMemberInviteForGroup(groupId)}
            onEditGroup={startGroupEdit}
            onDeleteGroup={(groupId) => void deleteGroup(groupId)}
            onDraftChange={(patch) => setGroupDraft((current) => ({ ...current, ...patch }))}
            onToggleDay={toggleGroupDay}
            onSubmit={createGroup}
            onCloseForm={chrome.closeMobileForm}
            onCancelEdit={cancelGroupEdit}
            onCopyInvite={() => void copyMemberInvite()}
            onCloseInvite={closeMemberInvite}
            onShareInvite={() => void shareMemberInvite()}
          />
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
    </DashboardShell>
  );
}
