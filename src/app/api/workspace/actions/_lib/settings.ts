import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, type ServerIdentity } from '@shared/lib/serverAuth';
import type { AppUser, Organization } from '@shared/types/domain';
import type { ActionBody } from './types';

export async function updateProfileAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'update_profile' }>
): Promise<NextResponse> {
  const firstName = body.firstName.trim();
  const lastName = body.lastName.trim();
  const phone = body.phone?.trim() || null;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'Укажите имя и фамилию.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const result = await admin
    .from('users')
    .update({
      first_name: firstName,
      last_name: lastName,
      phone
    })
    .eq('id', identity.profile.id)
    .eq('organization_id', identity.profile.organization_id)
    .select('*')
    .single();

  return result.error || !result.data
    ? NextResponse.json({ error: result.error?.message ?? 'Не удалось сохранить профиль.' }, { status: 400 })
    : NextResponse.json({ user: result.data as AppUser });
}

export async function updateOrganizationAction(
  identity: ServerIdentity,
  body: Extract<ActionBody, { action: 'update_organization' }>
): Promise<NextResponse> {
  if (!hasServerRole(identity, 'owner')) {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }

  const name = body.name.trim();
  if (!name) {
    return NextResponse.json({ error: 'Укажите название клуба.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const result = await admin
    .from('organizations')
    .update({ name })
    .eq('id', identity.profile.organization_id)
    .select('*')
    .single();

  return result.error || !result.data
    ? NextResponse.json({ error: result.error?.message ?? 'Не удалось сохранить клуб.' }, { status: 400 })
    : NextResponse.json({ organization: result.data as Organization });
}
