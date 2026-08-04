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

  // ⚠️ TAG DISTINCT — dérivé des data même si le serveur n'a pas fourni de
  // tag : un appel entrant (call-<callId>) ne doit JAMAIS être écrasé par une
  // notification de message (msg-<conversationId>) qui partageait l'ancien
  // tag commun 'notre-bulle' (le remplacement aurait coupé le son/vibreur).
  if (data?.screen === 'call') {
    tag = data?.callId ? `call-${String(data.callId)}` : 'call-incoming';
  } else if (data?.conversationId) {
    tag = `msg-${String(data.conversationId)}`;
  }

  // Vibration différenciée : appel entrant = alarme longue qui se répète,
  // message = petit bip court. (Le son personnalisé n'est pas jouable par
  // une notification Web Push — limite plateforme. On maximise la vibration
  // + le son système par défaut du navigateur.)
  const isCall = data?.screen === 'call';
  const options: NotificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    data,
    // Vibration différenciée : appel entrant = alarme longue qui se répète,
    // message = petit bip court. (Le son personnalisé n'est pas jouable par
    // une notification Web Push — limite plateforme. On maximise la vibration
    // + le son système par défaut du navigateur.)
    vibrate: isCall ? [400, 200, 400, 200, 900] : [200, 100, 200],
    requireInteraction: true,
    // Pas de renotify : chaque appel a un tag unique (call-<callId>), donc le
    // drapeau ne se déclenche jamais (il exige de REMPLACER une notification
    // existante du même tag). Sur Chrome Android, il peut en plus inhiber la
    // vibration sur la 1re notification — on le retire.
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
    // Transmettre callId/type/role pour que CallScreen se monte en
    // mode répondant (role=callee → initie l'offre WebRTC).
    if (notifData?.callId) {
      urlToOpen.searchParams.set('callId', String(notifData.callId));
      if (notifData?.callType) urlToOpen.searchParams.set('type', String(notifData.callType));
      urlToOpen.searchParams.set('role', 'callee');
    }
  } else if (notifData?.conversationId || notifData?.screen === 'chat') {
    // Nouveau message → ouvrir le chat directement.
    // Si l'app est verrouillée, RequireAuth redirige vers l'écran de verrou.
    urlToOpen.pathname = '/chat';
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
