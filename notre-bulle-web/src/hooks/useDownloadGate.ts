// ============================================================
// Hook — Téléchargement à la demande d'un média (style WhatsApp)
// ------------------------------------------------------------------
// Les photos / notes vocales / vidéos sont verrouillées derrière un
// bouton "Télécharger" : le contenu n'est chargé que quand l'utilisateur
// le demande explicitement (réseau économique, comme WhatsApp).
//
// - requireDownload = true  → blobUrl reste null tant que l'utilisateur
//   n'a pas tapé le bouton (startDownload()).
// - requireDownload = false → téléchargement automatique au montage
//   (comportement historique, utilisé hors chat).
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadMedia } from '../lib/media';

export function useDownloadGate(storagePath: string, requireDownload = false) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const startDownload = useCallback(async () => {
    if (blobUrlRef.current) return; // déjà téléchargé
    setDownloading(true);
    setError(false);
    try {
      const blob = await downloadMedia(storagePath);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setBlobUrl(url);
    } catch (err) {
      console.error('Erreur téléchargement média:', err);
      setError(true);
    } finally {
      setDownloading(false);
    }
  }, [storagePath]);

  // Téléchargement auto si le média n'est pas verrouillé
  useEffect(() => {
    if (requireDownload) return;
    startDownload();
  }, [requireDownload, startDownload]);

  // Nettoyer les blob URLs au démontage
  useEffect(() => {
    const ref = blobUrlRef;
    return () => {
      if (ref.current) {
        URL.revokeObjectURL(ref.current);
        ref.current = null;
      }
    };
  }, []);

  return { blobUrl, downloading, error, startDownload };
}
