import { getSupabaseClient } from '@shared/lib/supabaseClient';

export type PushAvailability =
  | 'blocked'
  | 'disabled'
  | 'enabled'
  | 'granted'
  | 'unsupported';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray.buffer.slice(
    outputArray.byteOffset,
    outputArray.byteOffset + outputArray.byteLength
  ) as ArrayBuffer;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function pushPermissionState(): PushAvailability {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') return 'granted';
  return 'enabled';
}

export async function pushSubscriptionState(): Promise<PushAvailability> {
  const permissionState = pushPermissionState();
  if (permissionState !== 'granted') return permissionState;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'enabled';
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'granted' : 'enabled';
}

async function authHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseClient();
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Требуется вход.');

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function enablePushNotifications(): Promise<PushAvailability> {
  if (!pushSupported()) return 'unsupported';

  const publicKeyResponse = await fetch('/api/push/public-key');
  const publicKeyData = (await publicKeyResponse.json()) as {
    enabled?: boolean;
    publicKey?: string | null;
  };
  if (!publicKeyData.enabled || !publicKeyData.publicKey) return 'disabled';

  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'enabled';

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKeyData.publicKey)
    }));

  const response = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(subscription.toJSON())
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Не удалось включить push-уведомления.');
  }

  return 'granted';
}

export async function disablePushNotifications(): Promise<void> {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await fetch('/api/push/subscription', {
    method: 'DELETE',
    headers: await authHeaders(),
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Не удалось отключить push-уведомления.');
  }

  await subscription.unsubscribe();
}
