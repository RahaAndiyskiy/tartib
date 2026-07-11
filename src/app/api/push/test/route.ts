import { NextResponse } from 'next/server';
import { requireIdentity } from '@shared/lib/serverAuth';
import { sendPushToUser } from '@shared/lib/pushNotifications';

export async function POST(request: Request): Promise<NextResponse> {
  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const result = await sendPushToUser(identity.profile.organization_id, identity.profile.id, {
    title: 'Tartib',
    body: 'Тестовое уведомление работает.',
    url: '/dashboard'
  });

  if (result.subscriptions === 0) {
    return NextResponse.json({ error: 'На этом аккаунте ещё нет push-подписки.' }, { status: 409 });
  }

  if (result.sent === 0) {
    return NextResponse.json({ error: 'Push не был доставлен. Подписка будет обновлена при следующем входе.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...result });
}
