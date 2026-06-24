import type {
  BillingPlanType,
  PaymentRequestStatus,
  TrainingFormat
} from '@shared/types/domain';

export type ActionBody =
  | {
      action: 'create_member_invite';
      firstName?: string;
      lastName?: string;
      groupId: string;
    }
  | {
      action: 'create_user';
      role: 'trainer' | 'member';
      firstName: string;
      lastName: string;
      username: string;
      password: string;
      phone?: string;
      groupId?: string;
      paymentType?: BillingPlanType;
      trainingFormat?: TrainingFormat;
      amount?: number;
      dueDate?: string;
    }
  | {
      action: 'save_group';
      id?: string;
      trainerId?: string;
      activity: string;
      days: string;
      time: string;
      note?: string;
    }
  | { action: 'delete_group'; groupId: string }
  | { action: 'assign_member_group'; memberId: string; groupId: string }
  | { action: 'delete_member'; memberId: string }
  | {
      action: 'update_profile';
      firstName: string;
      lastName: string;
      phone?: string;
    }
  | {
      action: 'update_organization';
      name: string;
    }
  | {
      action: 'save_payment';
      memberId: string;
      type: BillingPlanType;
      trainingFormat: TrainingFormat;
      amount: number;
      dueDate: string;
      updateFuture: boolean;
    }
  | { action: 'delete_payment'; paymentId: string }
  | { action: 'submit_payment'; paymentId: string }
  | { action: 'submit_prepayment'; paymentId: string; months: number }
  | {
      action: 'request_delay';
      paymentId: string;
      requestedDate: string;
      comment?: string;
    }
  | { action: 'decide_delay'; paymentId: string; approved: boolean }
  | { action: 'decide_payment'; paymentId: string; approved: boolean }
  | { action: 'mark_notifications_read' };

export type NotificationRow = {
  id: string;
  organization_id: string;
  user_id: string;
  payment_id: string | null;
  message: string;
  event_key: string | null;
  read: boolean;
  created_at: string;
};

export type GroupRow = {
  id: string;
  trainer_id: string;
  activity: string;
  days: string;
  time: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type GroupMemberRow = {
  id: string;
  group_id: string;
  member_id: string;
  created_at: string;
};

export type BillingPlanRow = {
  id: string;
  member_id: string;
  trainer_id: string;
  type: BillingPlanType;
  training_format: TrainingFormat;
  base_amount: number;
  billing_day: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentActionBody = Extract<
  ActionBody,
  | { action: 'submit_payment' }
  | { action: 'submit_prepayment' }
  | { action: 'request_delay' }
  | { action: 'decide_delay' }
  | { action: 'decide_payment' }
>;

export type { PaymentRequestStatus };
