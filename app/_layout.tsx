// ============================================================
// Layout racine — AuthProvider + GestureHandler + Routes
// ============================================================
import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/hooks/useAuth';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: '#FAF6F9' },
            }}
          >
            {/* 🔐 Auth */}
            <Stack.Screen name="index" />
            <Stack.Screen
              name="setup-pin"
              options={{ animation: 'fade', gestureEnabled: false }}
            />

            {/* 💬 Chat */}
            <Stack.Screen
              name="chat"
              options={{ animation: 'fade' }}
            />

            {/* 📞 Appels */}
            <Stack.Screen
              name="call/index"
              options={{
                animation: 'slide_from_bottom',
                gestureEnabled: false,
                presentation: 'fullScreenModal',
              }}
            />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
