// ============================================================
// Hook — Notifications web (Web Notification API)
// Utilise uniquement l'API Web Notification — pas de dépendance mobile
// ============================================================
import { useEffect, useRef } from 'react';
import { playMessageSound, startRingtone, playCallEndSound } from '../lib/sounds';

// ==========================================
// WEB : Notification API
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
      icon: '/favicon.png',
      badge: '/favicon.png',
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
  // Web: pas de setup spécifique nécessaire
}

// Demander la permission
export async function requestNotificationPermission(): Promise<boolean> {
  return requestWebNotificationPermission();
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
    // Rien à faire ici — le onclick est déjà attaché
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
