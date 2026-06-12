import type {
  AppUser,
  Organization,
  PaymentRequest,
  PaymentRequestStatus,
  TrainerMember,
  UserRole
} from './domain';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OrganizationInsert = {
  id?: string;
  name: string;
  created_at?: string;
};

type UserInsert = {
  id?: string;
  auth_user_id?: string | null;
  organization_id: string;
  role: UserRole;
  username?: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
};

type UserRoleRow = {
  user_id: string;
  role: UserRole;
  created_at: string;
};

type GroupRow = {
  id: string;
  organization_id: string;
  trainer_id: string;
  activity: string;
  days: string;
  time: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type GroupMemberRow = {
  id: string;
  organization_id: string;
  group_id: string;
  member_id: string;
  created_at: string;
};

type BillingPlanRow = {
  id: string;
  organization_id: string;
  member_id: string;
  trainer_id: string;
  type: 'monthly' | 'one_time';
  training_format: 'group' | 'individual';
  base_amount: number;
  billing_day: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  organization_id: string;
  user_id: string;
  payment_id: string | null;
  message: string;
  event_key: string | null;
  read: boolean;
  created_at: string;
};

type TrainerMemberInsert = {
  id?: string;
  organization_id: string;
  trainer_id: string;
  member_id: string;
  created_at?: string;
};

type PaymentRequestInsert = {
  id?: string;
  organization_id: string;
  member_id: string;
  trainer_id: string;
  amount: number;
  due_date: string;
  status?: PaymentRequestStatus;
  created_at?: string;
  plan_id?: string | null;
  period_label?: string | null;
  is_current?: boolean;
  paid_at?: string | null;
  delay_requested_date?: string | null;
  delay_comment?: string | null;
  delay_status?: 'pending' | 'approved' | 'rejected' | null;
  delay_requested_at?: string | null;
  delay_decided_at?: string | null;
  delay_decided_by?: string | null;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: OrganizationInsert;
        Update: Partial<OrganizationInsert>;
        Relationships: [];
      };
      users: {
        Row: AppUser;
        Insert: UserInsert;
        Update: Partial<UserInsert>;
        Relationships: [];
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: Omit<UserRoleRow, 'created_at'> & { created_at?: string };
        Update: Partial<UserRoleRow>;
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: Omit<GroupRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<GroupRow>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: Omit<GroupMemberRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<GroupMemberRow>;
        Relationships: [];
      };
      billing_plans: {
        Row: BillingPlanRow;
        Insert: Omit<BillingPlanRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<BillingPlanRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Omit<NotificationRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      trainer_members: {
        Row: TrainerMember;
        Insert: TrainerMemberInsert;
        Update: Partial<TrainerMemberInsert>;
        Relationships: [];
      };
      payment_requests: {
        Row: PaymentRequest;
        Insert: PaymentRequestInsert;
        Update: Partial<PaymentRequestInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bootstrap_owner: {
        Args: {
          organization_name: string;
          first_name: string;
          last_name: string;
          phone?: string | null;
        };
        Returns: AppUser;
      };
      claim_profile_by_email: {
        Args: Record<string, never>;
        Returns: AppUser | null;
      };
    };
    Enums: {
      user_role: UserRole;
      payment_request_status: PaymentRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
