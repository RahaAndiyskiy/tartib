'use client';

import { useEffect, useState } from 'react';
import { createId } from '@shared/lib/localWorkspace';
import { hasRole } from '@/core/roles';
import {
  canManageGroups,
  canViewGroups
} from '@/modules/groups';
import {
  formatLabels,
  planLabels,
  statusLabels
} from './constants';
import type { DashboardSection } from './types';
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
  MemberPaymentPanel,
} from '@/modules/payments';
import { useDashboardData } from './model/useDashboardData';
import { buildSectionMeta } from './model/navigation';
import { useAccountRuntime } from './model/useAccountRuntime';
import { useDashboardChrome } from './model/useDashboardChrome';
import { useExpensesController } from './model/useExpensesController';
import { useGroupsController } from './model/useGroupsController';
import { useNotificationsController } from './model/useNotificationsController';
import { usePendingAction } from './model/usePendingAction';
import { usePeopleFlowController } from './model/usePeopleFlowController';
import { usePaymentNavigation } from './model/usePaymentNavigation';
import { usePaymentActionsController } from './model/usePaymentActionsController';
import { useScheduleController } from './model/useScheduleController';
import { useSettingsController } from './model/useSettingsController';
import { useWorkspaceRuntime } from './model/useWorkspaceRuntime';

export function DashboardApp(): React.ReactElement {
  const isLocalMode = process.env.NEXT_PUBLIC_DATA_MODE === 'local';
  const debugPerformance = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';
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

  function openSection(section: DashboardSection): void {
    chrome.openSection(section);
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
            onDraftChange={updateGroupDraft}
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
