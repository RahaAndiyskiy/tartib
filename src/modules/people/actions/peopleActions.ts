import {
  createId,
  type LocalBillingPlan,
  type LocalGroupMember,
  type LocalTrainingGroup,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  AppUser,
  BillingPlanType,
  TrainerMember,
  TrainingFormat
} from '@shared/types/domain';
import { hasRole } from '@/core/roles';

type SetWorkspace = (updater: (current: LocalWorkspace | null) => LocalWorkspace | null) => void;

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

type RunRemoteAction = (payload: Record<string, unknown>) => Promise<boolean>;

type CreateTrainerParams = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  phone: string;
  runRemoteAction: RunRemoteAction;
};

type LocalPersonDraftLike = {
  role: 'trainer' | 'member';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  groupId: string;
  initialAmount: string;
  initialDueDate: string;
  paymentType: BillingPlanType;
  trainingFormat: TrainingFormat;
};

export function createLocalPersonAction({
  workspace,
  draft,
  role,
  selectedGroup,
  trainerId,
  now,
  periodLabel
}: {
  workspace: LocalWorkspace;
  draft: LocalPersonDraftLike;
  role: 'trainer' | 'member';
  selectedGroup: LocalTrainingGroup | null;
  trainerId: string;
  now: string;
  periodLabel: (date: string) => string;
}): { workspace: LocalWorkspace; person: AppUser } {
  const personId = createId();
  const person: AppUser = {
    id: personId,
    auth_user_id: null,
    organization_id: workspace.organization.id,
    role,
    roles: [role],
    first_name: draft.firstName.trim(),
    last_name: draft.lastName.trim(),
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    created_at: now
  };
  const nextWorkspace: LocalWorkspace = {
    ...workspace,
    users: [...workspace.users, person]
  };

  if (person.role === 'member' && selectedGroup) {
    nextWorkspace.assignments = [
      ...workspace.assignments,
      {
        id: createId(),
        organization_id: workspace.organization.id,
        trainer_id: trainerId,
        member_id: personId,
        created_at: now
      }
    ];
    nextWorkspace.groupMembers = [
      ...workspace.groupMembers,
      {
        id: createId(),
        groupId: selectedGroup.id,
        memberId: personId,
        createdAt: now
      }
    ];

    const calculatedInitialAmount = Number(draft.initialAmount);

    if (calculatedInitialAmount > 0 && draft.initialDueDate) {
      const planId = createId();
      const billingPlan: LocalBillingPlan = {
        id: planId,
        memberId: personId,
        trainerId,
        type: draft.paymentType,
        trainingFormat: draft.trainingFormat,
        source: 'individual',
        baseAmount: calculatedInitialAmount,
        billingDay:
          draft.paymentType === 'monthly'
            ? new Date(`${draft.initialDueDate}T12:00:00`).getDate()
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
          trainer_id: trainerId,
          amount: calculatedInitialAmount,
          due_date: draft.initialDueDate,
          status: 'active',
          created_at: now,
          plan_id: planId,
          period_label: periodLabel(draft.initialDueDate),
          is_current: true,
          coverage_months: 1,
          paid_at: null
        }
      ];
    }
  }

  return { workspace: nextWorkspace, person };
}

export type SubmitPersonDraftResult =
  | { kind: 'idle' }
  | { kind: 'validation_error'; message: string }
  | { kind: 'create_member_invite'; groupId: string }
  | { kind: 'remote_trainer_created'; message: string }
  | { kind: 'local_person_created'; workspace: LocalWorkspace; message: string };

export async function submitPersonDraftAction({
  workspace,
  activeUser,
  draft,
  isLocalMode,
  runRemoteAction,
  now,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  activeUser: AppUser | null;
  draft: LocalPersonDraftLike;
  isLocalMode: boolean;
  runRemoteAction: RunRemoteAction;
  now: string;
  periodLabel: (date: string) => string;
}): Promise<SubmitPersonDraftResult> {
  if (!workspace || !activeUser) return { kind: 'idle' };

  const effectiveRole =
    hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner') ? 'member' : draft.role;
  const selectedGroup = workspace.groups.find((group) => group.id === draft.groupId);
  const effectiveTrainerId = selectedGroup?.trainerId ?? '';

  if (effectiveRole === 'member' && !selectedGroup) {
    return {
      kind: 'validation_error',
      message: 'Выберите группу для ученика.'
    };
  }

  if (!isLocalMode) {
    if (effectiveRole === 'member') {
      return {
        kind: 'create_member_invite',
        groupId: draft.groupId
      };
    }

    const success = await createTrainerAction({
      firstName: draft.firstName,
      lastName: draft.lastName,
      username: draft.username,
      password: draft.password,
      phone: draft.phone,
      runRemoteAction
    });

    return success
      ? {
          kind: 'remote_trainer_created',
          message: 'Тренер создан.'
        }
      : { kind: 'idle' };
  }

  const result = createLocalPersonAction({
    workspace,
    draft,
    role: effectiveRole,
    selectedGroup: selectedGroup ?? null,
    trainerId: effectiveTrainerId,
    now,
    periodLabel
  });

  return {
    kind: 'local_person_created',
    workspace: result.workspace,
    message:
      result.person.role === 'member'
        ? 'Ученик создан и назначен тренеру.'
        : 'Тренер создан. Теперь к нему можно добавлять учеников.'
  };
}

export async function createTrainerAction({
  firstName,
  lastName,
  username,
  password,
  phone,
  runRemoteAction
}: CreateTrainerParams): Promise<boolean> {
  return runRemoteAction({
    action: 'create_user',
    role: 'trainer',
    firstName,
    lastName,
    username,
    password,
    phone
  });
}

type MemberInviteResult = {
  inviteUrl: string;
  expiresAt: string;
  groupName: string;
};

type CreateMemberInviteParams = {
  group: LocalTrainingGroup | null;
  groupId: string;
  cachedInvite?: MemberInviteResult;
  isLocalMode: boolean;
  origin: string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
};

export async function createMemberInviteAction({
  group,
  groupId,
  cachedInvite,
  isLocalMode,
  origin,
  runRemoteActionWithPending
}: CreateMemberInviteParams): Promise<{ invite: MemberInviteResult; localMode: boolean } | null> {
  if (!group) return null;
  if (cachedInvite) return { invite: cachedInvite, localMode: false };

  if (isLocalMode) {
    return {
      invite: {
        inviteUrl: `${origin}/join/local-${group.id}`,
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        groupName: group.activity
      },
      localMode: true
    };
  }

  const result = await runRemoteActionWithPending<{ inviteUrl: string; expiresAt: string }>(
    {
      action: 'create_member_invite',
      groupId
    },
    `create-invite:${groupId}`
  );

  if (!result) return null;

  return {
    invite: {
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt,
      groupName: group.activity
    },
    localMode: false
  };
}

type AssignMemberToGroupParams = {
  workspace: LocalWorkspace | null;
  group: LocalTrainingGroup | null;
  memberId: string;
  groupId: string;
  isLocalMode: boolean;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
};

export async function assignMemberToGroupAction({
  workspace,
  group,
  memberId,
  groupId,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage
}: AssignMemberToGroupParams): Promise<void> {
  if (!workspace || !group) return;

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

type DeleteMemberParams = {
  workspace: LocalWorkspace | null;
  memberId: string;
  isLocalMode: boolean;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
  setMessage: (message: string) => void;
};

export async function deleteMemberAction({
  workspace,
  memberId,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace,
  setMessage
}: DeleteMemberParams): Promise<void> {
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
