// ============================================================
// Bulle vidéo — téléchargement via downloadMedia() + lecteur
// Design premium avec overlay Play / progression / plein écran
// Aperçu (poster) : première image extraite via Canvas
//
// Verrouillage WhatsApp : si requireDownload est vrai, la vidéo
// reste derrière un bouton "Télécharger" jusqu'au tap.
// ============================================================
import { useState, useRef, useCallback } from 'react';
import { useDownloadGate } from '../../hooks/useDownloadGate';
import { DownloadPlaceholder } from './DownloadPlaceholder';
import { colors } from '../../constants/theme';
import { PlayIcon, PauseIcon, VolumeIcon } from '../Icons';

interface VideoBubbleProps {
  storagePath: string;
  mimeType: string;
  style?: React.CSSProperties;
  className?: string;
  /** Appelé quand l'utilisateur veut voir la vidéo en plein écran */
  onExpand?: (blobUrl: string, mimeType: string) => void;
  /** Bloque la lecture derrière un bouton Télécharger (style WhatsApp) */
  requireDownload?: boolean;
}

export function VideoBubble({ storagePath, mimeType, style, className, onExpand, requireDownload }: VideoBubbleProps) {
  const { blobUrl, downloading, error, startDownload } = useDownloadGate(storagePath, !!requireDownload);

  const [playing, setPlaying] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterUrlRef = useRef<string | null>(null);
  const posterCaptured = useRef(false);

  const w = typeof style?.width === 'number' ? style.width : 240;
  const h = typeof style?.height === 'number' ? style.height : 200;

  // Verrouillé : bouton de téléchargement (style WhatsApp)
  if (requireDownload && !blobUrl) {
    return (
      <DownloadPlaceholder
        label="Télécharger la vidéo"
        downloading={downloading}
        error={error}
        width={w}
        height={h}
        onDownload={startDownload}
      />
    );
  }

  // Capturer la première image comme poster (aperçu)
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 1 || posterCaptured.current) return;
    video.currentTime = 0.05; // seek vers la première image clé
  }, []);

  const handleSeeked = useCallback(() => {
    const video = videoRef.current;
    if (!video || posterCaptured.current) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        // Nettoyer l'ancien poster si existant
        if (posterUrlRef.current) {
          URL.revokeObjectURL(posterUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        posterUrlRef.current = url;
        posterCaptured.current = true;
        setPosterUrl(url);
      }, 'image/jpeg', 0.7);
    } catch {
      // Silencieux — le poster est optionnel
    }
  }, []);

  const handlePlayPause = () => {
    if (!videoRef.current || !blobUrl) return;
    if (videoRef.current.paused) {
      setPlaybackLoading(true);
      videoRef.current.play().catch(() => setPlaybackLoading(false));
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const handleExpand = () => {
    if (blobUrl && onExpand) {
      onExpand(blobUrl, mimeType);
    }
  };

  // État d'erreur
  if (error) {
    return (
      <div style={{
        width: w, height: h,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        color: colors.textTertiary,
        fontSize: 13,
        ...style,
      }}>
        Vidéo non disponible
      </div>
    );
  }

  // État de chargement
  if (!blobUrl) {
    return (
      <div style={{
        width: w, height: h,
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
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        overflow: 'hidden',
        cursor: 'pointer',
        ...style,
      }}
      className={className}
    >
      {/* Poster (première image) affiché derrière la vidéo */}
      {posterUrl && !playing && (
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${posterUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 0,
          }}
        />
      )}

      <video
        ref={videoRef}
        src={blobUrl}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
        onEnded={() => setPlaying(false)}
        onPlay={() => { setPlaying(true); setPlaybackLoading(false); }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setPlaybackLoading(true)}
        onCanPlay={() => setPlaybackLoading(false)}
        onPlaying={() => setPlaybackLoading(false)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Overlay lecture/pause au centre */}
      <div
        onClick={handlePlayPause}
        style={{
          position: 'absolute', inset: 0,
          zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: playing ? 'transparent' : 'rgba(0,0,0,0.08)',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 44, height: 44,
          borderRadius: 22,
          backgroundColor: (playing && !playbackLoading) ? 'transparent' : 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: (playing && !playbackLoading) ? undefined : 'blur(2px)',
        }}>
          {playbackLoading ? (
            <div style={{
              width: 18, height: 18,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#FAFAF9',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          ) : playing ? (
            <PauseIcon size={18} color="#FAFAF9" />
          ) : (
            <PlayIcon size={18} color="#FAFAF9" />
          )}
        </div>
      </div>

      {/* Bouton plein écran (en haut à droite) */}
      <button
        onClick={handleExpand}
        title="Voir en plein écran"
        style={{
          position: 'absolute', top: 6, right: 6,
          zIndex: 3,
          width: 28, height: 28, borderRadius: 14,
          border: 'none', cursor: 'pointer',
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FAFAF9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>

      {/* Barre de contrôles en bas */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        zIndex: 2,
        padding: '4px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <VolumeIcon size={12} color="rgba(255,255,255,0.7)" />
        <div style={{
          flex: 1, height: 3,
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: 1.5,
          overflow: 'hidden',
        }}>
          <div style={{
            width: '0%',
            height: '100%',
            backgroundColor: '#FAFAF9',
            borderRadius: 1.5,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>
    </div>
  );
}
