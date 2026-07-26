// ============================================================
// Affiche une image stockée dans Supabase Storage
// Utilise downloadMedia() au lieu de getPublicUrl() pour
// fonctionner même si le bucket n'est pas public.
// ============================================================
import { useEffect, useState, useRef } from 'react';
import { downloadMedia } from '../../lib/media';
import { colors } from '../../constants/theme';

interface StorageImageProps {
  storagePath: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  /** Appelé quand l'utilisateur clique sur l'image (ouvrir lightbox) */
  onClick?: () => void;
}

export function StorageImage({ storagePath, alt = '', style, className, onClick }: StorageImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    downloadMedia(storagePath)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Erreur chargement image:', err);
        setError(true);
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [storagePath]);

  if (error) {
    return (
      <div style={{
        width: 240, height: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        color: colors.textTertiary,
        fontSize: 13,
        ...style,
      }}>
        Image non disponible
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div style={{
        width: 240, height: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        ...style,
      }}>
        <div style={{
          width: 24, height: 24,
          border: `2px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      className={className}
      loading="lazy"
      onClick={onClick}
    />
  );
}
