import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  GroupDraftLike,
  GroupPaymentDefaults
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
