// ============================================================
// Hook — Notifications web (Web Notification API + Push API)
// Web Notification API : notifications quand l'app est ouverte
// Push API : notifications via Service Worker (app fermée/vérouillée)
// ============================================================
import { useEffect, useRef } from 'react';
import { playMessageSound, startRingtone, playCallEndSound } from '../lib/sounds';
import { config } from '../constants/config';
import { getOwnProfileId } from '../lib/profile';

// ==========================================
// UTILITAIRE : VAPID public key → Uint8Array
// La Push API nécessite une clé au format Uint8Array
// ==========================================
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

// ==========================================
// VERROU GLOBAL — évite les appels concurrents à pushManager.subscribe()
// qui causent des AbortError quand plusieurs composants appellent
// requestNotificationPermission() en même temps (App + LockScreen + Chat)
// ==========================================
let pushRegisterPromise: Promise<boolean> | null = null;
let lastPushRegisterAttempt = 0;
const PUSH_REGISTER_COOLDOWN_MS = 15_000;

// ==========================================
// API BASE — point d'entrée vers le backend
// ==========================================
function apiBase(): string {
  // En production, l'API est sur le même domaine (Vercel)
  // En dev, on utilise le proxy Vite ou l'URL directe
  if (import.meta.env.DEV) {
    return '/api';
  }
  return '/api';
}

// ==========================================
// INSCRIPTION AU PUSH (abonnement du navigateur)
// ==========================================
async function registerPushSubscription(): Promise<boolean> {
  // === DEDUP : si déjà en cours, retourner la même promesse ===
  if (pushRegisterPromise) return pushRegisterPromise;

  // === COOLDOWN : éviter les retry loops ===
  const now = Date.now();
  if (now - lastPushRegisterAttempt < PUSH_REGISTER_COOLDOWN_MS) {
    return false;
  }
  lastPushRegisterAttempt = now;

  pushRegisterPromise = _registerPushInner();

  try {
    return await pushRegisterPromise;
  } finally {
    pushRegisterPromise = null;
  }
}

async function _registerPushInner(): Promise<boolean> {
  try {
    // Vérifier que le service worker est actif
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push API non supportée');
      return false;
    }

    const profileId = getOwnProfileId();
    if (!profileId) {
      console.warn('Aucun profileId — push subscription non enregistrée');
      return false;
    }

    if (!config.vapidPublicKey) {
      console.warn('VITE_VAPID_PUBLIC_KEY non définie — push désactivé');
      return false;
    }

    // === DIAGNOSTIC : Vérifier l'état du Service Worker ===
    const swRegistrations = await navigator.serviceWorker.getRegistrations();
    if (swRegistrations.length === 0) {
      console.warn('Aucun service worker enregistré — push impossible');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      console.warn('Service worker pas encore actif — push impossible');
      return false;
    }

    // === DIAGNOSTIC : Vérifier la connectivité Push ===
    if (!registration.pushManager) {
      console.warn('PushManager non disponible sur cette registration SW');
      return false;
    }

    // Tester la connectivité push service (sans s'abonner)
    // Certains environnements (VPN, proxy, entreprise) bloquent FCM
    try {
      // Vérifier qu'on peut atteindre le push service en testant l'abonnement existant
      const testSub = await registration.pushManager.getSubscription();
      if (testSub) {
        const subInfo = testSub.toJSON();
        if (subInfo.endpoint && subInfo.keys?.p256dh && subInfo.keys?.auth) {
          // Subscription existante valide → sync
          return await _syncSubscription(profileId, testSub);
        }
        // Subscription invalide → la supprimer
        await testSub.unsubscribe();
      }
    } catch {
      // Si getSubscription échoue, le push service est injoignable
      console.warn('Push service injoignable sur ce réseau — push désactivé');
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(config.vapidPublicKey);

    // === ABONNEMENT avec une seule tentative ===
    // Si AbortError → push service FCM injoignable (VPN, proxy, pays bloqué)
    // Inutile de retenter — ça ne marchera pas tant que le réseau n'aura pas changé
    let subscription: PushSubscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Push service injoignable (FCM bloqué, VPN, proxy, etc.)
        // Pas de retry — ça ne ferait que polluer la console
        console.warn('Push service injoignable — notifications push désactivées sur ce réseau');
      } else {
        console.warn('Erreur push subscribe:', err);
      }
      return false;
    }

    // Synchroniser avec le backend
    return await _syncSubscription(profileId, subscription);

  } catch (err) {
    console.warn('Erreur registerPushSubscription:', err);
    return false;
  }
}

// Envoyer / mettre à jour l'abonnement push côté serveur
async function _syncSubscription(profileId: string, subscription: PushSubscription): Promise<boolean> {
  try {
    const subData = subscription.toJSON();
    const response = await fetch(`${apiBase()}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: profileId,
        endpoint: subData.endpoint,
        p256dh_key: subData.keys?.p256dh || '',
        auth_key: subData.keys?.auth || '',
      }),
    });

    if (!response.ok) {
      console.warn('Erreur enregistrement subscription push:', await response.text());
      return false;
    }

    console.log('✅ Push subscription synchronisée avec le serveur');
    return true;
  } catch (err) {
    console.warn('Erreur sync push subscription:', err);
    return false;
  }
}

// ==========================================
// ENVOI D'UNE NOTIFICATION PUSH au partenaire
// Appelée après l'envoi d'un message
// ==========================================
export async function triggerPushNotification(
  recipientProfileId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase()}/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_profile_id: recipientProfileId,
        title,
        body,
        data: data || {},
      }),
    });

    if (!response.ok) {
      console.warn('Erreur envoi push:', await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Erreur triggerPushNotification:', err);
    return false;
  }
}

// ==========================================
// WEB : Notification API (quand l'app est ouverte)
// ==========================================
async function requestWebNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

async function sendWebNotification(title: string, body: string, data?: Record<string, any>) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // 1. Essayer le Service Worker (nécessaire pour iOS PWA standalone
  //    où new Notification() est silencieusement bloqué)
  if (navigator.serviceWorker?.ready) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'notre-bulle',
        data,
        vibrate: [200, 100, 200],
        requireInteraction: true,
      } as NotificationOptions);
      return; // Succès
    } catch {
      // Fallback à new Notification()
    }
  }

  // 2. Fallback Desktop / Android Chrome
  try {
    const notif = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'notre-bulle',
      data,
    });

    notif.onclick = () => {
      if (data?.screen === 'chat') {
        window.focus();
        window.location.href = '/chat';
      } else if (data?.screen === 'call') {
        window.focus();
        window.location.href = '/call';
      }
      notif.close();
    };

    setTimeout(() => notif.close(), 5000);
  } catch (err) {
    console.warn('Web notification error:', err);
  }
}

// ==========================================
// INITIALISATION
// ==========================================
export async function setupNotifications(): Promise<void> {
  // Rien à faire ici — la permission est demandée au premier message
}

// Demander la permission et enregistrer le push
export async function requestNotificationPermission(): Promise<boolean> {
  const granted = await requestWebNotificationPermission();
  if (granted) {
    // Enregistrer le push subscription (en arrière-plan)
    registerPushSubscription().catch(() => {});
  }
  return granted;
}

// ==========================================
// AFFICHAGE DES NOTIFICATIONS
// ==========================================
export async function notifyNewMessage(
  senderName: string,
  content: string | null,
  conversationId: string
): Promise<void> {
  const body = content ?? 'Photo ou media reçu';
  sendWebNotification(senderName, body, { screen: 'chat', conversationId });
  playMessageSound();
}

export async function notifyMissedCall(
  callerName: string,
  callType: 'audio' | 'video'
): Promise<void> {
  const typeLabel = callType === 'video' ? 'Video' : 'Audio';
  sendWebNotification('Appel manqué', `${typeLabel} — ${callerName} t'a appelé`, { screen: 'chat', callType });
  playCallEndSound();
}

export async function notifyIncomingCall(
  callerName: string,
  callType: 'audio' | 'video'
): Promise<void> {
  const typeLabel = callType === 'video' ? 'Video' : 'Audio';
  sendWebNotification(`Appel ${typeLabel}`, `${callerName} t'appelle...`, { screen: 'call', callType });
  startRingtone();
}

export async function notifyStatusChange(
  senderName: string,
  status: 'delivered' | 'read'
): Promise<void> {
  const label = status === 'read' ? 'a lu ton message' : 'message distribué';
  sendWebNotification(senderName, label, { screen: 'chat' });
}

// ==========================================
// GESTION DES CLICS SUR NOTIFICATION
// ==========================================
export function useNotificationHandler() {
  const handlerCalled = useRef(false);

  useEffect(() => {
    if (handlerCalled.current) return;
    handlerCalled.current = true;

    // Web: les clics sont gérés dans sendWebNotification
    // et dans le service worker (notificationclick)
    // Rien à faire ici — le onclick est déjà attaché

    // Écouter les messages postMessage du service worker
    // (navigation depuis notificationclick)
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.payload?.path) {
        window.location.href = event.data.payload.path;
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);
}

// ==========================================
// BADGE
// ==========================================
export async function setBadgeCount(count: number): Promise<void> {
  if ('setAppBadge' in navigator) {
    try { await (navigator as any).setAppBadge(count); } catch {}
  }
}

export async function clearBadge(): Promise<void> {
  if ('clearAppBadge' in navigator) {
    try { await (navigator as any).clearAppBadge(); } catch {}
  }
}
