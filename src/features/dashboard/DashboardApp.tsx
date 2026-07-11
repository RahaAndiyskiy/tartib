'use client';

import { createId } from '@shared/lib/localWorkspace';
import { hasRole } from '@/core/roles';
import {
  canManageGroups,
  canViewGroups
} from '@/modules/groups';
import {
  formatLabels,
  planLabels,
  statusLabels,
  weekDays
} from './constants';
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
import { DashboardLoadingState } from './components/DashboardLoadingState';
import { DashboardSections } from './components/DashboardSections';
import { DashboardShell } from './components/DashboardShell';
import { useDashboardData } from './model/useDashboardData';
import { useDashboardNotice } from './model/useDashboardNotice';
import { useDashboardUiState } from './model/useDashboardUiState';
import { buildSectionMeta } from './model/navigation';
import { useAccountRuntime } from './model/useAccountRuntime';
import { useDashboardChrome } from './model/useDashboardChrome';
import { useExpensesController } from './model/useExpensesController';
import { useGroupsController } from './model/useGroupsController';
import { useNotificationsController } from './model/useNotificationsController';
import { useOverviewController } from './model/useOverviewController';
import { usePendingAction } from './model/usePendingAction';
import { usePullToRefresh } from './model/usePullToRefresh';
import { usePeopleActionsController } from './model/usePeopleActionsController';
import { usePeopleFlowController } from './model/usePeopleFlowController';
import { usePaymentActionsController } from './model/usePaymentActionsController';
import { usePaymentNavigation } from './model/usePaymentNavigation';
import { useScheduleController } from './model/useScheduleController';
import { useSettingsController } from './model/useSettingsController';
import { useWorkspaceRuntime } from './model/useWorkspaceRuntime';

export function DashboardApp(): React.ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const debugPerformance = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';

  // Dashboard runtime and shared UI state.
  const { message, setMessage } = useDashboardNotice();
  const chrome = useDashboardChrome('overview');
  const {
    activeSection,
    mobileFormOpen,
    mobileAccountOpen,
    notificationsOpen,
    logoutConfirmOpen,
    invitePickerOpen
  } = chrome;
  const {
    expandedPeople,
    groupEditorOpenByMember,
    historyOpenByMember,
    peopleGroupFilter,
    peopleSearch,
    setHistoryOpenByMember,
    setPeopleGroupFilter,
    setPeopleSearch,
    toggleGroupEditor,
    togglePersonExpanded
  } = useDashboardUiState();
  const {
    workspace,
    activeUserId,
    workspaceLoadError,
    setWorkspace,
    setActiveUserId,
    saveWorkspace,
    refreshWorkspace,
    refreshRemoteWorkspace,
    runRemoteAction,
    runRemoteActionData
  } = useWorkspaceRuntime({
    activeSection,
    debugPerformance,
    isLocalMode,
    setMessage
  });
  const pullToRefresh = usePullToRefresh(refreshWorkspace);
  const {
    buttonLabel,
    isPendingAction,
    runRemoteActionWithPending
  } = usePendingAction({ runRemoteActionData });
  const {
    ensurePushEnabled,
    handleReset,
    openNewWindow,
    pushPending,
    pushStage,
    pushStatus,
    sendTestPush,
    signOut,
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

  // Derived workspace data used by feature controllers and pages.
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
    overduePayments,
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

  // Feature controllers own mutations and flow-specific state.
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
    decidePaymentDelay,
    deleteMemberPayment,
    requestPaymentDelay,
    saveMemberPayment,
    submitPaymentConfirmation,
    submitPrepayment,
    updateDelayDraft,
    updatePaymentStatus
  } = usePaymentActionsController({
    activePlanByMemberId,
    activeUser,
    activeUserId,
    addMonthsDate,
    assignmentsByMemberId,
    canSubmitPayment,
    canSubmitPrepayment,
    clearPaymentEdit,
    createId,
    currentPaymentByMemberId,
    dateAtNoon,
    delayDraftFor,
    isLocalMode,
    paymentEdits,
    periodLabel,
    prepaymentMonthsFor,
    prepaymentPeriodLabel,
    runRemoteActionWithPending,
    saveWorkspace,
    setMessage,
    setWorkspace,
    todayString,
    updatePaymentDelayDraft,
    userName,
    workspace
  });
  const {
    assignMemberToGroup,
    deleteMember
  } = usePeopleActionsController({
    groupsById,
    isLocalMode,
    runRemoteActionWithPending,
    saveWorkspace,
    setMessage,
    setWorkspace,
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
  const {
    cancelGroupEdit,
    createGroup,
    deleteGroup,
    editingGroupId,
    groupDraft,
    openCreateGroup,
    startGroupEdit,
    toggleGroupDay,
    updateGroupDraft
  } = useGroupsController({
    activeUser,
    clearMemberInvite,
    closeMobileForm: chrome.closeMobileForm,
    createId,
    dateAtNoon,
    dueDateForBillingDay,
    isLocalMode,
    openFormSection: chrome.openFormSection,
    openMobileForm: chrome.openMobileForm,
    periodLabel,
    refreshRemoteWorkspace,
    runRemoteActionWithPending,
    saveWorkspace,
    setLastCreatedGroupId,
    setMessage,
    setWorkspace,
    todayString,
    workspace
  });
  const overviewProps = useOverviewController({
    activeUser,
    activeMemberPayment,
    activeMemberTrainer,
    activeMemberGroup,
    activeMemberSchedule,
    delayDraftFor,
    isPendingAction,
    openOverviewInviteFlow,
    openPaymentsView,
    openPrepayment,
    paymentOverview,
    requestPaymentDelay,
    submitPaymentConfirmation,
    updateDelayDraft,
    visibleGroups
  });

  const sectionMeta = buildSectionMeta(activeUser);
  const openNotificationsWithPush = (): void => {
    openNotifications();
    void ensurePushEnabled();
  };

  if (!workspace || !activeUser) {
    return (
      <DashboardLoadingState
        error={workspaceLoadError}
        onRetry={() => void refreshRemoteWorkspace('manual', 0)}
        onLogin={() => { window.location.href = '/login'; }}
      />
    );
  }

  // Typed page contracts keep DashboardSections independent from controller details.
  const peopleProps = {
    activeUser,
    people: peopleForView,
    filteredPeople: filteredPeopleForView,
    groups: visibleGroups,
    groupFilter: peopleGroupFilter,
    search: peopleSearch,
    expandedPeople,
    groupEditorOpenByMember,
    getMemberGroup: groupFor,
    isPendingAction,
    buttonLabel,
    onGroupFilterChange: setPeopleGroupFilter,
    onSearchChange: setPeopleSearch,
    onTogglePerson: togglePersonExpanded,
    onToggleGroupEditor: toggleGroupEditor,
    onAssignMemberToGroup: assignMemberToGroup,
    onDeleteMember: deleteMember,
    onCreateGroup: openCreateGroup,
    onOpenInviteFlow: openInviteFlow
  };
  const personFormProps = {
    activeUser,
    draft: personDraft,
    groups: visibleGroups,
    invite: memberInvite,
    isLocalMode,
    isOpen: mobileFormOpen,
    isMemberInviteForm,
    onSubmit: addPerson,
    onClose: chrome.closeMobileForm,
    onDraftChange: updatePersonDraft,
    onClearInvite: clearMemberInvite,
    onCopyInvite: copyMemberInvite,
    onCloseInvite: closeMemberInvite,
    onShareInvite: shareMemberInvite
  };
  const memberPaymentProps = {
    activeUser,
    activeMemberPlan,
    activeMemberPayment,
    activeMemberPaymentHistory,
    activeMemberTrainer,
    activeMemberHistoryOpen,
    statusLabels,
    planLabels,
    formatLabels,
    todayString,
    formatShortDate,
    prepaymentPeriodLabel,
    canSubmitPayment,
    canSubmitPrepayment,
    paymentLockedText,
    delayDraftFor,
    updateDelayDraft,
    prepaymentMonthsFor,
    setPrepaymentMonths,
    setHistoryOpenByMember,
    isPendingAction,
    submitPaymentConfirmation,
    requestPaymentDelay,
    openPrepayment,
    submitPrepayment
  };
  const paymentWorkspaceProps = {
    activeUser,
    paymentView,
    paymentSearch,
    visibleMembers,
    filteredPaymentMembers,
    visiblePaymentActionGroups,
    paidPaymentResults,
    paymentActionCount,
    overduePaymentCount: overduePayments.length,
    paymentActionGroupsOpen,
    currentPaymentByMemberId,
    activePlanByMemberId,
    selectedPaymentMemberId,
    selectedPaymentMember,
    selectedPayment,
    selectedPaymentPlan,
    selectedPaymentGroup,
    selectedPaymentHistory,
    selectedPaymentHistoryOpen,
    paymentEditOpen,
    statusLabels,
    planLabels,
    userName,
    groupFor,
    formatShortDate,
    todayString,
    prepaymentPeriodLabel,
    canSubmitPayment,
    canSubmitPrepayment,
    paymentLockedText,
    delayDraftFor,
    updateDelayDraft,
    prepaymentMonthsFor,
    setPrepaymentMonths,
    setHistoryOpenByMember,
    setPaymentView,
    setPaymentSearch,
    setPaymentActionGroupsOpen,
    setSelectedPaymentMemberId,
    setPaymentEditOpen,
    isPendingAction,
    buttonLabel,
    paymentEditFor,
    updatePaymentEdit,
    saveMemberPayment,
    updatePaymentStatus,
    decidePaymentDelay,
    submitPaymentConfirmation,
    requestPaymentDelay,
    openPrepayment,
    submitPrepayment,
    deleteMemberPayment
  };
  const groupsProps = {
    activeUser,
    workspace,
    groups: visibleGroups,
    trainers,
    draft: groupDraft,
    invite: memberInvite,
    weekDays,
    canView: canViewGroups(activeUser),
    canManage: canManageGroups(activeUser),
    isOwner: hasRole(activeUser, 'owner'),
    isEditing: Boolean(editingGroupId),
    isOpen: mobileFormOpen,
    isPending: isPendingAction(`save-group:${editingGroupId || 'new'}`),
    lastCreatedGroupId,
    submitLabel: buttonLabel(
      `save-group:${editingGroupId || 'new'}`,
      editingGroupId ? 'Сохранить группу' : 'Создать группу'
    ),
    trainerName: userName,
    isPendingAction,
    buttonLabel,
    onCreateGroup: openCreateGroup,
    onCreateInvite: createMemberInviteForGroup,
    onEditGroup: startGroupEdit,
    onDeleteGroup: deleteGroup,
    onDraftChange: updateGroupDraft,
    onToggleDay: toggleGroupDay,
    onSubmit: createGroup,
    onCloseForm: chrome.closeMobileForm,
    onCancelEdit: cancelGroupEdit,
    onCopyInvite: copyMemberInvite,
    onCloseInvite: closeMemberInvite,
    onShareInvite: shareMemberInvite
  };
  const scheduleProps = {
    activeUser,
    visibleMembers,
    activeMemberGroup,
    activeMemberSchedule,
    activeMemberTrainer,
    userName,
    trainerFor,
    scheduleEditFor,
    updateScheduleEdit,
    saveSchedule
  };
  const expensesProps = {
    workspace,
    currentExpenses,
    paidExpenses,
    pendingExpenses,
    expenseDraft,
    onExpenseDraftChange: setExpenseDraft,
    onCreateExpense: createExpense,
    onMarkExpensePaid: markExpensePaid
  };
  const settingsProps = {
    activeUser,
    settingsDraft,
    pushPending,
    pushStage,
    pushStatus,
    isLocalMode,
    isPendingAction,
    onSettingsDraftChange: setSettingsDraft,
    onSaveProfile: saveProfileSettings,
    onSaveOrganization: saveOrganizationSettings,
    onEnsurePush: ensurePushEnabled,
    onSendTestPush: sendTestPush,
    onSignOut: signOut
  };

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
      pullDistance={pullToRefresh.pullDistance}
      pullRefreshing={pullToRefresh.isRefreshing}
      onOpenSection={chrome.openSection}
      onSelectActiveUser={selectActiveUser}
      onOpenNewWindow={openNewWindow}
      onReset={handleReset}
      onSignOut={signOut}
      onRequestLogout={chrome.requestLogout}
      onToggleMobileAccount={chrome.toggleMobileAccount}
      onCloseMobileAccount={chrome.closeMobileAccount}
      onOpenMobileForm={chrome.openMobileForm}
      onCloseMobileForm={chrome.closeMobileForm}
      onOpenNotifications={openNotificationsWithPush}
    >
        {message ? <p className="notice success">{message}</p> : null}

        <DashboardOverlays
          notificationsOpen={notificationsOpen}
          logoutConfirmOpen={logoutConfirmOpen}
          inviteModalOpen={invitePickerOpen || (activeSection === 'overview' && Boolean(memberInvite))}
          notifications={userNotifications}
          unreadCount={unreadNotifications.length}
          pushPending={pushPending}
          pushStage={pushStage}
          pushStatus={pushStatus}
          invite={memberInvite}
          groups={visibleGroups}
          paymentForNotification={notificationPayment}
          canDecidePayment={canDecideNotificationPayment}
          isPendingAction={isPendingAction}
          isPendingInviteGroup={(groupId) => isPendingAction(`create-invite:${groupId}`)}
          onCloseNotifications={chrome.closeNotifications}
          onEnsurePush={ensurePushEnabled}
          onSendTestPush={sendTestPush}
          onMarkNotificationsRead={markNotificationsRead}
          onDecidePayment={updatePaymentStatus}
          onDecideDelay={decidePaymentDelay}
          onOpenNotificationPayment={openNotificationPayment}
          onCancelLogout={chrome.closeLogoutConfirm}
          onConfirmLogout={signOut}
          onCreateInvite={createMemberInviteForGroup}
          onCopyInvite={copyMemberInvite}
          onShareInvite={shareMemberInvite}
          onCloseInvite={closeOverviewInviteModal}
        />
        <DashboardSections
          activeSection={activeSection}
          activeUser={activeUser}
          overviewProps={overviewProps}
          peopleProps={peopleProps}
          personFormProps={personFormProps}
          memberPaymentProps={memberPaymentProps}
          paymentWorkspaceProps={paymentWorkspaceProps}
          groupsProps={groupsProps}
          scheduleProps={scheduleProps}
          expensesProps={expensesProps}
          settingsProps={settingsProps}
        />
    </DashboardShell>
  );
}
