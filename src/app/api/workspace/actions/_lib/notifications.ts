import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import type { ServerIdentity } from '@shared/lib/serverAuth';

export async function markNotificationsReadAction(identity: ServerIdentity): Promise<NextResponse> {
  const admin = getSupabaseAdmin();
  const result = await admin
    .from('notifications')
    .update({ read: true })
    .eq('user_id', identity.profile.id)
    .eq('organization_id', identity.profile.organization_id);

  return result.error
    ? NextResponse.json({ error: result.error.message }, { status: 400 })
    : NextResponse.json({ success: true });
}
