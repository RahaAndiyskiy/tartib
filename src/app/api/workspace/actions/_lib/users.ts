import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { normalizeUsername, usernameToAuthEmail } from '@shared/lib/authUsername';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import type { ActionBody } from './types';

export async function createUserAction(
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
  const roleResult = await admin.from('user_roles').insert({ user_id: user.id, role: body.role });
  if (roleResult.error) {
    await admin.from('users').delete().eq('id', user.id);
    await admin.auth.admin.deleteUser(authResult.data.user.id);
    return NextResponse.json({ error: roleResult.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
