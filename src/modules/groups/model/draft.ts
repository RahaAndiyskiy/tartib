import type {
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';

export type GroupDraftLike = {
  activity: string;
  days: string;
  time: string;
  note: string;
  trainerId: string;
  defaultAmount: string;
  defaultBillingDay: string;
};

export type GroupPaymentDefaults = {
  hasDefaultPayment: boolean;
  defaultAmount: number;
  defaultBillingDay: number;
};

export function resolveGroupTrainerId(activeUser: AppUser, draft: GroupDraftLike): string {
  return hasRole(activeUser, 'owner') ? draft.trainerId || activeUser.id : activeUser.id;
}

export function parseGroupPaymentDefaults(draft: GroupDraftLike): GroupPaymentDefaults {
  return {
    hasDefaultPayment: draft.defaultAmount.trim() !== '',
    defaultAmount: Number(draft.defaultAmount),
    defaultBillingDay: Number(draft.defaultBillingDay)
  };
}

export function validateGroupDraft(
  draft: GroupDraftLike,
  trainerId: string,
  defaults: GroupPaymentDefaults
): 'missing_required' | 'invalid_payment_defaults' | null {
  if (!trainerId || !draft.activity.trim() || !draft.days.trim() || !draft.time.trim()) {
    return 'missing_required';
  }

  if (
    (defaults.hasDefaultPayment && defaults.defaultAmount <= 0) ||
    (defaults.hasDefaultPayment && (defaults.defaultBillingDay < 1 || defaults.defaultBillingDay > 31))
  ) {
    return 'invalid_payment_defaults';
  }

  return null;
}

export function buildLocalTrainingGroup({
  id,
  trainerId,
  draft,
  defaults,
  now
}: {
  id: string;
  trainerId: string;
  draft: GroupDraftLike;
  defaults: GroupPaymentDefaults;
  now: string;
}): LocalTrainingGroup {
  return {
    id,
    trainerId,
    activity: draft.activity.trim(),
    days: draft.days.trim(),
    time: draft.time.trim(),
    note: draft.note.trim(),
    defaultAmount: defaults.hasDefaultPayment ? defaults.defaultAmount : null,
    defaultBillingDay: defaults.hasDefaultPayment ? defaults.defaultBillingDay : null,
    createdAt: now,
    updatedAt: now
  };
}

export function buildGroupDraftFromGroup(group: LocalTrainingGroup): GroupDraftLike {
  return {
    activity: group.activity,
    days: group.days,
    time: group.time,
    note: group.note,
    trainerId: group.trainerId,
    defaultAmount: group.defaultAmount ? String(group.defaultAmount) : '',
    defaultBillingDay: group.defaultBillingDay ? String(group.defaultBillingDay) : '5'
  };
}
