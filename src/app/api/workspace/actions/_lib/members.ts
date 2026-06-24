import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import type { ActionBody, GroupMemberRow } from './types';
import { canManageTrainer, isMemberInOrganization, toLocalGroupMember } from './utils';

export async function assignMemberGroupAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'assign_member_group' }>
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
  if (!(await isMemberInOrganization(body.memberId, organizationId))) {
    return NextResponse.json({ error: 'Ученик недоступен.' }, { status: 403 });
  }
  await admin.from('group_members').delete().eq('member_id', body.memberId).eq('organization_id', organizationId);
  await admin.from('trainer_members').delete().eq('member_id', body.memberId).eq('organization_id', organizationId);
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

export async function deleteMemberAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'delete_member' }>
): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  const memberResult = await admin
    .from('users')
    .select('id,auth_user_id,organization_id,role')
    .eq('id', body.memberId)
    .eq('organization_id', organizationId)
    .eq('role', 'member')
    .maybeSingle();
  const member = memberResult.data;

  if (!member) {
    return NextResponse.json({ error: 'Ученик не найден.' }, { status: 404 });
  }

  const assignment = await admin
    .from('trainer_members')
    .select('trainer_id')
    .eq('member_id', body.memberId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!hasServerRole(identity, 'owner') && assignment.data?.trainer_id !== identity.profile.id) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const deleteResult = await admin.from('users').delete().eq('id', body.memberId);
  if (deleteResult.error) {
    return NextResponse.json({ error: deleteResult.error.message }, { status: 400 });
  }

  if (member.auth_user_id) {
    await admin.auth.admin.deleteUser(member.auth_user_id);
  }

  return NextResponse.json({ deletedMemberId: body.memberId });
}
