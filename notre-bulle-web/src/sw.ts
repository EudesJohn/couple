// ============================================================
// Service Worker — Notre Bulle
// injectManifest strategy : ce fichier est compilé par Vite,
// et self.__WB_MANIFEST est remplacé par la liste des assets
// à précacher par Workbox.
//
// Gère les notifications push même quand l'app est fermée.
// ============================================================
import { precacheAndRoute } from 'workbox-precaching';

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// ==========================================================
// PRECACHE — tous les assets build injectés par VitePWA
// ==========================================================
precacheAndRoute(self.__WB_MANIFEST);

// ==========================================================
// INSTALL — activation immédiate (pas d'attente)
// ==========================================================
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ==========================================================
// ACTIVATE — prendre le contrôle de toutes les fenêtres
// ==========================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ==========================================================
// PUSH — notification push reçue du serveur
// ==========================================================
self.addEventListener('push', (event) => {
  let title = 'Notre Bulle';
  let body = 'Nouveau message';
  let data: Record<string, unknown> = {};
  let tag = 'notre-bulle';

  try {
    const payload = event.data?.json();
    if (payload) {
      title = payload.title || title;
      body = payload.body || body;
      tag = payload.tag || tag;
      data = payload.data || data;
    }
  } catch {
    // Si le payload n'est pas du JSON, utiliser le texte brut
    const text = event.data?.text();
    if (text) body = text;
  }

  const options: NotificationOptions = {
    body,
    icon: '/icon-192.jpg',
    badge: '/icon-192.jpg',
    tag,
    data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    // silent: false — laisser le système jouer le son par défaut
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ==========================================================
// NOTIFICATION CLICK — clic sur la notification → ouvrir l'app
// ==========================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const urlToOpen = new URL('/', self.location.origin);

  // Si la notification vient d'un appel entrant, naviguer vers la page call
  if (notifData?.screen === 'call') {
    urlToOpen.pathname = '/call';
  } else if (notifData?.conversationId || notifData?.screen === 'chat') {
    urlToOpen.pathname = '/';
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Si une fenêtre de l'app est déjà ouverte, la focus
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => {
              // Envoyer un message au client pour naviguer si besoin
              if (urlToOpen.pathname !== '/') {
                client.postMessage({
                  type: 'NAVIGATE',
                  payload: { path: urlToOpen.pathname },
                });
              }
            });
          }
        }
        // Sinon ouvrir une nouvelle fenêtre
        return clients.openWindow(urlToOpen.toString());
      })
  );
});
