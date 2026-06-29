import type { AppUser } from '@shared/types/domain';

export const roleLabels: Record<AppUser['role'], string> = {
  owner: 'Владелец',
  trainer: 'Тренер',
  member: 'Ученик'
};

export function hasRole(user: AppUser | null, role: AppUser['role']): boolean {
  return Boolean(user && (user.role === role || user.roles?.includes(role)));
}

export function roleLabel(user: AppUser): string {
  return hasRole(user, 'owner') && hasRole(user, 'trainer')
    ? 'Владелец + тренер'
    : roleLabels[user.role];
}
