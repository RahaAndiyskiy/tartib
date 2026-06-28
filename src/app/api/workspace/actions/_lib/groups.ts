import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import type { ActionBody, GroupRow } from './types';
import { canManageTrainer, isTrainerInOrganization, toLocalGroup } from './utils';

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
