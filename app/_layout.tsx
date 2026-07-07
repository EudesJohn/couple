// ============================================================
// Layout racine — AuthProvider + GestureHandler + Routes
// Initialisation DB SQLite + Notifications au démarrage
// ============================================================
import '../global.css';
import { useEffect } from 'react';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/hooks/useAuth';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { initDatabase } from '../src/lib/localdb';
import {
  setupNotifications,
  requestNotificationPermission,
  useNotificationHandler,
  setupNotificationCategories,
} from '../src/hooks/useNotifications';

function AppInitializer({ children }: { children: React.ReactNode }) {
  // Initialiser la DB SQLite au démarrage
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        console.log('✅ Base locale initialisée');
      } catch (err) {
        console.warn('⚠️ Erreur init DB locale:', err);
      }
    })();
  }, []);

  return <>{children}</>;
}

function NotificationInitializer({ children }: { children: React.ReactNode }) {
  // Config notifications au premier plan
  useNotificationHandler();

  useEffect(() => {
    (async () => {
      try {
        await setupNotifications();
        setupNotificationCategories();
        const granted = await requestNotificationPermission();
        if (granted) {
          console.log('✅ Notifications autorisées');
        }
      } catch (err) {
        console.warn('⚠️ Erreur setup notifications:', err);
      }
    })();
  }, []);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppInitializer>
          <NotificationInitializer>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: '#FAF6F9' },
            }}
          >
            {/* Auth */}
            <Stack.Screen name="index" />
            <Stack.Screen
              name="setup-pin"
              options={{ animation: 'fade', gestureEnabled: false }}
            />

            {/* Chat */}
            <Stack.Screen
              name="chat"
              options={{ animation: 'fade' }}
            />

            {/* Parametres */}
            <Stack.Screen
              name="settings"
              options={{ animation: 'slide_from_right' }}
            />

            {/* Appels */}
            <Stack.Screen
              name="call/index"
              options={{
                animation: 'slide_from_bottom',
                gestureEnabled: false,
                presentation: 'fullScreenModal',
              }}
            />
          </Stack>
          </NotificationInitializer>
          </AppInitializer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
