import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import type { PaymentRequestStatus } from '@shared/types/domain';
import type { ActionBody, GroupRow } from './types';
import { canManageTrainer, isTrainerInOrganization, toLocalGroup } from './utils';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateValue(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function dueDateForBillingDay(billingDay: number): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const targetMonth = now.getUTCDate() > billingDay ? month + 1 : month;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(billingDay, lastDay);
  return new Date(Date.UTC(year, targetMonth, day)).toISOString().slice(0, 10);
}

function periodLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

async function applyGroupPaymentDefaults(
  organizationId: string,
  groupId: string,
  trainerId: string,
  amount: number | null,
  billingDay: number | null
): Promise<string | null> {
  if (amount == null || billingDay == null) return null;

  const admin = getSupabaseAdmin();
  const members = await admin
    .from('group_members')
    .select('member_id')
    .eq('organization_id', organizationId)
    .eq('group_id', groupId);
  if (members.error) return members.error.message;

  const dueDate = dueDateForBillingDay(billingDay);
  const status = (dateValue(dueDate) < dateValue(todayString()) ? 'overdue' : 'active') as PaymentRequestStatus;

  // Групповая цена обновляется параллельно для всех учеников, кроме индивидуальных тарифов.
  const updateResults = await Promise.all((members.data ?? []).map(async (member): Promise<string | null> => {
    const existingPlan = await admin
      .from('billing_plans')
      .select('id,source')
      .eq('member_id', member.member_id)
      .eq('active', true)
      .maybeSingle();
    if (existingPlan.error) return existingPlan.error.message;
    if (existingPlan.data?.source === 'individual') return null;

    const planValues = {
      organization_id: organizationId,
      member_id: member.member_id,
      trainer_id: trainerId,
      type: 'monthly' as const,
      training_format: 'group' as const,
      source: 'group_default' as const,
      base_amount: amount,
      billing_day: billingDay,
      active: true,
      updated_at: new Date().toISOString()
    };

    const planResult = existingPlan.data
      ? await admin.from('billing_plans').update(planValues).eq('id', existingPlan.data.id).select('id').single()
      : await admin.from('billing_plans').insert(planValues).select('id').single();
    if (planResult.error || !planResult.data) return planResult.error?.message ?? 'Не удалось обновить абонемент.';

    const existingPayment = await admin
      .from('payment_requests')
      .select('id,status')
      .eq('member_id', member.member_id)
      .eq('is_current', true)
      .maybeSingle();
    if (existingPayment.error) return existingPayment.error.message;
    if (
      existingPayment.data &&
      ['payment_confirmation', 'delay_requested', 'skip_requested', 'paid', 'skipped'].includes(
        existingPayment.data.status
      )
    ) {
      // Начатый процесс оплаты, отсрочки или пропуска нельзя сбрасывать изменением настроек группы.
      return null;
    }

    const paymentValues = {
      organization_id: organizationId,
      member_id: member.member_id,
      trainer_id: trainerId,
      amount,
      due_date: dueDate,
      status,
      plan_id: planResult.data.id,
      period_label: periodLabel(dueDate),
      is_current: true,
      coverage_months: 1
    };

    const paymentResult = existingPayment.data
      ? await admin.from('payment_requests').update(paymentValues).eq('id', existingPayment.data.id)
      : await admin.from('payment_requests').insert(paymentValues);
    if (paymentResult.error) return paymentResult.error.message;
    return null;
  }));

  const firstError = updateResults.find(Boolean);
  if (firstError) return firstError;

  return null;
}

export async function saveGroupAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'save_group' }>
): Promise<NextResponse> {
  if (!hasServerRole(identity, 'trainer') && !hasServerRole(identity, 'owner')) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  const trainerId = hasServerRole(identity, 'owner')
    ? body.trainerId || identity.profile.id
    : identity.profile.id;
  if (!(await isTrainerInOrganization(trainerId, organizationId))) {
    return NextResponse.json({ error: 'Тренер недоступен.' }, { status: 403 });
  }
  if (!body.activity.trim() || !body.days.trim() || !body.time) {
    return NextResponse.json({ error: 'Укажите направление, дни и время.' }, { status: 400 });
  }

  const defaultAmount = body.defaultAmount == null ? null : Number(body.defaultAmount);
  const defaultBillingDay = body.defaultBillingDay == null ? null : Number(body.defaultBillingDay);
  if (
    (defaultAmount != null && defaultAmount <= 0) ||
    (defaultBillingDay != null && (defaultBillingDay < 1 || defaultBillingDay > 31))
  ) {
    return NextResponse.json({ error: 'Некорректные условия оплаты группы.' }, { status: 400 });
  }

  const groupValues = {
    organization_id: organizationId,
    trainer_id: trainerId,
    activity: body.activity.trim(),
    days: body.days.trim(),
    time: body.time,
    note: body.note?.trim() ?? '',
    default_amount: defaultAmount,
    default_billing_day: defaultAmount == null ? null : defaultBillingDay,
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
    const defaultsError = await applyGroupPaymentDefaults(
      organizationId,
      body.id,
      trainerId,
      defaultAmount,
      defaultAmount == null ? null : defaultBillingDay
    );
    if (defaultsError) {
      return NextResponse.json({ error: defaultsError }, { status: 400 });
    }
    return NextResponse.json({ group: toLocalGroup(result.data as GroupRow) });
  }

  const result = await admin.from('groups').insert(groupValues).select('*').single();
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error?.message ?? 'Не удалось создать группу.' }, { status: 400 });
  }
  return NextResponse.json({ group: toLocalGroup(result.data as GroupRow) });
}

export async function deleteGroupAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'delete_group' }>
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
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
