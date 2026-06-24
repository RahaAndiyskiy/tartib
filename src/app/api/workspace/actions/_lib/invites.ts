import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import type { ActionBody } from './types';
import { canManageTrainer } from './utils';

export async function createMemberInviteAction(
  request: Request,
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'create_member_invite' }>
): Promise<NextResponse> {
  if (!hasServerRole(identity, 'owner') && !hasServerRole(identity, 'trainer')) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const firstName = body.firstName?.trim() ?? '';
  const lastName = body.lastName?.trim() ?? '';
  if (!body.groupId) {
    return NextResponse.json({ error: 'Выберите группу для ссылки.' }, { status: 400 });
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

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const requestOrigin = new URL(request.url).origin;
  const origin = configuredOrigin || requestOrigin;
  const isGroupLink = !firstName && !lastName;

  if (isGroupLink) {
    const activeInviteResult = await admin
      .from('member_invites')
      .select('public_token,expires_at')
      .eq('organization_id', identity.profile.organization_id)
      .eq('group_id', group.id)
      .eq('trainer_id', group.trainer_id)
      .eq('status', 'pending')
      .is('first_name', null)
      .is('last_name', null)
      .not('public_token', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeInviteResult.data?.public_token) {
      return NextResponse.json(
        {
          ok: true,
          inviteUrl: `${origin}/join/${activeInviteResult.data.public_token}`,
          expiresAt: activeInviteResult.data.expires_at,
          reused: true
        },
        { status: 200 }
      );
    }
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresInDays = isGroupLink ? 365 : 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const inviteResult = await admin
    .from('member_invites')
    .insert({
      organization_id: identity.profile.organization_id,
      group_id: group.id,
      trainer_id: group.trainer_id,
      created_by: identity.profile.id,
      first_name: firstName || null,
      last_name: lastName || null,
      token_hash: tokenHash,
      public_token: isGroupLink ? token : null,
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

  return NextResponse.json(
    {
      ok: true,
      inviteUrl: `${origin}/join/${token}`,
      expiresAt
    },
    { status: 201 }
  );
}
