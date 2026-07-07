// ============================================================
// Hook — Notifications ultra stylées
// Canaux : messages, appels, statuts
// ATTENTION : imports dynamiques pour éviter le crash Expo Go
// (expo-notifications n'est plus supporté dans Expo Go SDK 53+)
// ============================================================
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

// Type local pour éviter l'import statique
type NotificationsModule = typeof import('expo-notifications');

// ==========================================
// HELPER — Import lazy de expo-notifications
// Piège : même en import dynamique, Metro charge le module dans son
// registre, ce qui exécute ses side effects (auto push registration).
// Dans Expo Go, ça jette une erreur fatale. On détecte Expo Go
// AVANT via expo-constants pour ne JAMAIS charger le module.
// ==========================================
let notificationModule: NotificationsModule | null = null;
let notificationChecked = false;
let notificationAvailable = false;

async function checkExpoGo(): Promise<boolean> {
  try {
    const Constants = await import('expo-constants');
    return Constants.default?.executionEnvironment === 'storeClient';
  } catch {
    return false;
  }
}

async function getNotifications(): Promise<NotificationsModule | null> {
  // Si déjà déterminé
  if (notificationChecked) {
    return notificationAvailable ? notificationModule : null;
  }

  // Vérifier si on est dans Expo Go
  const isExpoGo = await checkExpoGo();
  if (isExpoGo) {
    console.warn('⚠️ Notifications désactivées (Expo Go)');
    notificationChecked = true;
    notificationAvailable = false;
    return null;
  }

  // Tentative d'import du module natif
  try {
    const mod = await import('expo-notifications');
    notificationModule = mod;
    notificationAvailable = true;
    notificationChecked = true;
    return notificationModule;
  } catch (err) {
    console.warn('⚠️ expo-notifications indisponible :', err);
    notificationChecked = true;
    notificationAvailable = false;
    return null;
  }
}

// ==========================================
// INITIALISATION
// ==========================================
export async function setupNotifications(): Promise<void> {
  const N = await getNotifications();
  if (!N) return;

  // Configurer le handler d'affichage
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
    // Canal Messages
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

    // Canal Appels
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

    // Canal Statuts
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
  const N = await getNotifications();
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
  const N = await getNotifications();
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
  const N = await getNotifications();
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
  const N = await getNotifications();
  if (!N) return;

  const label = status === 'read' ? 'a lu ton message' : 'message distribue';

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
  const responseRef = useRef<{ remove: () => void } | null>(null);
  const handlerCalled = useRef(false);

  useEffect(() => {
    if (handlerCalled.current) return;
    handlerCalled.current = true;

    (async () => {
      try {
        const N = await getNotifications();
        if (!N) return;

        // Si l'app est ouverte via une notification
        N.getLastNotificationResponseAsync().then((response) => {
          if (response) {
            handleNotificationResponse(response);
          }
        }).catch(() => {
          // ignore
        });

        // Écouter les clics
        const sub = N.addNotificationResponseReceivedListener(
          handleNotificationResponse
        );
        responseRef.current = sub;
      } catch (err) {
        console.warn('⚠️ Erreur handler notifications:', err);
      }
    })();

    return () => {
      responseRef.current?.remove();
    };
  }, []);
}

function handleNotificationResponse(response: any) {
  const data = response.notification.request.content.data;

  if (data?.screen === 'chat') {
    router.push('/chat');
  } else if (data?.screen === 'call') {
    if (router.canGoBack()) {
      router.back();
    }
  }
}

// ==========================================
// BADGE
// ==========================================
export async function setBadgeCount(count: number): Promise<void> {
  const N = await getNotifications();
  if (!N) return;
  await N.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  const N = await getNotifications();
  if (!N) return;
  await N.setBadgeCountAsync(0);
}

// ==========================================
// ACTIONS SUR LES NOTIFICATIONS (Android)
// ==========================================
export function setupNotificationCategories(): void {
  (async () => {
    try {
      const N = await getNotifications();
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
