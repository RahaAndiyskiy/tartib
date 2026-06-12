export type UserRole = 'owner' | 'trainer' | 'member';

export type PaymentRequestStatus =
  | 'active'
  | 'overdue'
  | 'delay_requested'
  | 'delayed'
  | 'payment_confirmation'
  | 'paid';
export type BillingPlanType = 'monthly' | 'one_time';
export type TrainingFormat = 'group' | 'individual';

export type Organization = {
  id: string;
  name: string;
  created_at: string;
};

export type AppUser = {
  id: string;
  auth_user_id: string | null;
  organization_id: string;
  role: UserRole;
  roles?: UserRole[];
  username?: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export type TrainerMember = {
  id: string;
  organization_id: string;
  trainer_id: string;
  member_id: string;
  created_at: string;
};

export type PaymentRequest = {
  id: string;
  organization_id: string;
  member_id: string;
  trainer_id: string;
  amount: number;
  due_date: string;
  status: PaymentRequestStatus;
  created_at: string;
  plan_id?: string;
  period_label?: string;
  is_current?: boolean;
  paid_at?: string | null;
  delay_requested_date?: string | null;
  delay_comment?: string | null;
  delay_status?: 'pending' | 'approved' | 'rejected' | null;
  delay_requested_at?: string | null;
  delay_decided_at?: string | null;
  delay_decided_by?: string | null;
};
