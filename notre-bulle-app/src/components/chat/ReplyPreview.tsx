// ============================================================
// ReplyPreview — Barre « Répondre à Partenaire » au-dessus de l'input
// Affiche un extrait du message cité avec bouton pour annuler
// Design Burgundy & Gold
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { CloseIcon, ReplyIcon } from '../Icons';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import type { MessageWithDetails } from '../../types/database';

interface ReplyPreviewProps {
  replyTo: MessageWithDetails;
  onCancel: () => void;
}

function truncate(str: string | null, max: number): string {
  if (!str) return 'Photo ou media';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function ReplyPreview({ replyTo, onCancel }: ReplyPreviewProps) {
  const senderName = replyTo.sender?.display_name || 'Partenaire';
  const previewText = replyTo.content
    ? `"${truncate(replyTo.content, 60)}"`
    : replyTo.type === 'image' ? '📷 Photo'
    : replyTo.type === 'voice' ? '🎤 Message vocal'
    : replyTo.type === 'video' ? '🎬 Vidéo'
    : 'Media';

  return (
    <Animated.View
      entering={FadeInUp.duration(200).springify()}
      exiting={FadeOutDown.duration(150)}
      style={styles.container}
    >
      {/* Indicateur visuel (barre à gauche) */}
      <View style={styles.indicator} />

      {/* Contenu */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <ReplyIcon size={12} color={colors.primary} />
          <Text style={styles.replyLabel}>Répondre à</Text>
          <Text style={styles.senderName}>{senderName}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {previewText}
        </Text>
      </View>

      {/* Bouton fermer */}
      <TouchableOpacity onPress={onCancel} style={styles.closeBtn} activeOpacity={0.7}>
        <CloseIcon size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingLeft: 0,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 0,
  },
  indicator: {
    width: 4,
    height: '100%',
    backgroundColor: colors.primary,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  preview: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
});
