// ============================================================
// Galerie partagée — toutes les photos & vidéos de la discussion
// Design Burgundy & Gold, Framer Motion
// - Grille responsive, groupée par mois
// - Filtre : Tout / Photos / Vidéos
// - Tap = lightbox plein écran (réutilise MediaLightbox)
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { downloadMedia } from '../lib/media';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { MediaLightbox } from '../components/media/MediaLightbox';
import { ImageIcon, PlayIcon, HeartFilledIcon } from '../components/Icons';
import type { MessageWithDetails, Attachment } from '../types/database';

type Filter = 'all' | 'photos' | 'videos';

// ==========================================
// FORMATAGE
// ==========================================
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7); // yyyy-mm
}

// ==========================================
// TUYAUX
// ==========================================
interface MediaItem {
  id: string;
  type: 'image' | 'video';
  mimeType: string;
  storagePath: string;
  thumbnailPath: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

function extractMediaItems(messages: MessageWithDetails[]): MediaItem[] {
  const items: MediaItem[] = [];
  for (const msg of messages) {
    const isImage = msg.type === 'image';
    const isVideo = msg.type === 'video';
    if (!isImage && !isVideo) continue;
    const att = msg.attachments?.[0];
    if (!att) continue;
    items.push({
      id: msg.id,
      type: isImage ? 'image' : 'video',
      mimeType: att.mime_type || (isImage ? 'image/jpeg' : 'video/mp4'),
      storagePath: att.storage_path,
      thumbnailPath: att.thumbnail_path ?? null,
      width: att.width ?? null,
      height: att.height ?? null,
      createdAt: msg.created_at,
    });
  }
  return items;
}

// ==========================================
// TUYAU DE GRILLE
// ==========================================
function GridTile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Charger le blob via downloadMedia (même approche que le chat)
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setFailed(false);
    setSrc(null);
    downloadMedia(item.thumbnailPath || item.storagePath)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.storagePath, item.thumbnailPath]);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      whileTap={{ scale: 0.96 }}
      onClick={onOpen}
      aria-label={item.type === 'video' ? 'Ouvrir la vidéo' : 'Ouvrir la photo'}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        borderRadius: borderRadius.md,
        overflow: 'hidden',
        backgroundColor: colors.surfaceAlt2,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : failed ? (
        <ImageIcon size={22} color={colors.textTertiary} />
      ) : (
        <div style={{
          width: 20, height: 20,
          border: `2px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      )}

      {/* Badge vidéo */}
      {item.type === 'video' && src && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.25)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: 'rgba(255,255,255,0.92)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
          }}>
            <PlayIcon size={16} color={colors.primary} />
          </div>
        </div>
      )}
    </motion.button>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function GalleryScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lightbox
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const loadGallery = useCallback(async () => {
    setError(null);
    try {
      // 1. Trouver la conversation (même logique que useMessages)
      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .limit(1)
        .single();
      if (!convData?.id) { setItems([]); return; }

      // 2. Messages image/vidéo avec leurs pièces jointes
      const { data, error: msgError } = await supabase
        .from('messages')
        .select(`
          *,
          attachments(*)
        `)
        .eq('conversation_id', convData.id)
        .in('type', ['image', 'video'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (msgError) throw msgError;
      setItems(extractMediaItems((data as unknown as MessageWithDetails[]) ?? []));
    } catch (err: any) {
      console.warn('Erreur chargement galerie:', err?.message);
      setError(err?.message || 'Impossible de charger la galerie');
      setItems([]);
    }
  }, []);

  useEffect(() => { loadGallery(); }, [loadGallery]);

  // Charger le blob pour la lightbox (même approche que le chat)
  useEffect(() => {
    if (!lightbox) { setLightboxSrc(null); return; }
    let cancelled = false;
    let url: string | null = null;
    downloadMedia(lightbox.storagePath)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setLightboxSrc(url);
      })
      .catch(() => { if (!cancelled) setLightboxSrc(null); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [lightbox]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (filter === 'photos') return items.filter((i) => i.type === 'image');
    if (filter === 'videos') return items.filter((i) => i.type === 'video');
    return items;
  }, [items, filter]);

  // Groupement par mois (du plus récent au plus ancien)
  const groups = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of filtered) {
      const key = item.createdAt.slice(0, 7);
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries()).map(([month, monthItems]) => ({
      label: monthLabel(month + '-01T12:00:00'),
      items: monthItems,
    }));
  }, [filtered]);

  const counts = useMemo(() => {
    if (!items) return { photos: 0, videos: 0 };
    return {
      photos: items.filter((i) => i.type === 'image').length,
      videos: items.filter((i) => i.type === 'video').length,
    };
  }, [items]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: `Tout (${items?.length ?? 0})` },
    { key: 'photos', label: `Photos (${counts.photos})` },
    { key: 'videos', label: `Vidéos (${counts.videos})` },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: colors.background,
    }}>
      <ScreenHeader
        title="Nos souvenirs"
        subtitle={items && items.length > 0 ? `${items.length} photo${items.length > 1 ? 's' : ''} et vidéo${items.length > 1 ? 's' : ''}` : undefined}
        onBack={() => navigate('/chat')}
      />

      {/* Filtres */}
      {items && items.length > 0 && (
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          padding: `${spacing.md}px ${spacing.lg}px`,
          backgroundColor: colors.surface,
          borderBottom: `1px solid ${colors.borderLight}`,
          flexShrink: 0,
        }}>
          {FILTERS.map((f) => (
            <motion.button
              key={f.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilter(f.key)}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                borderRadius: borderRadius.pill,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: filter === f.key ? colors.primary : colors.surfaceAlt,
                color: filter === f.key ? '#FAFAF9' : colors.textSecondary,
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              {f.label}
            </motion.button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items === null ? (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: spacing.huge, gap: spacing.md,
          }}>
            <div style={{
              width: 22, height: 22,
              border: `2px solid ${colors.border}`,
              borderTopColor: colors.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: 14, color: colors.textTertiary }}>
              Chargement de la galerie…
            </span>
          </div>
        ) : error ? (
          <EmptyState
            icon={ImageIcon}
            title="Impossible de charger"
            subtitle={error}
            actionLabel="Réessayer"
            onAction={loadGallery}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={items.length === 0 ? ImageIcon : HeartFilledIcon}
            title={items.length === 0 ? 'Aucun souvenir pour l\'instant' : 'Aucun résultat'}
            subtitle={
              items.length === 0
                ? 'Partagez vos premières photos et vidéos dans la discussion — elles apparaîtront ici.'
                : 'Essaie un autre filtre.'
            }
            actionLabel={items.length === 0 ? 'Retour à la discussion' : undefined}
            onAction={items.length === 0 ? () => navigate('/chat') : undefined}
          />
        ) : (
          <AnimatePresence>
            {groups.map((group, gi) => (
              <motion.div
                key={group.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: gi * 0.04 }}
                style={{ marginBottom: spacing.xl }}
              >
                {/* Séparateur de mois */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: `${spacing.lg}px ${spacing.xl}px ${spacing.md}px`,
                  gap: spacing.md,
                }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: colors.borderLight }} />
                  <span style={{
                    fontSize: 12,
                    color: colors.textTertiary,
                    textTransform: 'capitalize',
                    fontWeight: 500,
                  }}>
                    {group.label}
                  </span>
                  <div style={{ flex: 1, height: 1, backgroundColor: colors.borderLight }} />
                </div>

                {/* Grille */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: 4,
                  padding: `0 ${spacing.lg}px`,
                }}>
                  {group.items.map((item) => (
                    <GridTile
                      key={item.id}
                      item={item}
                      onOpen={() => setLightbox(item)}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Lightbox plein écran */}
      <MediaLightbox
        open={!!lightbox && !!lightboxSrc}
        src={lightboxSrc}
        type={lightbox?.type ?? 'image'}
        mimeType={lightbox?.mimeType}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
