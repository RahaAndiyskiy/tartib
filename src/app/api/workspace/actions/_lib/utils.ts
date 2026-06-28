import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import { sendPushToUser } from '@shared/lib/pushNotifications';
import type { PaymentRequest } from '@shared/types/domain';
import type {
  LocalBillingPlan,
  LocalGroupMember,
  LocalNotification,
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type { BillingPlanRow, GroupMemberRow, GroupRow, NotificationRow } from './types';

export function dateValue(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function periodLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

function addMonthsDate(date: string, billingDay: number | null, monthCount: number): string {
  const source = new Date(`${date}T12:00:00Z`);
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + monthCount, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(billingDay ?? source.getUTCDate(), lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function prepaymentPeriodLabel(date: string, months: number): string {
  const start = periodLabel(date);
  if (months <= 1) return `Предоплата: ${start}`;
  const end = periodLabel(addMonthsDate(date, null, months - 1));
  return `Предоплата: ${start} - ${end}`;
}

export function canManageTrainer(identity: ServerIdentity, trainerId: string): boolean {
  return hasServerRole(identity, 'owner') || identity.profile.id === trainerId;
}

export async function profileName(userId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const result = await admin.from('users').select('first_name,last_name').eq('id', userId).single();
  return result.data ? `${result.data.first_name} ${result.data.last_name}` : 'Ученик';
}

export async function isTrainerInOrganization(trainerId: string, organizationId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const result = await admin
    .from('users')
    .select('id,user_roles!inner(role)')
    .eq('id', trainerId)
    .eq('organization_id', organizationId)
    .eq('user_roles.role', 'trainer')
    .maybeSingle();

  return Boolean(result.data);
}

export async function isMemberInOrganization(memberId: string, organizationId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const result = await admin
    .from('users')
    .select('id')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .eq('role', 'member')
    .maybeSingle();

  return Boolean(result.data);
}

export async function createNotification(
  organizationId: string,
  userId: string,
  message: string,
  paymentId?: string
): Promise<LocalNotification | null> {
  const admin = getSupabaseAdmin();
  const result = await admin
    .from('notifications')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      payment_id: paymentId ?? null,
      event_key: null,
      message,
      read: false
    })
    .select('*')
    .single();

  if (result.error || !result.data) return null;

  await sendPushToUser(organizationId, userId, {
    title: 'Tartib',
    body: message,
    url: '/dashboard'
  });

  return toLocalNotification(result.data as NotificationRow);
}

export function toLocalGroup(row: GroupRow): LocalTrainingGroup {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    activity: row.activity,
    days: row.days,
    time: row.time.slice(0, 5),
    note: row.note,
    defaultAmount: row.default_amount == null ? null : Number(row.default_amount),
    defaultBillingDay: row.default_billing_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toLocalGroupMember(row: GroupMemberRow): LocalGroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    memberId: row.member_id,
    createdAt: row.created_at
  };
}

export function toLocalBillingPlan(row: BillingPlanRow): LocalBillingPlan {
  return {
    id: row.id,
    memberId: row.member_id,
    trainerId: row.trainer_id,
    type: row.type,
    trainingFormat: row.training_format,
    baseAmount: Number(row.base_amount),
    billingDay: row.billing_day,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toLocalPayment(row: PaymentRequest): PaymentRequest {
  return {
    id: row.id,
    organization_id: row.organization_id,
    member_id: row.member_id,
    trainer_id: row.trainer_id,
    amount: Number(row.amount),
    due_date: row.due_date,
    status: row.status,
    created_at: row.created_at,
    plan_id: row.plan_id,
    period_label: row.period_label,
    is_current: row.is_current,
    coverage_months: row.coverage_months ?? 1,
    paid_at: row.paid_at,
    delay_requested_date: row.delay_requested_date,
    delay_comment: row.delay_comment,
    delay_status: row.delay_status,
    delay_requested_at: row.delay_requested_at,
    delay_decided_at: row.delay_decided_at,
    delay_decided_by: row.delay_decided_by
  };
}

function toLocalNotification(row: NotificationRow): LocalNotification {
  return {
    id: row.id,
    userId: row.user_id,
    message: row.message,
    createdAt: row.created_at,
    read: row.read,
    eventKey: row.event_key ?? undefined,
    paymentId: row.payment_id ?? undefined
  };
}
