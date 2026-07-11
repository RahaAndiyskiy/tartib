import { getSupabaseClient } from '@shared/lib/supabaseClient';

export type PushAvailability =
  | 'blocked'
  | 'disabled'
  | 'enabled'
  | 'granted'
  | 'unsupported';

export type PushOperationStage =
  | 'checking-permission'
  | 'loading-config'
  | 'preparing-device'
  | 'creating-subscription'
  | 'saving-subscription'
  | 'testing-delivery';

type PushOperationOptions = {
  onStage?: (stage: PushOperationStage) => void;
};

const SERVICE_WORKER_TIMEOUT_MS = 18_000;

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

function waitForStateChange(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    worker.addEventListener('statechange', () => resolve(), { once: true });
  });
}

async function waitForActiveRegistration(
  registration: ServiceWorkerRegistration
): Promise<ServiceWorkerRegistration | null> {
  const deadline = Date.now() + SERVICE_WORKER_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (registration.active) return registration;

    const worker = registration.installing ?? registration.waiting;
    if (worker) {
      worker.postMessage({ type: 'SKIP_WAITING' });
      await withTimeout(
        waitForStateChange(worker),
        1_500,
        'Ждём активацию службы уведомлений.'
      ).catch(() => undefined);
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  return registration.active ? registration : null;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existingRegistration = await withTimeout(
    navigator.serviceWorker.getRegistration('/'),
    4_000,
    'Не удалось проверить службу уведомлений.'
  );

  const registration =
    existingRegistration ??
    (await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    }));

  await registration.update().catch(() => undefined);
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });

  return registration;
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

export async function preparePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!pushSupported()) {
    throw new Error('Этот браузер не поддерживает web push.');
  }

  const registration = await registerServiceWorker();
  const activeRegistration = await waitForActiveRegistration(registration);
  if (activeRegistration?.active) return activeRegistration;

  const readyRegistration = await withTimeout(
    navigator.serviceWorker.ready,
    SERVICE_WORKER_TIMEOUT_MS,
    'Служба уведомлений не успела активироваться.'
  ).catch(() => null);

  if (readyRegistration?.active) return readyRegistration;

  throw new Error(
    'Service Worker не активен. Tartib не может создать push-подписку на этом устройстве.'
  );
}

export async function pushSubscriptionState(): Promise<PushAvailability> {
  const permissionState = pushPermissionState();
  if (permissionState !== 'granted') return permissionState;

  const registration = await preparePushServiceWorker();
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

export async function sendTestPushNotification(): Promise<void> {
  const response = await fetchWithTimeout('/api/push/test', {
    method: 'POST',
    headers: await authHeaders()
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Не удалось отправить тестовое уведомление.');
  }
}

export async function enablePushNotifications(
  options: PushOperationOptions = {}
): Promise<PushAvailability> {
  if (!pushSupported()) return 'unsupported';

  options.onStage?.('checking-permission');
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await withTimeout(
        Notification.requestPermission(),
        30_000,
        'Разрешение на уведомления не подтверждено.'
      );
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'enabled';

  options.onStage?.('loading-config');
  const publicKeyResponse = await fetchWithTimeout('/api/push/public-key');
  const publicKeyData = (await publicKeyResponse.json()) as {
    enabled?: boolean;
    publicKey?: string | null;
  };
  if (!publicKeyResponse.ok) {
    throw new Error('Не удалось получить настройки push-уведомлений.');
  }
  if (!publicKeyData.enabled || !publicKeyData.publicKey) return 'disabled';

  options.onStage?.('preparing-device');
  const registration = await preparePushServiceWorker();
  const existingSubscription = await withTimeout(
    registration.pushManager.getSubscription(),
    5_000,
    'Не удалось проверить текущую push-подписку.'
  );

  if (!existingSubscription) options.onStage?.('creating-subscription');
  const subscription =
    existingSubscription ??
    (await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKeyData.publicKey)
      }),
      12_000,
      'Не удалось создать подписку на этом устройстве.'
    ));

  options.onStage?.('saving-subscription');
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
