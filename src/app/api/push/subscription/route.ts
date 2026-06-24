import { NextResponse } from 'next/server';
import { requireIdentity } from '@shared/lib/serverAuth';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
};

export async function POST(request: Request): Promise<NextResponse> {
  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const body = (await request.json()) as PushSubscriptionBody;
  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Некорректная push-подписка.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const result = await admin
    .from('push_subscriptions')
    .upsert(
      {
        organization_id: identity.profile.organization_id,
        user_id: identity.profile.id,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get('user-agent'),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single();

  return result.error
    ? NextResponse.json({ error: result.error.message }, { status: 400 })
    : NextResponse.json({ ok: true, id: result.data.id });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: 'Некорректная push-подписка.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const result = await admin
    .from('push_subscriptions')
    .delete()
    .eq('organization_id', identity.profile.organization_id)
    .eq('user_id', identity.profile.id)
    .eq('endpoint', endpoint);

  return result.error
    ? NextResponse.json({ error: result.error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
