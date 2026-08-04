import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ============================================================
// Enregistrement du Service Worker (sw.ts → /sw.js au build).
// SANS cet enregistrement, les notifications push ne peuvent pas
// arriver quand l'app PWA est fermée : registerPushSubscription()
// échoue (aucune registration), donc aucune subscription n'est
// enregistrée côté serveur, et le serveur n'a rien à qui envoyer.
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Erreur enregistrement service worker:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
