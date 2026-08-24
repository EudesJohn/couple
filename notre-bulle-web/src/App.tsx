import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import LockScreen from './pages/LockScreen';
import ChatLayout from './pages/ChatLayout';
import Chat from './pages/Chat';
import CycleCalendar from './pages/CycleCalendar';
import Settings from './pages/Settings';
import CallScreen from './pages/CallScreen';
import CallHistory from './pages/CallHistory';
import Gallery from './pages/Gallery';
import CallOverlay from './components/call/CallOverlay';
import { PresenceHeartbeat } from './components/PresenceHeartbeat';
import { colors } from './constants/theme';

function LoadingSplash() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    }}>
      <span style={{ fontSize: 16, color: colors.textTertiary, fontStyle: 'italic' }}>
        Notre Bulle…
      </span>
    </div>
  );
}

/**
 * Garde de route : seule l'application déverrouillée (« unlocked »)
 * donne accès aux écrans protégés. Sinon, redirection vers `/`
 * (verrouillage / onboarding). Empêche l'accès direct à /chat,
 * /cycle, /settings, /call sans authentification.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingSplash />;
  if (status !== 'unlocked') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Route racine : l'app ouverte redirige vers /chat, sinon l'écran de verrouillage. */
function RootRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingSplash />;
  if (status === 'unlocked') return <Navigate to="/chat" replace />;
  return <LockScreen />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PresenceHeartbeat />
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route
              path="/chat"
              element={
                <RequireAuth>
                  <ChatLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Chat />} />
            </Route>
            <Route
              path="/cycle"
              element={
                <RequireAuth>
                  <CycleCalendar />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <Settings />
                </RequireAuth>
              }
            />
            <Route
              path="/calls"
              element={
                <RequireAuth>
                  <CallHistory />
                </RequireAuth>
              }
            />
            <Route
              path="/gallery"
              element={
                <RequireAuth>
                  <Gallery />
                </RequireAuth>
              }
            />
            <Route
              path="/call"
              element={
                <RequireAuth>
                  <CallScreen />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <CallOverlay />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
