import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { normalizeUsername, usernameToAuthEmail } from '@shared/lib/authUsername';
import { hasServerRole, requireIdentity, type ServerIdentity } from '@shared/lib/serverAuth';
import type {
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat
} from '@shared/types/domain';
import type {
  LocalBillingPlan,
  LocalGroupMember,
  LocalNotification,
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';

type ActionBody =
  | {
      action: 'create_member_invite';
      firstName: string;
      lastName: string;
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
  | {
      action: 'request_delay';
      paymentId: string;
      requestedDate: string;
      comment?: string;
    }
  | { action: 'decide_delay'; paymentId: string; approved: boolean }
  | { action: 'decide_payment'; paymentId: string; approved: boolean }
  | { action: 'mark_notifications_read' };

function dateValue(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function periodLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

function nextMonthDate(date: string, billingDay: number | null): string {
  const source = new Date(`${date}T12:00:00Z`);
  const year = source.getUTCMonth() === 11 ? source.getUTCFullYear() + 1 : source.getUTCFullYear();
  const month = (source.getUTCMonth() + 1) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(billingDay ?? source.getUTCDate(), lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function canManageTrainer(identity: ServerIdentity, trainerId: string): boolean {
  return hasServerRole(identity, 'owner') || identity.profile.id === trainerId;
}

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

type GroupRow = {
  id: string;
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
  group_id: string;
  member_id: string;
  created_at: string;
};

type BillingPlanRow = {
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

async function profileName(userId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const result = await admin.from('users').select('first_name,last_name').eq('id', userId).single();
  return result.data ? `${result.data.first_name} ${result.data.last_name}` : 'Ученик';
}

async function createNotification(
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

  return result.error || !result.data ? null : toLocalNotification(result.data as NotificationRow);
}

function toLocalGroup(row: GroupRow): LocalTrainingGroup {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    activity: row.activity,
    days: row.days,
    time: row.time.slice(0, 5),
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLocalGroupMember(row: GroupMemberRow): LocalGroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    memberId: row.member_id,
    createdAt: row.created_at
  };
}

function toLocalBillingPlan(row: BillingPlanRow): LocalBillingPlan {
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

function toLocalPayment(row: PaymentRequest): PaymentRequest {
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

async function createUserAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'create_user' }>
): Promise<NextResponse> {
  const isOwner = hasServerRole(identity, 'owner');
  if (!isOwner || body.role !== 'trainer') {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const username = normalizeUsername(body.username);
  if (
    !body.firstName.trim() ||
    !body.lastName.trim() ||
    username.length < 3 ||
    body.password.length < 6
  ) {
    return NextResponse.json(
      { error: 'Укажите имя, фамилию, логин от 3 символов и пароль от 6 символов.' },
      { status: 400 }
    );
  }

  const existing = await admin.from('users').select('id').ilike('username', username).maybeSingle();
  if (existing.data) {
    return NextResponse.json({ error: 'Этот логин уже занят.' }, { status: 409 });
  }

  const authResult = await admin.auth.admin.createUser({
    email: usernameToAuthEmail(username),
    password: body.password,
    email_confirm: true,
    user_metadata: { username }
  });
  if (authResult.error || !authResult.data.user) {
    return NextResponse.json(
      { error: authResult.error?.message ?? 'Не удалось создать аккаунт.' },
      { status: 400 }
    );
  }

  const profileResult = await admin
    .from('users')
    .insert({
      auth_user_id: authResult.data.user.id,
      organization_id: identity.profile.organization_id,
      role: body.role,
      username,
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      phone: body.phone?.trim() || null,
      email: null
    })
    .select('*')
    .single();

  if (profileResult.error || !profileResult.data) {
    await admin.auth.admin.deleteUser(authResult.data.user.id);
    return NextResponse.json(
      { error: profileResult.error?.message ?? 'Не удалось создать профиль.' },
      { status: 400 }
    );
  }

  const user = profileResult.data;
  await admin.from('user_roles').insert({ user_id: user.id, role: body.role });

  return NextResponse.json({ ok: true }, { status: 201 });
}

async function createMemberInviteAction(
  request: Request,
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'create_member_invite' }>
): Promise<NextResponse> {
  if (!hasServerRole(identity, 'owner') && !hasServerRole(identity, 'trainer')) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const firstName = body.firstName.trim();
  const lastName = body.lastName.trim();
  if (!firstName || !lastName || !body.groupId) {
    return NextResponse.json({ error: 'Укажите имя, фамилию и группу.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const groupResult = await admin
    .from('groups')
    .select('id,trainer_id,organization_id')
    .eq('id', body.groupId)
    .eq('organization_id', identity.profile.organization_id)
    .maybeSingle();
  const group = groupResult.data;

  if (!group || !canManageTrainer(identity, group.trainer_id)) {
    return NextResponse.json({ error: 'Выберите доступную группу.' }, { status: 400 });
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const inviteResult = await admin
    .from('member_invites')
    .insert({
      organization_id: identity.profile.organization_id,
      group_id: group.id,
      trainer_id: group.trainer_id,
      created_by: identity.profile.id,
      first_name: firstName,
      last_name: lastName,
      token_hash: tokenHash,
      expires_at: expiresAt
    })
    .select('id')
    .single();

  if (inviteResult.error) {
    return NextResponse.json(
      { error: inviteResult.error.message || 'Не удалось создать приглашение.' },
      { status: 400 }
    );
  }

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const requestOrigin = new URL(request.url).origin;
  return NextResponse.json(
    {
      ok: true,
      inviteUrl: `${configuredOrigin || requestOrigin}/join/${token}`,
      expiresAt
    },
    { status: 201 }
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const body = (await request.json()) as ActionBody;
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;

  if (body.action === 'create_member_invite') {
    return createMemberInviteAction(request, identity, body);
  }

  if (body.action === 'create_user') {
    return createUserAction(identity, body);
  }

  if (body.action === 'save_group') {
    if (!hasServerRole(identity, 'trainer') && !hasServerRole(identity, 'owner')) {
      return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
    }
    const trainerId = hasServerRole(identity, 'owner')
      ? body.trainerId || identity.profile.id
      : identity.profile.id;
    if (!body.activity.trim() || !body.days.trim() || !body.time) {
      return NextResponse.json({ error: 'Укажите направление, дни и время.' }, { status: 400 });
    }

    const groupValues = {
      organization_id: organizationId,
      trainer_id: trainerId,
      activity: body.activity.trim(),
      days: body.days.trim(),
      time: body.time,
      note: body.note?.trim() ?? '',
      updated_at: new Date().toISOString()
    };

    if (body.id) {
      const existing = await admin
        .from('groups')
        .select('*')
        .eq('id', body.id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!existing.data || !canManageTrainer(identity, existing.data.trainer_id)) {
        return NextResponse.json({ error: 'Группа недоступна.' }, { status: 403 });
      }
      const result = await admin
        .from('groups')
        .update(groupValues)
        .eq('id', body.id)
        .select('*')
        .single();
      if (result.error || !result.data) {
        return NextResponse.json({ error: result.error?.message ?? 'Не удалось сохранить группу.' }, { status: 400 });
      }
      return NextResponse.json({ group: toLocalGroup(result.data as GroupRow) });
    }

    const result = await admin.from('groups').insert(groupValues).select('*').single();
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message ?? 'Не удалось создать группу.' }, { status: 400 });
    }
    return NextResponse.json({ group: toLocalGroup(result.data as GroupRow) });
  }

  if (body.action === 'delete_group') {
    const group = await admin
      .from('groups')
      .select('*')
      .eq('id', body.groupId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!group.data || !canManageTrainer(identity, group.data.trainer_id)) {
      return NextResponse.json({ error: 'Группа недоступна.' }, { status: 403 });
    }
    const result = await admin.from('groups').delete().eq('id', body.groupId);
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }
    return NextResponse.json({ deletedGroupId: body.groupId });
  }

  if (body.action === 'assign_member_group') {
    const group = await admin
      .from('groups')
      .select('*')
      .eq('id', body.groupId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!group.data || !canManageTrainer(identity, group.data.trainer_id)) {
      return NextResponse.json({ error: 'Группа недоступна.' }, { status: 403 });
    }
    await admin.from('group_members').delete().eq('member_id', body.memberId);
    await admin.from('trainer_members').delete().eq('member_id', body.memberId);
    const [groupResult, trainerResult] = await Promise.all([
      admin
        .from('group_members')
        .insert({
          organization_id: organizationId,
          group_id: body.groupId,
          member_id: body.memberId
        })
        .select('*')
        .single(),
      admin
        .from('trainer_members')
        .insert({
          organization_id: organizationId,
          trainer_id: group.data.trainer_id,
          member_id: body.memberId
        })
        .select('*')
        .single()
    ]);
    const error = groupResult.error ?? trainerResult.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      assignment: trainerResult.data,
      groupMember: toLocalGroupMember(groupResult.data as GroupMemberRow)
    });
  }

  if (body.action === 'save_payment') {
    const assignment = await admin
      .from('trainer_members')
      .select('*')
      .eq('member_id', body.memberId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (
      !assignment.data ||
      !canManageTrainer(identity, assignment.data.trainer_id) ||
      body.amount <= 0 ||
      !body.dueDate
    ) {
      return NextResponse.json({ error: 'Оплата или ученик недоступны.' }, { status: 403 });
    }

    const existingPlan = await admin
      .from('billing_plans')
      .select('*')
      .eq('member_id', body.memberId)
      .eq('active', true)
      .maybeSingle();
    const planValues = {
      organization_id: organizationId,
      member_id: body.memberId,
      trainer_id: assignment.data.trainer_id,
      type: body.type,
      training_format: body.trainingFormat,
      base_amount:
        !existingPlan.data || body.updateFuture ? body.amount : Number(existingPlan.data.base_amount),
      billing_day:
        body.type === 'monthly'
          ? new Date(`${body.dueDate}T12:00:00Z`).getUTCDate()
          : null,
      active: true,
      updated_at: new Date().toISOString()
    };
    const planResult = existingPlan.data
      ? await admin
          .from('billing_plans')
          .update(planValues)
          .eq('id', existingPlan.data.id)
          .select('*')
          .single()
      : await admin.from('billing_plans').insert(planValues).select('*').single();
    if (planResult.error || !planResult.data) {
      return NextResponse.json({ error: planResult.error?.message }, { status: 400 });
    }

    const existingPayment = await admin
      .from('payment_requests')
      .select('*')
      .eq('member_id', body.memberId)
      .eq('is_current', true)
      .maybeSingle();
    const paymentValues = {
      organization_id: organizationId,
      member_id: body.memberId,
      trainer_id: assignment.data.trainer_id,
      amount: body.amount,
      due_date: body.dueDate,
      plan_id: planResult.data.id,
      period_label: periodLabel(body.dueDate),
      status: (dateValue(body.dueDate) < dateValue(todayString())
        ? 'overdue'
        : 'active') as PaymentRequestStatus,
      is_current: true
    };
    const paymentResult = existingPayment.data
      ? await admin
          .from('payment_requests')
          .update(paymentValues)
          .eq('id', existingPayment.data.id)
          .select('*')
          .single()
      : await admin.from('payment_requests').insert(paymentValues).select('*').single();
    if (paymentResult.error || !paymentResult.data || !planResult.data) {
      const paymentError = paymentResult.error as { message?: string } | null | undefined;
      const billingPlanError = planResult.error as { message?: string } | null | undefined;
      const errorMessage = paymentError?.message ?? billingPlanError?.message ?? 'Не удалось сохранить оплату.';
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    return NextResponse.json({
      payment: toLocalPayment(paymentResult.data as PaymentRequest),
      billingPlan: toLocalBillingPlan(planResult.data as BillingPlanRow)
    });
  }

  if (body.action === 'delete_payment') {
    const paymentResult = await admin
      .from('payment_requests')
      .select('*')
      .eq('id', body.paymentId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    const payment = paymentResult.data;

    if (!payment) {
      return NextResponse.json({ error: 'Счёт не найден.' }, { status: 404 });
    }
    if (!canManageTrainer(identity, payment.trainer_id)) {
      return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
    }
    if (payment.status === 'paid') {
      return NextResponse.json(
        { error: 'Подтверждённую оплату нельзя удалить из истории.' },
        { status: 400 }
      );
    }

    const deleteResult = await admin.from('payment_requests').delete().eq('id', payment.id);
    if (deleteResult.error) {
      return NextResponse.json({ error: deleteResult.error.message }, { status: 400 });
    }

    let disabledPlanId = null;
    if (payment.plan_id) {
      const planResult = await admin
        .from('billing_plans')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', payment.plan_id)
        .select('*')
        .single();
      disabledPlanId = planResult.data?.id ?? null;
    }

    const notification = await createNotification(
      organizationId,
      payment.member_id,
      `Счёт на ${Number(payment.amount).toFixed(2)} ₺ отменён ответственным лицом.`
    );
    if (!notification) {
      return NextResponse.json({ error: 'Не удалось создать уведомление.' }, { status: 400 });
    }

    return NextResponse.json({
      deletedPaymentId: payment.id,
      disabledPlanId,
      notification
    });
  }

  const paymentActions = ['submit_payment', 'request_delay', 'decide_delay', 'decide_payment'];
  if (paymentActions.includes(body.action)) {
    const paymentId = 'paymentId' in body ? body.paymentId : '';
    const paymentResult = await admin
      .from('payment_requests')
      .select('*')
      .eq('id', paymentId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    const payment = paymentResult.data;
    if (!payment) return NextResponse.json({ error: 'Оплата не найдена.' }, { status: 404 });

    if (body.action === 'submit_payment') {
      if (payment.member_id !== identity.profile.id || !['active', 'overdue', 'delayed'].includes(payment.status)) {
        return NextResponse.json({ error: 'Действие недоступно.' }, { status: 403 });
      }
      const paymentResult = await admin
        .from('payment_requests')
        .update({ status: 'payment_confirmation' })
        .eq('id', payment.id)
        .select('*')
        .single();
      const notification = await createNotification(
        organizationId,
        payment.trainer_id,
        `${await profileName(payment.member_id)} сообщил об оплате ${Number(payment.amount).toFixed(2)} ₽.`,
        payment.id
      );
      if (paymentResult.error || !paymentResult.data) {
        return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось отправить подтверждение.' }, { status: 400 });
      }
      if (!notification) {
        return NextResponse.json({ error: 'Не удалось создать уведомление.' }, { status: 400 });
      }
      return NextResponse.json({
        payment: toLocalPayment(paymentResult.data as PaymentRequest),
        notification
      });
    }

    if (body.action === 'request_delay') {
      if (
        payment.member_id !== identity.profile.id ||
        dateValue(body.requestedDate) <= dateValue(payment.due_date) ||
        dateValue(body.requestedDate) < dateValue(todayString())
      ) {
        return NextResponse.json({ error: 'Выберите корректную новую дату.' }, { status: 400 });
      }
      const paymentResult = await admin
        .from('payment_requests')
        .update({
          status: 'delay_requested',
          delay_requested_date: body.requestedDate,
          delay_comment: body.comment?.trim() || null,
          delay_status: 'pending',
          delay_requested_at: new Date().toISOString(),
          delay_decided_at: null,
          delay_decided_by: null
        })
        .eq('id', payment.id)
        .select('*')
        .single();
      const notification = await createNotification(
        organizationId,
        payment.trainer_id,
        `${await profileName(payment.member_id)} запрашивает отсрочку до ${body.requestedDate}${body.comment?.trim() ? `: ${body.comment.trim()}` : '.'}`,
        payment.id
      );
      if (paymentResult.error || !paymentResult.data) {
        return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось запросить отсрочку.' }, { status: 400 });
      }
      if (!notification) {
        return NextResponse.json({ error: 'Не удалось создать уведомление.' }, { status: 400 });
      }
      return NextResponse.json({
        payment: toLocalPayment(paymentResult.data as PaymentRequest),
        notification
      });
    }

    if (!canManageTrainer(identity, payment.trainer_id)) {
      return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
    }

    if (body.action === 'decide_delay') {
      if (payment.status !== 'delay_requested') {
        return NextResponse.json({ error: 'Запрос уже обработан.' }, { status: 400 });
      }
      const nextDueDate =
        body.approved && payment.delay_requested_date
          ? payment.delay_requested_date
          : payment.due_date;
      const nextStatus: PaymentRequestStatus = body.approved
        ? dateValue(nextDueDate) < dateValue(todayString())
          ? 'overdue'
          : 'delayed'
        : dateValue(payment.due_date) < dateValue(todayString())
          ? 'overdue'
          : 'active';
      const paymentResult = await admin
        .from('payment_requests')
        .update({
          due_date: nextDueDate,
          period_label: periodLabel(nextDueDate),
          status: nextStatus,
          delay_status: body.approved ? 'approved' : 'rejected',
          delay_decided_at: new Date().toISOString(),
          delay_decided_by: identity.profile.id
        })
        .eq('id', payment.id)
        .select('*')
        .single();
      const notification = await createNotification(
        organizationId,
        payment.member_id,
        body.approved
          ? `Отсрочка одобрена. Новый срок оплаты: ${nextDueDate}.`
          : 'Запрос отсрочки отклонён.',
        payment.id
      );
      if (paymentResult.error || !paymentResult.data) {
        return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось обработать отсрочку.' }, { status: 400 });
      }
      if (!notification) {
        return NextResponse.json({ error: 'Не удалось создать уведомление.' }, { status: 400 });
      }
      return NextResponse.json({
        payment: toLocalPayment(paymentResult.data as PaymentRequest),
        notification
      });
    }

    if (payment.status !== 'payment_confirmation') {
      return NextResponse.json({ error: 'Подтверждение уже обработано.' }, { status: 400 });
    }
    if (body.action !== 'decide_payment') {
      return NextResponse.json({ error: 'Неизвестное действие.' }, { status: 400 });
    }

    if (!body.approved) {
      const rejectedStatus: PaymentRequestStatus =
        dateValue(payment.due_date) < dateValue(todayString()) ? 'overdue' : 'active';
      const rejectedResult = await admin
        .from('payment_requests')
        .update({ status: rejectedStatus })
        .eq('id', payment.id)
        .select('*')
        .single();
      if (rejectedResult.error || !rejectedResult.data) {
        return NextResponse.json({ error: rejectedResult.error?.message ?? 'Не удалось отклонить оплату.' }, { status: 400 });
      }

      const notification = await createNotification(
        organizationId,
        payment.member_id,
        'Подтверждение оплаты отклонено. Проверьте оплату и отправьте подтверждение повторно.',
        payment.id
      );
      if (!notification) {
        return NextResponse.json({ error: 'Не удалось создать уведомление.' }, { status: 400 });
      }

      return NextResponse.json({
        payment: toLocalPayment(rejectedResult.data as PaymentRequest),
        nextPayment: null,
        notification
      });
    }

    const plan = payment.plan_id
      ? await admin.from('billing_plans').select('*').eq('id', payment.plan_id).maybeSingle()
      : null;
    const shouldAdvance = plan?.data?.active && plan.data.type === 'monthly' && payment.is_current;
    const updatedPaymentResult = await admin
      .from('payment_requests')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        is_current: shouldAdvance ? false : payment.is_current
      })
      .eq('id', payment.id)
      .select('*')
      .single();
    if (updatedPaymentResult.error || !updatedPaymentResult.data) {
      return NextResponse.json({ error: updatedPaymentResult.error?.message ?? 'Не удалось подтвердить оплату.' }, { status: 400 });
    }

    let nextPayment: PaymentRequest | null = null;
    if (shouldAdvance && plan?.data) {
      const nextDueDate = nextMonthDate(payment.due_date, plan.data.billing_day);
      const nextPaymentResult = await admin
        .from('payment_requests')
        .insert({
          organization_id: organizationId,
          member_id: payment.member_id,
          trainer_id: payment.trainer_id,
          amount: Number(plan.data.base_amount),
          due_date: nextDueDate,
          status: 'active',
          plan_id: plan.data.id,
          period_label: periodLabel(nextDueDate),
          is_current: true,
          paid_at: null
        })
        .select('*')
        .single();
      if (nextPaymentResult.error || !nextPaymentResult.data) {
        return NextResponse.json({ error: nextPaymentResult.error?.message ?? 'Не удалось создать следующий счёт.' }, { status: 400 });
      }
      nextPayment = nextPaymentResult.data as PaymentRequest;
    }

    const notification = await createNotification(
      organizationId,
      payment.member_id,
      'Ваша оплата подтверждена ответственным лицом.',
      payment.id
    );
    if (!notification) {
      return NextResponse.json({ error: 'Не удалось создать уведомление.' }, { status: 400 });
    }

    return NextResponse.json({
      payment: toLocalPayment(updatedPaymentResult.data as PaymentRequest),
      nextPayment: nextPayment ? toLocalPayment(nextPayment) : null,
      notification
    });
  }

  if (body.action === 'mark_notifications_read') {
    const result = await admin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', identity.profile.id)
      .eq('organization_id', organizationId);
    return result.error
      ? NextResponse.json({ error: result.error.message }, { status: 400 })
      : NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Неизвестное действие.' }, { status: 400 });
}
