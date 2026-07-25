// ============================================================
// Hook — Notifications
// Mobile : expo-notifications (natif)
// Web : Web Notification API
// ============================================================
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

const isWeb = Platform.OS === 'web';

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

function sendWebNotification(title: string, body: string, data?: Record<string, any>) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

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
        router.push('/chat');
      } else if (data?.screen === 'call') {
        window.focus();
      }
      notif.close();
    };

    // Auto close after 5s
    setTimeout(() => notif.close(), 5000);
  } catch (err) {
    console.warn('Web notification error:', err);
  }
}

// ==========================================
// MOBILE : expo-notifications (import dynamique)
// ==========================================
type NotificationsModule = typeof import('expo-notifications');

let notificationModule: NotificationsModule | null = null;
let notificationChecked = false;
let notificationAvailable = false;

async function getMobileNotifications(): Promise<NotificationsModule | null> {
  if (notificationChecked) return notificationAvailable ? notificationModule : null;

  try {
    const mod = await import('expo-notifications');
    notificationModule = mod;
    notificationAvailable = true;
    notificationChecked = true;
    return notificationModule;
  } catch (err) {
    console.warn('⚠️ expo-notifications indisponible:', err);
    notificationChecked = true;
    notificationAvailable = false;
    return null;
  }
}

// ==========================================
// INITIALISATION
// ==========================================
export async function setupNotifications(): Promise<void> {
  if (isWeb) return; // Web: pas de setup nécessaire

  const N = await getMobileNotifications();
  if (!N) return;

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('messages', {
      name: 'Messages',
      description: 'Nouveaux messages de ta partenaire',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 50, 100],
      lightColor: '#7C2D12',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    await N.setNotificationChannelAsync('calls', {
      name: 'Appels',
      description: 'Appels entrants et notifications',
      importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300, 200, 600],
      lightColor: '#CA8A04',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    await N.setNotificationChannelAsync('status', {
      name: 'Statuts',
      description: 'Messages lus, presence en ligne',
      importance: N.AndroidImportance.LOW,
      vibrationPattern: [0, 50],
      lightColor: '#10B981',
      sound: null,
      enableVibrate: false,
      showBadge: false,
    });
  }
}

// Demander la permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (isWeb) return requestWebNotificationPermission();

  const N = await getMobileNotifications();
  if (!N) return false;
  const { status } = await N.requestPermissionsAsync();
  return status === 'granted';
}

// ==========================================
// AFFICHAGE DES NOTIFICATIONS
// ==========================================
export async function notifyNewMessage(
  senderName: string,
  content: string | null,
  conversationId: string
): Promise<void> {
  if (isWeb) {
    const body = content ?? 'Photo ou media reçu';
    sendWebNotification(senderName, body, { screen: 'chat', conversationId });
    return;
  }

  const N = await getMobileNotifications();
  if (!N) return;

  const body = content ?? 'Photo ou media recu';

  await N.scheduleNotificationAsync({
    content: {
      title: senderName,
      body,
      data: { screen: 'chat', conversationId },
      color: '#7C2D12',
      badge: 1,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'messages' } : {}),
      categoryIdentifier: 'message',
    },
    trigger: null,
  });
}

export async function notifyIncomingCall(
  callerName: string,
  callType: 'audio' | 'video'
): Promise<void> {
  if (isWeb) {
    const typeLabel = callType === 'video' ? 'Video' : 'Audio';
    sendWebNotification(`Appel ${typeLabel}`, `${callerName} t'appelle...`, { screen: 'call', callType });
    return;
  }

  const N = await getMobileNotifications();
  if (!N) return;

  const typeLabel = callType === 'video' ? 'Video' : 'Audio';

  await N.scheduleNotificationAsync({
    content: {
      title: `Appel ${typeLabel}`,
      body: `${callerName} t'appelle...`,
      data: { screen: 'call', callType },
      color: '#CA8A04',
      sound: 'default',
      ...(Platform.OS === 'android'
        ? { channelId: 'calls', priority: N.AndroidNotificationPriority.MAX }
        : {}),
      categoryIdentifier: 'call',
      interruptionLevel: 'critical',
    },
    trigger: null,
  });
}

export async function notifyStatusChange(
  senderName: string,
  status: 'delivered' | 'read'
): Promise<void> {
  const label = status === 'read' ? 'a lu ton message' : 'message distribue';

  if (isWeb) {
    sendWebNotification(senderName, label, { screen: 'chat' });
    return;
  }

  const N = await getMobileNotifications();
  if (!N) return;

  await N.scheduleNotificationAsync({
    content: {
      title: senderName,
      body: label,
      data: { screen: 'chat' },
      color: '#10B981',
      ...(Platform.OS === 'android' ? { channelId: 'status' } : {}),
    },
    trigger: null,
  });
}

// ==========================================
// GESTION DES CLICS SUR NOTIFICATION
// ==========================================
export function useNotificationHandler() {
  const handlerCalled = useRef(false);

  useEffect(() => {
    if (handlerCalled.current) return;
    handlerCalled.current = true;

    (async () => {
      if (isWeb) return; // Les clics sont gérés dans sendWebNotification

      try {
        const N = await getMobileNotifications();
        if (!N) return;

        N.getLastNotificationResponseAsync().then((response: any) => {
          if (response) handleNotificationResponse(response);
        }).catch(() => {});

        const sub = N.addNotificationResponseReceivedListener(handleNotificationResponse);
        return () => { sub?.remove(); };
      } catch (err) {
        console.warn('⚠️ Erreur handler notifications:', err);
      }
    })();
  }, []);
}

function handleNotificationResponse(response: any) {
  const data = response.notification.request.content.data;
  if (data?.screen === 'chat') {
    router.push('/chat');
  } else if (data?.screen === 'call') {
    if (router.canGoBack()) router.back();
  }
}

// ==========================================
// BADGE
// ==========================================
export async function setBadgeCount(count: number): Promise<void> {
  if (isWeb) {
    // Web: favicon badge or just noop
    if ('setAppBadge' in navigator) {
      try { await (navigator as any).setAppBadge(count); } catch {}
    }
    return;
  }
  const N = await getMobileNotifications();
  if (!N) return;
  await N.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  if (isWeb) {
    if ('clearAppBadge' in navigator) {
      try { await (navigator as any).clearAppBadge(); } catch {}
    }
    return;
  }
  const N = await getMobileNotifications();
  if (!N) return;
  await N.setBadgeCountAsync(0);
}

// ==========================================
// ACTIONS SUR LES NOTIFICATIONS (Android)
// ==========================================
export function setupNotificationCategories(): void {
  if (isWeb) return;

  (async () => {
    try {
      const N = await getMobileNotifications();
      if (!N) return;

      await N.setNotificationCategoryAsync('message', [
        {
          identifier: 'open',
          buttonTitle: 'Ouvrir le chat',
          options: { opensAppToForeground: true },
        },
      ]);

      await N.setNotificationCategoryAsync('call', [
        {
          identifier: 'answer',
          buttonTitle: 'Decrocher',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'decline',
          buttonTitle: 'Ignorer',
          options: { opensAppToForeground: false },
        },
      ]);
    } catch (err) {
      console.warn('⚠️ Erreur setup categories notifications:', err);
    }
  })();
}
