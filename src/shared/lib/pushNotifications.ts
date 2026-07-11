import webPush, { type PushSubscription } from 'web-push';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type PushSendResult = {
  failed: number;
  sent: number;
  subscriptions: number;
};

let configured = false;

function configureWebPush(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@tartib.local';

  if (!publicKey || !privateKey) {
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function pushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPushToUser(
  organizationId: string,
  userId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  if (!configureWebPush()) return { failed: 0, sent: 0, subscriptions: 0 };

  const admin = getSupabaseAdmin();
  const subscriptions = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  if (subscriptions.error || !subscriptions.data?.length) {
    if (subscriptions.error) {
      console.warn('[push] failed to load subscriptions', subscriptions.error.message);
    }
    return { failed: 0, sent: 0, subscriptions: 0 };
  }

  const results = await Promise.all(
    subscriptions.data.map(async (subscription) => {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      };

      try {
        await webPush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? '/dashboard'
          })
        );
        return { sent: true };
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'statusCode' in error
            ? Number((error as { statusCode?: number }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', subscription.id);
          return { sent: false };
        }

        console.warn('[push] failed to send notification', error);
        return { sent: false };
      }
    })
  );

  const sent = results.filter((result) => result.sent).length;
  return {
    failed: results.length - sent,
    sent,
    subscriptions: subscriptions.data.length
  };
}
