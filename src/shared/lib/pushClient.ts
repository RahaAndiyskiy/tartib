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

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12_000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Сервер push-уведомлений не ответил. Попробуйте ещё раз.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existingRegistration = await withTimeout(
    navigator.serviceWorker.getRegistration(),
    4_000,
    'Не удалось проверить службу уведомлений.'
  );
  if (existingRegistration?.active) return existingRegistration;

  if (!existingRegistration) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  return withTimeout(
    navigator.serviceWorker.ready,
    6_000,
    'Приложение ещё готовит уведомления. Закройте и снова откройте Tartib.'
  );
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

  const registration = await withTimeout(
    navigator.serviceWorker.getRegistration(),
    4_000,
    'Не удалось проверить службу уведомлений.'
  );
  if (!registration) return 'enabled';
  const subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    5_000,
    'Не удалось проверить push-подписку.'
  );
  return subscription ? 'granted' : 'enabled';
}

async function authHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseClient();
  const session = await withTimeout(
    supabase.auth.getSession(),
    5_000,
    'Не удалось проверить вход. Откройте приложение заново.'
  );
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Требуется вход.');

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function enablePushNotifications(): Promise<PushAvailability> {
  if (!pushSupported()) return 'unsupported';

  // Permission must be the first awaited browser action so iOS keeps the user gesture.
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await withTimeout(
        Notification.requestPermission(),
        30_000,
        'Разрешение на уведомления не подтверждено.'
      );
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'enabled';

  const publicKeyResponse = await fetchWithTimeout('/api/push/public-key');
  const publicKeyData = (await publicKeyResponse.json()) as {
    enabled?: boolean;
    publicKey?: string | null;
  };
  if (!publicKeyResponse.ok) {
    throw new Error('Не удалось получить настройки push-уведомлений.');
  }
  if (!publicKeyData.enabled || !publicKeyData.publicKey) return 'disabled';

  const registration = await readyServiceWorker();
  const existingSubscription = await withTimeout(
    registration.pushManager.getSubscription(),
    5_000,
    'Не удалось проверить текущую push-подписку.'
  );
  const subscription =
    existingSubscription ??
    (await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKeyData.publicKey)
      }),
      8_000,
      'Не удалось создать подписку на этом устройстве.'
    ));

  const response = await fetchWithTimeout('/api/push/subscription', {
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

  const registration = await withTimeout(
    navigator.serviceWorker.getRegistration(),
    4_000,
    'Не удалось проверить службу уведомлений.'
  );
  if (!registration) return;
  const subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    5_000,
    'Не удалось проверить push-подписку.'
  );
  if (!subscription) return;

  const response = await fetchWithTimeout('/api/push/subscription', {
    method: 'DELETE',
    headers: await authHeaders(),
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Не удалось отключить push-уведомления.');
  }

  await withTimeout(
    subscription.unsubscribe(),
    5_000,
    'Подписка удалена с сервера, но устройство не успело завершить отключение.'
  );
}
