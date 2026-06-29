import type { LocalWorkspace } from '@shared/lib/localWorkspace';

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
