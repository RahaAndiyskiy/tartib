import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import type {
  GroupDraftLike,
  GroupPaymentDefaults
} from '../model/draft';
import {
  buildLocalTrainingGroup,
  parseGroupPaymentDefaults,
  resolveGroupTrainerId,
  validateGroupDraft
} from '../model/draft';

type SetWorkspace = (updater: (current: LocalWorkspace | null) => LocalWorkspace | null) => void;

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

type DeleteGroupParams = {
  workspace: LocalWorkspace | null;
  groupId: string;
  isLocalMode: boolean;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setWorkspace: SetWorkspace;
};

type SaveRemoteGroupParams = {
  editingGroupId: string;
  trainerId: string;
  draft: GroupDraftLike;
  defaults: GroupPaymentDefaults;
  runRemoteActionWithPending: RunRemoteActionWithPending;
};

type GroupPaymentSync = (params: {
  workspace: LocalWorkspace;
  memberIds: string[];
  trainerId: string;
  amount: number;
  billingDay: number;
  now: string;
}) => Pick<LocalWorkspace, 'billingPlans' | 'payments'>;

export type SubmitGroupDraftResult =
  | { kind: 'idle' }
  | { kind: 'validation_error'; message: string }
  | {
      kind: 'saved';
      workspace?: LocalWorkspace;
      group: LocalTrainingGroup;
      wasEditing: boolean;
      message: string;
      refreshRemote: boolean;
    };

export async function saveRemoteGroupAction({
  editingGroupId,
  trainerId,
  draft,
  defaults,
  runRemoteActionWithPending
}: SaveRemoteGroupParams): Promise<LocalTrainingGroup | null> {
  const data = await runRemoteActionWithPending<
    | { group: LocalTrainingGroup }
    | null
  >(
    {
      action: 'save_group',
      id: editingGroupId || undefined,
      trainerId,
      activity: draft.activity,
      days: draft.days,
      time: draft.time,
      note: draft.note,
      defaultAmount: defaults.hasDefaultPayment ? defaults.defaultAmount : null,
      defaultBillingDay: defaults.hasDefaultPayment ? defaults.defaultBillingDay : null
    },
    `save-group:${editingGroupId || 'new'}`
  );

  return data?.group ?? null;
}

export async function submitGroupDraftAction({
  workspace,
  activeUser,
  editingGroupId,
  draft,
  isLocalMode,
  now,
  createId,
  runRemoteActionWithPending,
  syncDefaultPayments
}: {
  workspace: LocalWorkspace | null;
  activeUser: AppUser | null;
  editingGroupId: string;
  draft: GroupDraftLike;
  isLocalMode: boolean;
  now: string;
  createId: () => string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  syncDefaultPayments: GroupPaymentSync;
}): Promise<SubmitGroupDraftResult> {
  if (!workspace || !activeUser || !hasRole(activeUser, 'trainer')) return { kind: 'idle' };

  const trainerId = resolveGroupTrainerId(activeUser, draft);
  const defaults = parseGroupPaymentDefaults(draft);
  const validationError = validateGroupDraft(draft, trainerId, defaults);

  if (validationError === 'missing_required') {
    return {
      kind: 'validation_error',
      message: 'Укажите направление, дни и время.'
    };
  }

  if (validationError === 'invalid_payment_defaults') {
    return {
      kind: 'validation_error',
      message: 'Укажите корректную сумму и день оплаты группы.'
    };
  }

  if (!isLocalMode) {
    const savedGroup = await saveRemoteGroupAction({
      editingGroupId,
      trainerId,
      draft,
      defaults,
      runRemoteActionWithPending
    });

    return savedGroup
      ? {
          kind: 'saved',
          group: savedGroup,
          wasEditing: Boolean(editingGroupId),
          message: editingGroupId
            ? 'Группа обновлена.'
            : 'Группа создана. Теперь можно создать ссылку для набора.',
          refreshRemote: true
        }
      : { kind: 'idle' };
  }

  const group = buildLocalTrainingGroup({
    id: createId(),
    trainerId,
    draft,
    defaults,
    now
  });

  if (!editingGroupId) {
    return {
      kind: 'saved',
      workspace: upsertGroupInWorkspace(workspace, group),
      group,
      wasEditing: false,
      message: 'Группа создана. Теперь можно создать ссылку для набора.',
      refreshRemote: false
    };
  }

  const memberIds = workspace.groupMembers
    .filter((assignment) => assignment.groupId === editingGroupId)
    .map((assignment) => assignment.memberId);
  const paymentSync = defaults.hasDefaultPayment
    ? syncDefaultPayments({
        workspace,
        memberIds,
        trainerId,
        amount: defaults.defaultAmount,
        billingDay: defaults.defaultBillingDay,
        now
      })
    : {
        billingPlans: workspace.billingPlans,
        payments: workspace.payments
      };

  return {
    kind: 'saved',
    workspace: {
      ...replaceGroupInWorkspace(workspace, editingGroupId, group),
      billingPlans: paymentSync.billingPlans,
      payments: paymentSync.payments
    },
    group,
    wasEditing: true,
    message: 'Группа обновлена.',
    refreshRemote: false
  };
}

export function upsertGroupInWorkspace(
  workspace: LocalWorkspace,
  group: LocalTrainingGroup
): LocalWorkspace {
  return {
    ...workspace,
    groups: workspace.groups.some((item) => item.id === group.id)
      ? workspace.groups.map((item) => (item.id === group.id ? group : item))
      : [...workspace.groups, group]
  };
}

export function replaceGroupInWorkspace(
  workspace: LocalWorkspace,
  groupId: string,
  group: LocalTrainingGroup
): LocalWorkspace {
  return {
    ...workspace,
    groups: workspace.groups.map((item) =>
      item.id === groupId ? { ...item, ...group, id: groupId, createdAt: item.createdAt } : item
    )
  };
}

export async function deleteGroupAction({
  workspace,
  groupId,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setWorkspace
}: DeleteGroupParams): Promise<boolean> {
  if (!workspace) return false;

  if (!isLocalMode) {
    const data = await runRemoteActionWithPending<{ deletedGroupId: string }>(
      { action: 'delete_group', groupId },
      `delete-group:${groupId}`
    );
    if (!data?.deletedGroupId) return false;

    setWorkspace((current) =>
      current
        ? {
            ...current,
            groups: current.groups.filter((item) => item.id !== data.deletedGroupId),
            groupMembers: current.groupMembers.filter(
              (assignment) => assignment.groupId !== data.deletedGroupId
            )
          }
        : current
    );
    return true;
  }

  saveWorkspace({
    ...workspace,
    groups: workspace.groups.filter((item) => item.id !== groupId),
    groupMembers: workspace.groupMembers.filter((assignment) => assignment.groupId !== groupId)
  });

  return true;
}
