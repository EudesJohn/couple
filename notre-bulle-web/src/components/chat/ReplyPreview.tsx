// ============================================================
// ReplyPreview — Barre « Répondre à Partenaire » au-dessus de l'input
// Framer Motion pour les animations d'entrée/sortie
// ============================================================
import { motion } from 'framer-motion';
import { CloseIcon, ReplyIcon } from '../Icons';
import { colors, spacing, borderRadius } from '../../constants/theme';
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
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        paddingRight: spacing.sm,
        padding: `${spacing.sm}px ${spacing.sm}px`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      {/* Indicateur visuel (barre colorée à gauche) */}
      <div style={{
        width: 4, alignSelf: 'stretch',
        backgroundColor: colors.primary,
        borderTopRightRadius: 2, borderBottomRightRadius: 2,
        marginRight: spacing.md,
      }} />

      {/* Contenu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ReplyIcon size={12} color={colors.primary} />
          <span style={{ fontSize: 11, fontWeight: 600, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Répondre à
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.primary }}>
            {senderName}
          </span>
        </div>
        <span style={{ fontSize: 14, color: colors.textSecondary, lineHeight: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {previewText}
        </span>
      </div>

      {/* Bouton fermer */}
      <button
        onClick={onCancel}
        style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: colors.surface,
          border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          marginLeft: spacing.sm, flexShrink: 0,
        }}
      >
        <CloseIcon size={14} color={colors.textTertiary} />
      </button>
    </motion.div>
  );
}
