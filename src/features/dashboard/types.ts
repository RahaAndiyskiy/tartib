import type {
  BillingPlanType,
  TrainingFormat
} from '@shared/types/domain';

export type PersonDraft = {
  role: 'trainer' | 'member';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  groupId: string;
  paymentType: BillingPlanType;
  trainingFormat: TrainingFormat;
  initialAmount: string;
  initialDueDate: string;
};

export type MemberInviteResult = {
  inviteUrl: string;
  expiresAt: string;
  groupName: string;
};

export type PaymentEdit = {
  type: BillingPlanType;
  trainingFormat: TrainingFormat;
  individualTerms: boolean;
  currentAmount: string;
  dueDate: string;
  updateFuture: boolean;
};

export type ExpenseDraft = {
  name: string;
  amount: string;
  dueDate: string;
  type: 'recurring' | 'one_time';
};

export type ScheduleEdit = {
  days: string;
  time: string;
  note: string;
};

export type GroupDraft = {
  activity: string;
  days: string;
  time: string;
  note: string;
  trainerId: string;
  defaultAmount: string;
  defaultBillingDay: string;
};

export type DelayDraft = {
  requestedDate: string;
  comment: string;
};

export type SettingsDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  organizationName: string;
};

export type DashboardSection =
  | 'overview'
  | 'people'
  | 'payments'
  | 'groups'
  | 'schedule'
  | 'expenses'
  | 'settings';
