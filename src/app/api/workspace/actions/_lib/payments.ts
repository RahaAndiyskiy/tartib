import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { type ServerIdentity } from '@shared/lib/serverAuth';
import { formatMoney } from '@shared/constants/app';
import type { PaymentRequest, PaymentRequestStatus } from '@shared/types/domain';
import type { ActionBody, BillingPlanRow, PaymentActionBody } from './types';
import {
  canManageTrainer,
  createNotification,
  dateValue,
  periodLabel,
  prepaymentPeriodLabel,
  profileName,
  todayString,
  toLocalBillingPlan,
  toLocalPayment
} from './utils';

export async function savePaymentAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'save_payment' }>
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
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
    is_current: true,
    coverage_months: 1
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

function logNotificationFailure(context: string, paymentId: string, userId: string): void {
  console.warn('[workspace-action] notification failed', { context, paymentId, userId });
}

export async function deletePaymentAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'delete_payment' }>
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
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
    `Счёт отменён: ${formatMoney(payment.amount)}.`
  );
  if (!notification) {
    logNotificationFailure('delete_payment', payment.id, payment.member_id);
  }

  return NextResponse.json({
    deletedPaymentId: payment.id,
    disabledPlanId,
    notification
  });
}

export async function paymentLifecycleAction(
  identity: ServerIdentity,
  body: PaymentActionBody
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  const paymentResult = await admin
    .from('payment_requests')
    .select('*')
    .eq('id', body.paymentId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  const payment = paymentResult.data;
  if (!payment) return NextResponse.json({ error: 'Оплата не найдена.' }, { status: 404 });

  if (body.action === 'submit_payment') {
    return submitPaymentAction(identity, payment as PaymentRequest);
  }

  if (body.action === 'submit_prepayment') {
    return submitPrepaymentAction(identity, payment as PaymentRequest, body.months);
  }

  if (body.action === 'request_delay') {
    return requestDelayAction(identity, payment as PaymentRequest, body.requestedDate, body.comment);
  }

  if (!canManageTrainer(identity, payment.trainer_id)) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  if (body.action === 'decide_delay') {
    return decideDelayAction(identity, payment as PaymentRequest, body.approved);
  }

  return decidePaymentAction(identity, payment as PaymentRequest, body.approved);
}

async function submitPaymentAction(identity: ServerIdentity, payment: PaymentRequest): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  if (payment.member_id !== identity.profile.id || !['active', 'overdue', 'delayed'].includes(payment.status)) {
    return NextResponse.json({ error: 'Действие недоступно.' }, { status: 403 });
  }
  if (payment.status !== 'overdue' && dateValue(payment.due_date) > dateValue(todayString())) {
    return NextResponse.json(
      { error: 'Счёт ещё не открыт. Для оплаты заранее используйте предоплату.' },
      { status: 400 }
    );
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
    `${await profileName(payment.member_id)}: оплата ${formatMoney(payment.amount)}.`,
    payment.id
  );
  if (paymentResult.error || !paymentResult.data) {
    return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось отправить подтверждение.' }, { status: 400 });
  }
  if (!notification) {
    logNotificationFailure('submit_payment', payment.id, payment.trainer_id);
  }
  return NextResponse.json({
    payment: toLocalPayment(paymentResult.data as PaymentRequest),
    notification
  });
}

async function submitPrepaymentAction(
  identity: ServerIdentity,
  payment: PaymentRequest,
  monthCount: number
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  const months = Math.trunc(Number(monthCount));
  if (
    payment.member_id !== identity.profile.id ||
    !['active', 'overdue', 'delayed'].includes(payment.status) ||
    months < 1 ||
    months > 12
  ) {
    return NextResponse.json({ error: 'Действие недоступно.' }, { status: 403 });
  }

  const plan = payment.plan_id
    ? await admin.from('billing_plans').select('*').eq('id', payment.plan_id).maybeSingle()
    : null;
  if (!plan?.data?.active || plan.data.type !== 'monthly') {
    return NextResponse.json({ error: 'Предоплата доступна только для месячного абонемента.' }, { status: 400 });
  }

  const amount = Number(plan.data.base_amount) * months;
  const paymentResult = await admin
    .from('payment_requests')
    .update({
      status: 'payment_confirmation',
      amount,
      coverage_months: months,
      period_label: prepaymentPeriodLabel(payment.due_date, months)
    })
    .eq('id', payment.id)
    .select('*')
    .single();
  if (paymentResult.error || !paymentResult.data) {
    return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось отправить предоплату.' }, { status: 400 });
  }

  const notification = await createNotification(
    organizationId,
    payment.trainer_id,
    `${await profileName(payment.member_id)}: предоплата ${months} мес., ${formatMoney(amount)}.`,
    payment.id
  );
  if (!notification) {
    logNotificationFailure('submit_prepayment', payment.id, payment.trainer_id);
  }

  return NextResponse.json({
    payment: toLocalPayment(paymentResult.data as PaymentRequest),
    notification
  });
}

async function requestDelayAction(
  identity: ServerIdentity,
  payment: PaymentRequest,
  requestedDate: string,
  comment?: string
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  if (
    payment.member_id !== identity.profile.id ||
    dateValue(requestedDate) <= dateValue(payment.due_date) ||
    dateValue(requestedDate) < dateValue(todayString())
  ) {
    return NextResponse.json({ error: 'Выберите корректную новую дату.' }, { status: 400 });
  }
  const paymentResult = await admin
    .from('payment_requests')
    .update({
      status: 'delay_requested',
      delay_requested_date: requestedDate,
      delay_comment: comment?.trim() || null,
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
    `${await profileName(payment.member_id)} запрашивает отсрочку до ${requestedDate}${comment?.trim() ? `: ${comment.trim()}` : '.'}`,
    payment.id
  );
  if (paymentResult.error || !paymentResult.data) {
    return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось запросить отсрочку.' }, { status: 400 });
  }
  if (!notification) {
    logNotificationFailure('request_delay', payment.id, payment.trainer_id);
  }
  return NextResponse.json({
    payment: toLocalPayment(paymentResult.data as PaymentRequest),
    notification
  });
}

async function decideDelayAction(
  identity: ServerIdentity,
  payment: PaymentRequest,
  approved: boolean
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  if (payment.status !== 'delay_requested') {
    return NextResponse.json({ error: 'Запрос уже обработан.' }, { status: 400 });
  }
  const nextDueDate =
    approved && payment.delay_requested_date
      ? payment.delay_requested_date
      : payment.due_date;
  const nextStatus: PaymentRequestStatus = approved
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
      delay_status: approved ? 'approved' : 'rejected',
      delay_decided_at: new Date().toISOString(),
      delay_decided_by: identity.profile.id
    })
    .eq('id', payment.id)
    .select('*')
    .single();
  const notification = await createNotification(
    organizationId,
    payment.member_id,
    approved
      ? `Отсрочка одобрена. Новый срок оплаты: ${nextDueDate}.`
      : 'Запрос отсрочки отклонён.',
    payment.id
  );
  if (paymentResult.error || !paymentResult.data) {
    return NextResponse.json({ error: paymentResult.error?.message ?? 'Не удалось обработать отсрочку.' }, { status: 400 });
  }
  if (!notification) {
    logNotificationFailure('decide_delay', payment.id, payment.member_id);
  }
  return NextResponse.json({
    payment: toLocalPayment(paymentResult.data as PaymentRequest),
    notification
  });
}

async function decidePaymentAction(
  identity: ServerIdentity,
  payment: PaymentRequest,
  approved: boolean
): Promise<NextResponse> {
  if (payment.status !== 'payment_confirmation') {
    return NextResponse.json({ error: 'Подтверждение уже обработано.' }, { status: 400 });
  }

  return approved
    ? approvePaymentAction(identity, payment)
    : rejectPaymentAction(identity, payment);
}

async function rejectPaymentAction(identity: ServerIdentity, payment: PaymentRequest): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
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
    logNotificationFailure('reject_payment', payment.id, payment.member_id);
  }

  return NextResponse.json({
    payment: toLocalPayment(rejectedResult.data as PaymentRequest),
    nextPayment: null,
    notification
  });
}

async function approvePaymentAction(identity: ServerIdentity, payment: PaymentRequest): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  const confirmationResult = await admin.rpc('confirm_payment_and_advance', {
    p_payment_id: payment.id,
    p_organization_id: organizationId
  });
  const confirmationRow = Array.isArray(confirmationResult.data)
    ? confirmationResult.data[0]
    : confirmationResult.data;
  const confirmedPayment = confirmationRow?.payment as PaymentRequest | undefined;
  const nextPayment = (confirmationRow?.next_payment ?? null) as PaymentRequest | null;
  if (confirmationResult.error || !confirmedPayment) {
    return NextResponse.json({ error: confirmationResult.error?.message ?? 'Не удалось подтвердить оплату.' }, { status: 400 });
  }

  const notification = await createNotification(
    organizationId,
    payment.member_id,
    'Ваша оплата подтверждена ответственным лицом.',
    payment.id
  );
  if (!notification) {
    logNotificationFailure('approve_payment', payment.id, payment.member_id);
  }

  return NextResponse.json({
    payment: toLocalPayment(confirmedPayment),
    nextPayment: nextPayment ? toLocalPayment(nextPayment) : null,
    notification
  });
}
