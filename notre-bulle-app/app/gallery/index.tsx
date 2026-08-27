// ============================================================
// 🖼 Galerie partagée — toutes les photos & vidéos de la discussion
// Portage mobile de notre-bulle-web/src/pages/Gallery.tsx
// - Grille 3 colonnes, groupée par mois
// - Filtre : Tout / Photos / Vidéos
// - Tap = lightbox plein écran (image ou vidéo)
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, Image as RNImage, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, spacing, borderRadius } from '../../src/constants/theme';
import { supabase } from '../../src/lib/supabase';
import { useMediaUrl, getSignedMediaUrl } from '../../src/lib/media';
import {
  ImageIcon, PlayIcon, HeartFilledIcon, BackIcon, CloseIcon,
} from '../../src/components/Icons';
import type { MessageWithDetails } from '../../src/types/database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TILE_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - 8) / 3;

type Filter = 'all' | 'photos' | 'videos';

// ==========================================
// FORMATAGE
// ==========================================
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// ==========================================
// TYPES
// ==========================================
interface MediaItem {
  id: string;
  type: 'image' | 'video';
  mimeType: string;
  storagePath: string;
  thumbnailPath: string | null;
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
      createdAt: msg.created_at,
    });
  }
  return items;
}

// ==========================================
// TUILE DE GRILLE
// ==========================================
function GridTile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = useMediaUrl(item.thumbnailPath || item.storagePath);

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.85}
      aria-label={item.type === 'video' ? 'Ouvrir la vidéo' : 'Ouvrir la photo'}
      style={styles.tile}
    >
      {failed ? (
        <ImageIcon size={22} color={colors.textTertiary} />
      ) : (
        <RNImage
          source={{ uri: src ?? undefined }}
          style={styles.tileImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}

      {/* Badge vidéo */}
      {item.type === 'video' && !failed && (
        <View style={styles.videoBadgeOverlay}>
          <View style={styles.videoBadgeCircle}>
            <PlayIcon size={16} color={colors.primary} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ==========================================
// LIGHTBOX PLEIN ÉCRAN
// ==========================================
function Lightbox({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  // Le lecteur doit être créé inconditionnellement (règle des hooks)
  const mediaUrl = useMediaUrl(item?.storagePath);
  const player = useVideoPlayer(
    mediaUrl ? { uri: mediaUrl } : null,
    (p) => {
      p.loop = false;
    }
  );

  // Lecture automatique quand un média s'ouvre
  useEffect(() => {
    if (item && item.type === 'video') {
      player.play();
    }
  }, [item?.id]);

  if (!item || !mediaUrl) return null;
  const url = mediaUrl;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightbox}>
        <SafeAreaView edges={['top']} style={styles.lightboxHeaderWrap}>
          <View style={styles.lightboxHeader}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
              {new Date(item.createdAt).toLocaleString('fr-FR', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.lightboxCloseBtn}>
              <CloseIcon size={22} color="#FAFAF9" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <View style={styles.lightboxContent}>
          {item.type === 'image' ? (
            <RNImage
              source={{ uri: url }}
              style={styles.lightboxMedia}
              resizeMode="contain"
            />
          ) : (
            <VideoView
              style={styles.lightboxMedia}
              player={player}
              contentFit="contain"
              nativeControls
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function GalleryScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lightbox
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);

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
        .select('*, attachments(*)')
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
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <BackIcon size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.headerTitle}>Nos souvenirs</Text>
            {items && items.length > 0 && (
              <Text style={styles.headerSubtitle}>
                {items.length} photo{items.length > 1 ? 's' : ''} et vidéo{items.length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <View style={{ width: 38 }} />
        </View>
      </SafeAreaView>

      {/* Filtres */}
      {items && items.length > 0 && (
        <View style={styles.filtersRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.85}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === f.key ? colors.primary : colors.surfaceAlt,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: filter === f.key ? '#FAFAF9' : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Contenu */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        {items === null ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Chargement de la galerie…</Text>
          </View>
        ) : error ? (
          <EmptyState
            icon={<ImageIcon size={40} color={colors.textTertiary} />}
            title="Impossible de charger"
            subtitle={error}
            actionLabel="Réessayer"
            onAction={loadGallery}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={items.length === 0
              ? <ImageIcon size={40} color={colors.textTertiary} />
              : <HeartFilledIcon size={40} color={colors.accent} />}
            title={items.length === 0 ? "Aucun souvenir pour l'instant" : 'Aucun résultat'}
            subtitle={
              items.length === 0
                ? 'Partagez vos premières photos et vidéos dans la discussion — elles apparaîtront ici.'
                : 'Essaie un autre filtre.'
            }
            actionLabel={items.length === 0 ? 'Retour à la discussion' : undefined}
            onAction={items.length === 0 ? () => router.back() : undefined}
          />
        ) : (
          groups.map((group) => (
            <View key={group.label} style={{ marginBottom: spacing.xl }}>
              {/* Séparateur de mois */}
              <View style={styles.monthSeparator}>
                <View style={styles.monthSeparatorLine} />
                <Text style={styles.monthSeparatorText}>{group.label}</Text>
                <View style={styles.monthSeparatorLine} />
              </View>

              {/* Grille */}
              <View style={styles.grid}>
                {group.items.map((item) => (
                  <GridTile
                    key={item.id}
                    item={item}
                    onOpen={() => setLightbox(item)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Lightbox plein écran */}
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}

// ==========================================
// ÉTAT VIDE / ERREUR
// ==========================================
function EmptyState({ icon, title, subtitle, actionLabel, onAction }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centerState}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  headerWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
  },

  filtersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.pill,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },

  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyAction: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primary,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FAFAF9',
  },

  monthSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  monthSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  monthSeparatorText: {
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'capitalize',
    fontWeight: '500',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  videoBadgeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  videoBadgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Lightbox
  lightbox: {
    flex: 1,
    backgroundColor: '#000',
  },
  lightboxHeaderWrap: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  lightboxCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxContent: {
    flex: 1,
    justifyContent: 'center',
  },
  lightboxMedia: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.4,
  },
});
