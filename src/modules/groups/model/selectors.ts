import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';

export function selectVisibleGroups(
  workspace: LocalWorkspace | null,
  activeUser: AppUser | null
): LocalTrainingGroup[] {
  if (!workspace || !activeUser) return [];
  if (hasRole(activeUser, 'owner')) return workspace.groups;
  if (hasRole(activeUser, 'trainer')) {
    return workspace.groups.filter((group) => group.trainerId === activeUser.id);
  }

  const groupIds = new Set(
    workspace.groupMembers
      .filter((assignment) => assignment.memberId === activeUser.id)
      .map((assignment) => assignment.groupId)
  );
  return workspace.groups.filter((group) => groupIds.has(group.id));
}

export function mapGroupsById(groups: LocalTrainingGroup[]): Map<string, LocalTrainingGroup> {
  return new Map(groups.map((group) => [group.id, group]));
}

export function countGroupMembers(workspace: LocalWorkspace, groupId: string): number {
  return workspace.groupMembers.filter((assignment) => assignment.groupId === groupId).length;
}
