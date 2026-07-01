import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import {
  assignMemberToGroupAction,
  deleteMemberAction
} from '@/modules/people';

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

type UsePeopleActionsControllerOptions = {
  groupsById: Map<string, LocalTrainingGroup>;
  isLocalMode: boolean;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setMessage: (message: string) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
  workspace: LocalWorkspace | null;
};

type PeopleActionsController = {
  assignMemberToGroup: (memberId: string, groupId: string) => Promise<void>;
  deleteMember: (memberId: string) => Promise<void>;
};

export function usePeopleActionsController({
  groupsById,
  isLocalMode,
  runRemoteActionWithPending,
  saveWorkspace,
  setMessage,
  setWorkspace,
  workspace
}: UsePeopleActionsControllerOptions): PeopleActionsController {
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

  return {
    assignMemberToGroup,
    deleteMember
  };
}
