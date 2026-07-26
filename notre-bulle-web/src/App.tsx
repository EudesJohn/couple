import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import LockScreen from './pages/LockScreen';
import ChatLayout from './pages/ChatLayout';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import CallScreen from './pages/CallScreen';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LockScreen />} />
            <Route path="/chat" element={<ChatLayout />}>
              <Route index element={<Chat />} />
            </Route>
            <Route path="/settings" element={<Settings />} />
            <Route path="/call" element={<CallScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
