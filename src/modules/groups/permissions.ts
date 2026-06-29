import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';

export function canViewGroups(user: AppUser | null): boolean {
  return !hasRole(user, 'member');
}

export function canManageGroups(user: AppUser | null): boolean {
  return hasRole(user, 'trainer') || hasRole(user, 'owner');
}

export function isTrainerOnlyForGroups(user: AppUser | null): boolean {
  return hasRole(user, 'trainer') && !hasRole(user, 'owner');
}
