// ============================================================
// Bulle media premium — Image ou Video dans le chat
// Design Burgundy & Gold
// ============================================================
import { useEffect, useState } from 'react';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { downloadMedia } from '../../lib/media';
import { PlayIcon, ImageIcon, VideoIcon } from '../Icons';

interface MediaBubbleProps {
  storagePath: string;
  mimeType: string;
  width: number;
  height: number;
  thumbnailPath?: string | null;
  caption?: string | null;
  isOwn: boolean;
  onPress?: () => void;
}

export function MediaBubble({
  storagePath,
  mimeType,
  width: imgWidth,
  height: imgHeight,
  caption,
  isOwn,
  onPress,
}: MediaBubbleProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  // ⚠️ SÉCURITÉ (audit v3) : téléchargement authentifié via token de
  // session — jamais d'URL publique (buckets privés).
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setHasError(false);
    downloadMedia(storagePath)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storagePath]);

  const imageUrl = blobUrl;
  const isVideo = mimeType.startsWith('video/');
  const maxBubbleWidth = 240;
  const aspectRatio = imgWidth / imgHeight;
  const displayWidth = Math.min(maxBubbleWidth, imgWidth);
  const displayHeight = displayWidth / aspectRatio;

  if (hasError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        width: displayWidth, height: 120, gap: spacing.sm,
        backgroundColor: isOwn ? colors.bubbleSelf : colors.bubbleOther,
        borderRadius: borderRadius.lg,
        borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
        borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
      }}>
        {isVideo ? (
          <VideoIcon size={24} color={colors.textTertiary} />
        ) : (
          <ImageIcon size={24} color={colors.textTertiary} />
        )}
        <span style={{ fontSize: 13, color: colors.textTertiary }}>
          Impossible de charger
        </span>
      </div>
    );
  }

  return (
    <div style={{
      overflow: 'hidden',
      borderRadius: borderRadius.lg,
      borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
      borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
    }}>
      <div
        onClick={onPress}
        style={{ position: 'relative', cursor: onPress ? 'pointer' : 'default' }}
      >
        <img
          src={imageUrl ?? undefined}
          alt="Media"
          style={{
            width: displayWidth,
            height: displayHeight,
            objectFit: 'cover',
            display: 'block',
            borderRadius: borderRadius.lg,
          }}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          loading="lazy"
        />

        {/* Overlay vidéo */}
        {isVideo && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: borderRadius.lg,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.9)',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
            }}>
              <PlayIcon size={22} color={colors.primary} />
            </div>
          </div>
        )}

        {/* Loading shimmer */}
        {!isLoaded && (
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: displayWidth, height: displayHeight,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backgroundColor: colors.surfaceAlt,
            borderRadius: borderRadius.lg,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12,
              border: `2px solid ${colors.borderLight}`,
              borderTopColor: colors.primary,
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        )}
      </div>

      {/* Caption */}
      {caption && (
        <div style={{
          padding: `${spacing.sm}px ${spacing.md}px`,
          backgroundColor: isOwn ? colors.bubbleSelf : colors.bubbleOther,
          borderBottomLeftRadius: borderRadius.lg,
          borderBottomRightRadius: borderRadius.lg,
        }}>
          <span style={{
            fontSize: 16,
            color: isOwn ? colors.bubbleSelfText : colors.text,
          }}>
            {caption}
          </span>
        </div>
      )}
    </div>
  );
}
