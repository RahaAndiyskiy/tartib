import type {
  LocalGroupMember,
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  AppUser,
  TrainerMember
} from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import { isTrainerOnly } from '../permissions';

export function selectTrainers(workspace: LocalWorkspace | null): AppUser[] {
  return workspace?.users.filter((user) => hasRole(user, 'trainer')) ?? [];
}

export function selectAllMembers(workspace: LocalWorkspace | null): AppUser[] {
  return workspace?.users.filter((user) => user.role === 'member') ?? [];
}

type SelectVisibleMembersInput = {
  activeUser: AppUser | null;
  allMembers: AppUser[];
  assignments: TrainerMember[];
};

export function selectVisibleMembers({
  activeUser,
  allMembers,
  assignments
}: SelectVisibleMembersInput): AppUser[] {
  if (!activeUser) return [];
  if (hasRole(activeUser, 'owner')) return allMembers;
  if (activeUser.role === 'member') return allMembers.filter((member) => member.id === activeUser.id);

  const memberIds = new Set(
    assignments
      .filter((assignment) => assignment.trainer_id === activeUser.id)
      .map((assignment) => assignment.member_id)
  );

  return allMembers.filter((member) => memberIds.has(member.id));
}

type SelectPeopleForViewInput = {
  activeUser: AppUser | null;
  visibleMembers: AppUser[];
  users: AppUser[];
};

export function selectPeopleForView({
  activeUser,
  visibleMembers,
  users
}: SelectPeopleForViewInput): AppUser[] {
  return isTrainerOnly(activeUser) ? visibleMembers : users;
}

type FilterPeopleForViewInput = {
  people: AppUser[];
  search: string;
  groupFilter: string;
  getMemberGroup: (memberId: string) => LocalTrainingGroup | null;
};

export function filterPeopleForView({
  people,
  search,
  groupFilter,
  getMemberGroup
}: FilterPeopleForViewInput): AppUser[] {
  const query = search.trim().toLocaleLowerCase('ru-RU');

  return people.filter((user) => {
    const group = user.role === 'member' ? getMemberGroup(user.id) : null;
    const matchesSearch =
      !query ||
      `${user.first_name} ${user.last_name}`.toLocaleLowerCase('ru-RU').includes(query) ||
      (user.phone ?? '').toLocaleLowerCase('ru-RU').includes(query) ||
      (user.email ?? '').toLocaleLowerCase('ru-RU').includes(query);
    const matchesGroup =
      groupFilter === 'all' ||
      (groupFilter === 'no-group' && user.role === 'member' && !group) ||
      (user.role === 'member' && group?.id === groupFilter);

    return matchesSearch && matchesGroup;
  });
}

export function mapAssignmentsByMemberId(assignments: TrainerMember[]): Map<string, TrainerMember> {
  return new Map(assignments.map((assignment) => [assignment.member_id, assignment]));
}

export function mapGroupMembershipByMemberId(assignments: LocalGroupMember[]): Map<string, LocalGroupMember> {
  return new Map(assignments.map((assignment) => [assignment.memberId, assignment]));
}
