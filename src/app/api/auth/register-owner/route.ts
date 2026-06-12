import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { normalizeUsername, usernameToAuthEmail } from '@shared/lib/authUsername';

type RegisterOwnerBody = {
  organizationName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  password?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RegisterOwnerBody;
    const username = normalizeUsername(body.username ?? '');
    const password = body.password ?? '';
    const organizationName = body.organizationName?.trim() ?? '';
    const firstName = body.firstName?.trim() ?? '';
    const lastName = body.lastName?.trim() ?? '';

    if (!organizationName || !firstName || !lastName || username.length < 3 || password.length < 6) {
      return NextResponse.json(
        { error: 'Заполните все поля. Логин — от 3 символов, пароль — от 6.' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const existing = await admin.from('users').select('id').ilike('username', username).maybeSingle();
    if (existing.data) {
      return NextResponse.json({ error: 'Этот логин уже занят.' }, { status: 409 });
    }

  const authResult = await admin.auth.admin.createUser({
    email: usernameToAuthEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (authResult.error || !authResult.data.user) {
    return NextResponse.json(
      { error: authResult.error?.message ?? 'Не удалось создать аккаунт.' },
      { status: 400 }
    );
  }

  const organizationResult = await admin
    .from('organizations')
    .insert({ name: organizationName })
    .select('*')
    .single();

  if (organizationResult.error || !organizationResult.data) {
    await admin.auth.admin.deleteUser(authResult.data.user.id);
    return NextResponse.json(
      { error: organizationResult.error?.message ?? 'Не удалось создать организацию.' },
      { status: 400 }
    );
  }

  const profileResult = await admin
    .from('users')
    .insert({
      auth_user_id: authResult.data.user.id,
      organization_id: organizationResult.data.id,
      role: 'owner',
      username,
      first_name: firstName,
      last_name: lastName,
      email: null,
      phone: null
    })
    .select('*')
    .single();

  if (profileResult.error || !profileResult.data) {
    await admin.from('organizations').delete().eq('id', organizationResult.data.id);
    await admin.auth.admin.deleteUser(authResult.data.user.id);
    return NextResponse.json(
      { error: profileResult.error?.message ?? 'Не удалось создать профиль.' },
      { status: 400 }
    );
  }

  const rolesResult = await admin.from('user_roles').insert([
    { user_id: profileResult.data.id, role: 'owner' },
    { user_id: profileResult.data.id, role: 'trainer' }
  ]);

  if (rolesResult.error) {
    return NextResponse.json({ error: rolesResult.error.message }, { status: 400 });
  }

    return NextResponse.json({ username }, { status: 201 });
  } catch (error) {
    console.error('[register-owner] failed', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes('Supabase environment variables')
            ? 'Supabase не настроен в переменных окружения Vercel.'
            : 'Не удалось создать организацию.'
      },
      { status: 500 }
    );
  }
}
