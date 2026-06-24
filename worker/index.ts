/// <reference lib="webworker" />

export {};

const swSelf = self as unknown as ServiceWorkerGlobalScope;

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

swSelf.addEventListener('push', (event: Event) => {
  const pushEvent = event as PushEvent;
  const payload = (pushEvent.data?.json() ?? {}) as PushPayload;
  const title = payload.title ?? 'Tartib';
  const url = payload.url ?? '/dashboard';

  pushEvent.waitUntil(
    swSelf.registration.showNotification(title, {
      body: payload.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-180x180.png',
      data: { url },
      tag: url
    })
  );
});

swSelf.addEventListener('notificationclick', (event: Event) => {
  const notificationEvent = event as NotificationEvent;
  notificationEvent.notification.close();
  const targetUrl = String(notificationEvent.notification.data?.url ?? '/dashboard');
  const url = new URL(targetUrl, swSelf.location.origin).href;

  notificationEvent.waitUntil(
    swSelf.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existingClient = clients.find((client) => client.url === url);
        if (existingClient) return existingClient.focus();
        return swSelf.clients.openWindow(url);
      })
  );
});
