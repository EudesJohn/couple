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
    // Expo Go desactive certaines fonctions
    if (typeof mod.setNotificationHandler !== 'function') {
      notificationChecked = true;
      notificationAvailable = false;
      return null;
    }
    notificationModule = mod;
    notificationAvailable = true;
    notificationChecked = true;
    return notificationModule;
  } catch {
    notificationChecked = true;
    notificationAvailable = false;
    return null;
  }
}

// ==========================================
// INITIALISATION
// ==========================================
export async function setupNotifications(): Promise<void> {
  if (isWeb) return;

  const N = await getMobileNotifications();
  if (!N) return;

  try {
    if (typeof N.setNotificationHandler === 'function') {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  } catch (err) {
    console.warn('⚠️ setNotificationHandler:', err);
  }

  if (Platform.OS === 'android') {
    const channels: Array<{ id: string; config: any }> = [
      {
        id: 'messages',
        config: {
          name: 'Messages',
          description: 'Nouveaux messages de ta partenaire',
          importance: N.AndroidImportance.HIGH,
          vibrationPattern: [0, 100, 50, 100],
          lightColor: '#7C2D12',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        },
      },
      {
        id: 'calls',
        config: {
          name: 'Appels',
          description: 'Appels entrants et notifications',
          importance: N.AndroidImportance.MAX,
          vibrationPattern: [0, 300, 200, 300, 200, 600],
          lightColor: '#CA8A04',
          enableVibrate: true,
          showBadge: true,
        },
      },
      {
        id: 'status',
        config: {
          name: 'Statuts',
          description: 'Messages lus, presence en ligne',
          importance: N.AndroidImportance.LOW,
          vibrationPattern: [0, 50],
          lightColor: '#10B981',
          sound: null,
          enableVibrate: false,
          showBadge: false,
        },
      },
    ];

    for (const ch of channels) {
      try {
        if (typeof N.setNotificationChannelAsync === 'function') {
          await N.setNotificationChannelAsync(ch.id, ch.config);
        }
      } catch (err) {
        console.warn(`⚠️ Channel ${ch.id}:`, err);
      }
    }
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
// PUSH REMOTE (app fermée) — token Expo
// ==========================================
// Enregistre le token Expo du téléphone dans push_subscriptions pour que
// le serveur (webhook Supabase → /api/push/on-*) puisse envoyer une
// notification même quand l'app est complètement fermée.
let lastToken: string | null = null;

export async function registerExpoPushToken(profileId: string): Promise<void> {
  if (isWeb) return;

  const N = await getMobileNotifications();
  if (!N || typeof N.getExpoPushTokenAsync !== 'function') return;

  try {
    const permission = await N.getPermissionsAsync();
    if (permission.status !== 'granted') {
      const req = await N.requestPermissionsAsync();
      if (req.status !== 'granted') return;
    }

    const { data: tokenData } = await N.getExpoPushTokenAsync();
    const token = tokenData;
    if (!token || lastToken === token) return;

    const { supabase } = await import('../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    // Upsert : endpoint = token Expo, clés vides (non utilisées par Expo)
    const { error } = await supabase
      .from('push_subscriptions' as any)
      .upsert(
        {
          profile_id: profileId,
          endpoint: token,
          p256dh_key: '',
          auth_key: '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,endpoint' }
      );

    if (error) {
      console.warn('⚠️ Enregistrement token push:', error.message);
      return;
    }
    lastToken = token;
    console.log('📱 Token push Expo enregistre');
  } catch (err) {
    console.warn('⚠️ registerExpoPushToken:', err);
  }
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
  callType: 'audio' | 'video',
  callId?: string
): Promise<void> {
  if (isWeb) {
    const typeLabel = callType === 'video' ? 'Video' : 'Audio';
    sendWebNotification(`Appel ${typeLabel}`, `${callerName} t'appelle...`, { screen: 'call', callType });
    return;
  }

  const N = await getMobileNotifications();
  if (!N) return;

  const typeLabel = callType === 'video' ? 'Video' : 'Audio';

  // Sonnerie choisie : uniquement les sonneries INTÉGRÉES peuvent servir
  // de son système (ressource native). « default » et musique perso →
  // on ne met rien (le canal Android gère le son par défaut).
  let ringtone: string | undefined;
  try {
    const [{ getStoredRingtone }, { isCustomMusic, DEFAULT_RINGTONE }] = await Promise.all([
      import('../lib/ringtones'),
      import('../lib/ringtones'),
    ]);
    const stored = await getStoredRingtone();
    if (!isCustomMusic(stored) && stored !== DEFAULT_RINGTONE) {
      ringtone = `${stored}.wav`;
    }
  } catch { /* son par défaut */ }

  try {
    lastCallNotificationId = await N.scheduleNotificationAsync({
      content: {
        title: `Appel ${typeLabel}`,
        body: `${callerName} t'appelle...`,
        data: { screen: 'call', callType, callId },
        color: '#CA8A04',
        sound: ringtone || 'default',
        ...(Platform.OS === 'android'
          ? { channelId: 'calls', priority: N.AndroidNotificationPriority.MAX }
          : {}),
        categoryIdentifier: 'call',
        interruptionLevel: 'critical',
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('⚠️ Erreur notification appel entrant:', err);
  }
}

// ID de la dernière notification d'appel entrant (pour la retirer)
let lastCallNotificationId: string | null = null;

/** Retire la notification d'appel entrant (après décrochage/refus). */
export async function clearIncomingCallNotification(): Promise<void> {
  if (isWeb || !lastCallNotificationId) return;
  const N = await getMobileNotifications();
  if (!N) return;
  try {
    await N.dismissNotificationAsync(lastCallNotificationId);
  } catch { /* déjà partie */ }
  lastCallNotificationId = null;
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
      if (isWeb) return;

      try {
        const N = await getMobileNotifications();
        if (!N) return;

        if (typeof N.getLastNotificationResponseAsync === 'function') {
          N.getLastNotificationResponseAsync().then((response: any) => {
            if (response) handleNotificationResponse(response);
          }).catch(() => {});
        }

        if (typeof N.addNotificationResponseReceivedListener === 'function') {
          const sub = N.addNotificationResponseReceivedListener(handleNotificationResponse);
          return () => { sub?.remove(); };
        }
      } catch (err) {
        console.warn('⚠️ Erreur handler notifications:', err);
      }
    })();
  }, []);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleNotificationResponse(response: any) {
  const action = response.actionIdentifier as string | undefined;
  const data = response.notification?.request?.content?.data ?? {};

  // ─── Actions Décrocher / Raccrocher depuis la notification ───
  if (data.screen === 'call' && data.callId) {
    // Import dynamique pour éviter le cycle de dépendances
    import('../lib/callStore').then(({ callStore }) => {
      callStore.ensureInit();
      if (action === 'decline') {
        void callStore.rejectCall();
      } else {
        // Bouton « Decrocher » ou tap sur la notification
        void callStore.answerFromNotification(data.callId);
      }
    }).catch(() => {});
    return;
  }

  if (data?.screen === 'chat') {
    router.push('/chat');
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
