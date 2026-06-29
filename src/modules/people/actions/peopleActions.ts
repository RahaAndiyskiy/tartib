import {
  createId,
  type LocalGroupMember,
  type LocalTrainingGroup,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { TrainerMember } from '@shared/types/domain';

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
