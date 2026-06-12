import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { normalizeUsername, usernameToAuthEmail } from '@shared/lib/authUsername';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import type { Database } from '@shared/types/database';

type RouteContext = {
  params: Promise<{ token: string }>;
};

type MemberInvite = Database['public']['Tables']['member_invites']['Row'];

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function findInvite(
  token: string
): Promise<{ data: MemberInvite | null; error: unknown }> {
  const admin = getSupabaseAdmin();
  return admin
    .from('member_invites')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params;
  const admin = getSupabaseAdmin();
  const inviteResult = await findInvite(token);
  const invite = inviteResult.data;

  if (!invite || invite.status !== 'pending') {
    return NextResponse.json({ error: 'Приглашение недействительно или уже использовано.' }, { status: 404 });
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await admin.from('member_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Срок действия приглашения истёк.' }, { status: 410 });
  }
  const [organizationResult, groupResult, trainerResult] = await Promise.all([
    admin.from('organizations').select('name').eq('id', invite.organization_id).single(),
    admin.from('groups').select('activity,days,time').eq('id', invite.group_id).single(),
    admin.from('users').select('first_name,last_name').eq('id', invite.trainer_id).single()
  ]);

  if (!organizationResult.data || !groupResult.data || !trainerResult.data) {
    return NextResponse.json({ error: 'Данные приглашения больше недоступны.' }, { status: 404 });
  }

  return NextResponse.json({
    firstName: invite.first_name,
    lastName: invite.last_name,
    organizationName: organizationResult.data.name,
    group: groupResult.data,
    trainerName: `${trainerResult.data.first_name} ${trainerResult.data.last_name}`,
    expiresAt: invite.expires_at
  });
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params;
  const body = (await request.json()) as {
    username?: string;
    password?: string;
    phone?: string;
  };
  const username = normalizeUsername(body.username ?? '');
  const password = body.password ?? '';

  if (username.length < 3 || password.length < 6) {
    return NextResponse.json(
      { error: 'Логин должен быть от 3 символов, пароль — от 6 символов.' },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const inviteResult = await findInvite(token);
  const invite = inviteResult.data;

  if (!invite || invite.status !== 'pending') {
    return NextResponse.json({ error: 'Приглашение недействительно или уже использовано.' }, { status: 404 });
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await admin.from('member_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Срок действия приглашения истёк.' }, { status: 410 });
  }
  const activeInvite = invite;

  const existing = await admin.from('users').select('id').ilike('username', username).maybeSingle();
  if (existing.data) {
    return NextResponse.json({ error: 'Этот логин уже занят.' }, { status: 409 });
  }

  const claimResult = await admin
    .from('member_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!claimResult.data) {
    return NextResponse.json({ error: 'Приглашение уже используется.' }, { status: 409 });
  }

  async function releaseInvite(): Promise<void> {
    await admin
      .from('member_invites')
      .update({ status: 'pending', accepted_at: null, accepted_user_id: null })
      .eq('id', activeInvite.id)
      .is('accepted_user_id', null);
  }

  const authResult = await admin.auth.admin.createUser({
    email: usernameToAuthEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username }
  });
  if (authResult.error || !authResult.data.user) {
    await releaseInvite();
    return NextResponse.json(
      { error: authResult.error?.message ?? 'Не удалось создать аккаунт.' },
      { status: 400 }
    );
  }

  const authUserId = authResult.data.user.id;
  const profileResult = await admin
    .from('users')
    .insert({
      auth_user_id: authUserId,
      organization_id: activeInvite.organization_id,
      role: 'member',
      username,
      first_name: activeInvite.first_name,
      last_name: activeInvite.last_name,
      phone: body.phone?.trim() || null,
      email: null
    })
    .select('*')
    .single();

  if (profileResult.error || !profileResult.data) {
    await admin.auth.admin.deleteUser(authUserId);
    await releaseInvite();
    return NextResponse.json(
      { error: profileResult.error?.message ?? 'Не удалось создать профиль ученика.' },
      { status: 400 }
    );
  }

  const user = profileResult.data;
  const [roleResult, trainerResult, groupResult] = await Promise.all([
    admin.from('user_roles').insert({ user_id: user.id, role: 'member' }),
    admin.from('trainer_members').insert({
      organization_id: activeInvite.organization_id,
      trainer_id: activeInvite.trainer_id,
      member_id: user.id
    }),
    admin.from('group_members').insert({
      organization_id: activeInvite.organization_id,
      group_id: activeInvite.group_id,
      member_id: user.id
    })
  ]);

  const assignmentError = roleResult.error || trainerResult.error || groupResult.error;
  if (assignmentError) {
    await admin.from('users').delete().eq('id', user.id);
    await admin.auth.admin.deleteUser(authUserId);
    await releaseInvite();
    return NextResponse.json(
      { error: assignmentError.message || 'Не удалось добавить ученика в группу.' },
      { status: 400 }
    );
  }

  await admin
    .from('member_invites')
    .update({ accepted_user_id: user.id })
    .eq('id', activeInvite.id);

  return NextResponse.json({ ok: true }, { status: 201 });
}
