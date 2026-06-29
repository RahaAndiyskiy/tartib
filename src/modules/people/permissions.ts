import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';

export function isTrainerOnly(user: AppUser | null): boolean {
  return hasRole(user, 'trainer') && !hasRole(user, 'owner');
}

export function canManagePeople(user: AppUser | null): boolean {
  return !hasRole(user, 'member');
}
