import { useCallback, useMemo } from 'react';
import type {
  LocalNotification,
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import {
  mapGroupsById,
  selectVisibleGroups
} from '@/modules/groups';
import {
  filterPeopleForView,
  mapAssignmentsByMemberId,
  mapGroupMembershipByMemberId,
  selectAllMembers,
  selectPeopleForView,
  selectTrainers,
  selectVisibleMembers
} from '@/modules/people';
import {
  buildMemberPaymentDetails,
  buildPaymentOverview,
  buildPaymentRegistry,
  buildSelectedPaymentDetails,
  mapActivePlansByMemberId,
  mapCurrentPaymentsByMemberId,
  selectVisiblePayments,
  usePaymentUiState
} from '@/modules/payments';

// Return type is intentionally inferred from the assembled dashboard view model.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDashboardData({
  workspace,
  activeUserId,
  historyOpenByMember,
  peopleSearch,
  peopleGroupFilter
}: {
  workspace: LocalWorkspace | null;
  activeUserId: string;
  historyOpenByMember: Record<string, boolean>;
  peopleSearch: string;
  peopleGroupFilter: string;
}) {
  const activeUser = useMemo(
    () => workspace?.users.find((user) => user.id === activeUserId) ?? null,
    [activeUserId, workspace]
  );
  const trainers = useMemo(() => selectTrainers(workspace), [workspace]);
  const allMembers = useMemo(() => selectAllMembers(workspace), [workspace]);
  const visibleGroups = useMemo(
    () => selectVisibleGroups(workspace, activeUser),
    [activeUser, workspace]
  );
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
  const groupsById = useMemo(
    () => mapGroupsById(workspace?.groups ?? []),
    [workspace?.groups]
  );
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
  // UI оплат всегда строится поверх актуальных карт текущего счёта и активного тарифа.
  const paymentUi = usePaymentUiState({ currentPaymentByMemberId, activePlanByMemberId });
  const {
    paymentView,
    paymentSearch,
    selectedPaymentMemberId
  } = paymentUi;

  const trainerFor = useCallback(
    (memberId: string): AppUser | null => {
      if (!workspace) return null;
      const assignment = assignmentsByMemberId.get(memberId);
      return assignment ? usersById.get(assignment.trainer_id) ?? null : null;
    },
    [assignmentsByMemberId, usersById, workspace]
  );

  const groupFor = useCallback(
    (memberId: string): LocalTrainingGroup | null => {
      if (!workspace) return null;
      const assignment = groupMembershipByMemberId.get(memberId);
      return assignment ? groupsById.get(assignment.groupId) ?? null : null;
    },
    [groupMembershipByMemberId, groupsById, workspace]
  );

  const userName = useCallback(
    (userId: string): string => {
      const user = usersById.get(userId);
      return user ? `${user.first_name} ${user.last_name}` : 'Неизвестно';
    },
    [usersById]
  );

  const paymentOverview = useMemo(
    () =>
      buildPaymentOverview({
        visiblePayments,
        visibleMembers,
        currentPaymentByMemberId
      }),
    [currentPaymentByMemberId, visibleMembers, visiblePayments]
  );
  const paymentRegistry = useMemo(
    () =>
      buildPaymentRegistry({
        visiblePayments,
        visibleMembers,
        currentPaymentByMemberId,
        paymentView,
        paymentSearch,
        userName
      }),
    [currentPaymentByMemberId, paymentSearch, paymentView, userName, visibleMembers, visiblePayments]
  );
  const selectedPaymentDetails = useMemo(
    () =>
      buildSelectedPaymentDetails({
        selectedMemberId: selectedPaymentMemberId,
        visibleMembers,
        visiblePayments,
        currentPaymentByMemberId,
        activePlanByMemberId,
        usersById,
        historyOpenByMember,
        groupForMember: groupFor
      }),
    [
      activePlanByMemberId,
      currentPaymentByMemberId,
      groupFor,
      historyOpenByMember,
      selectedPaymentMemberId,
      usersById,
      visibleMembers,
      visiblePayments
    ]
  );
  const activeMemberDetails = useMemo(
    () =>
      buildMemberPaymentDetails({
        activeUser,
        currentPayments: paymentOverview.currentPayments,
        visiblePayments,
        activePlanByMemberId,
        historyOpenByMember
      }),
    [
      activePlanByMemberId,
      activeUser,
      historyOpenByMember,
      paymentOverview.currentPayments,
      visiblePayments
    ]
  );
  const activeMemberTrainer =
    activeUser?.role === 'member' ? trainerFor(activeUser.id) : null;
  const activeMemberGroup =
    activeUser?.role === 'member' ? visibleGroups[0] ?? null : null;
  const activeMemberSchedule =
    activeUser?.role === 'member'
      ? activeMemberGroup
        // Расписание группы основное; отдельное расписание остаётся запасным вариантом.
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
  const unreadNotifications = useMemo(
    () =>
      workspace?.notifications.filter(
        (notification) => notification.userId === activeUserId && !notification.read
      ) ?? [],
    [activeUserId, workspace?.notifications]
  );
  const userNotifications: LocalNotification[] = useMemo(
    () => workspace?.notifications.filter((notification) => notification.userId === activeUserId) ?? [],
    [activeUserId, workspace?.notifications]
  );
  const peopleForView = useMemo(
    () =>
      selectPeopleForView({
        activeUser,
        visibleMembers,
        users: workspace?.users ?? []
      }),
    [activeUser, visibleMembers, workspace?.users]
  );
  const filteredPeopleForView = useMemo(
    () =>
      filterPeopleForView({
        people: peopleForView,
        search: peopleSearch,
        groupFilter: peopleGroupFilter,
        getMemberGroup: groupFor
      }),
    [groupFor, peopleForView, peopleGroupFilter, peopleSearch]
  );
  const currentExpenses = useMemo(
    () => workspace?.expenses.filter((expense) => expense.isCurrent) ?? [],
    [workspace?.expenses]
  );
  const paidExpenses = useMemo(
    () =>
      workspace?.expenses
        .filter((expense) => expense.status === 'paid')
        .reduce((sum, expense) => sum + Number(expense.amount), 0) ?? 0,
    [workspace?.expenses]
  );
  const pendingExpenses = useMemo(
    () =>
      currentExpenses
        .filter((expense) => expense.status === 'pending')
        .reduce((sum, expense) => sum + Number(expense.amount), 0),
    [currentExpenses]
  );

  return {
    activeUser,
    trainers,
    allMembers,
    visibleGroups,
    visibleMembers,
    visiblePayments,
    usersById,
    assignmentsByMemberId,
    groupsById,
    groupMembershipByMemberId,
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
  };
}
