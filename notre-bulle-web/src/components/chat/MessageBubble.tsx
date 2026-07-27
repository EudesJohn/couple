// ============================================================
// Bulle de message — Texte / Image / Voice / Quoted reply
// Design premium, secondes, statuts (envoyé/distribué/lu)
// ============================================================
import { motion } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';
import { colors, spacing, borderRadius } from '../../constants/theme';
import { VoiceNoteBubble } from '../media/VoiceNoteBubble';
import { StorageImage } from '../media/StorageImage';
import { VideoBubble } from '../media/VideoBubble';
import { getMediaType } from '../../lib/media';
import { DoubleCheckIcon, ReplyIcon, PhoneIcon, VideoIcon, PhoneOffIcon, TrashIcon } from '../Icons';
import type { MessageWithDetails } from '../../types/database';

interface MessageBubbleProps {
  message: MessageWithDetails;
  isOwn: boolean;
  index?: number;
  myProfileId: string | null;
  bubbleSelfColor?: string;
  bubbleOtherColor?: string;
  onImageClick?: (storagePath: string) => void;
  onVideoExpand?: (storagePath: string, mimeType: string) => void;
  onDelete?: (messageId: string) => void;
}

function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageStatus({ statuses, myProfileId }: { statuses: any[]; myProfileId: string | null }) {
  if (!statuses || statuses.length === 0) return null;

  const partnerStatuses = myProfileId
    ? statuses.filter((s) => s.profile_id !== myProfileId)
    : statuses;

  if (partnerStatuses.length === 0) return null;

  const statusOrder = ['sent', 'delivered', 'read'];
  const highestStatus = partnerStatuses.reduce((max, s) => {
    return statusOrder.indexOf(s.status) > statusOrder.indexOf(max.status) ? s : max;
  }, partnerStatuses[0]);

  if (highestStatus.status === 'sent') {
    return <DoubleCheckIcon size={14} color="rgba(255,255,255,0.4)" />;
  }
  if (highestStatus.status === 'delivered') {
    return <DoubleCheckIcon size={14} color="rgba(255,255,255,0.6)" />;
  }
  if (highestStatus.status === 'read') {
    return <DoubleCheckIcon size={14} color="#34B759" />;
  }
  return null;
}

function QuotedMessage({ replyTo, isOwn }: { replyTo: NonNullable<MessageWithDetails['reply_to_message']>; isOwn: boolean }) {
  const previewText = replyTo.content
    ? replyTo.content
    : replyTo.type === 'image' ? 'Photo'
    : replyTo.type === 'voice' ? 'Message vocal'
    : replyTo.type === 'video' ? 'Vidéo'
    : 'Media';

  return (
    <div style={{
      borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : colors.primary}`,
      marginBottom: spacing.sm,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: isOwn ? 'rgba(255,255,255,0.08)' : 'rgba(124,45,18,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <ReplyIcon size={10} color={isOwn ? 'rgba(255,255,255,0.7)' : colors.primary} />
          <span style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
            color: isOwn ? 'rgba(255,255,255,0.7)' : colors.primary,
          }}>
            Réponse
          </span>
        </div>
        <span style={{
          fontSize: 13, lineHeight: '17px',
          color: isOwn ? 'rgba(255,255,255,0.75)' : colors.textSecondary,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {previewText}
        </span>
      </div>
    </div>
  );
}

// ─── Bulle de journal d'appel (WhatsApp-style) ───
function CallLogBubble({ message, isOwn, selfColor, otherColor }: {
  message: MessageWithDetails;
  isOwn: boolean;
  selfColor: string;
  otherColor: string;
}) {
  let callData: Record<string, any> = {};
  try { callData = JSON.parse(message.content || '{}'); } catch { /* ignore */ }

  const callType = callData.callType || 'audio';
  const status = callData.status || 'missed';
  const duration = callData.duration || 0;
  const isMissed = status === 'missed';
  const isCancelled = status === 'cancelled';

  const Icon = (isMissed || isCancelled) ? PhoneOffIcon : (callType === 'video' ? VideoIcon : PhoneIcon);
  const iconCircleBg = (isMissed || isCancelled) ? `${colors.error}20` : 'rgba(255,255,255,0.15)';
  const iconColor = (isMissed || isCancelled) ? colors.error : (isOwn ? colors.bubbleSelfText : colors.primary);
  const label = isMissed ? 'Appel manqué' : (isCancelled ? 'Appel annulé' : `Appel ${callType === 'video' ? 'vidéo' : 'audio'}`);

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationStr = duration > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : '';

  // Estimation conso données: ~1 Mo/min audio, ~6 Mo/min vidéo
  const dataMB = (duration / 60) * (callType === 'video' ? 6 : 1);
  const dataStr = dataMB < 1 ? '< 1 Mo' : `～${dataMB.toFixed(1).replace('.', ',')} Mo`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: spacing.sm,
        padding: `0 ${spacing.lg}px`,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        backgroundColor: isOwn ? selfColor : otherColor,
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderRadius: borderRadius.lg,
        borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
        borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        border: !isOwn ? `1px solid ${colors.borderLight}` : undefined,
        boxShadow: `0 2px 6px ${isOwn ? colors.glowBurgundy : colors.shadow}`,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 22, flexShrink: 0,
          backgroundColor: iconCircleBg,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }}>
          <Icon size={22} color={iconColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: isOwn ? colors.bubbleSelfText : colors.text }}>
            {label}
          </div>
          {!isMissed && duration > 0 && (
            <div style={{ fontSize: 13, color: isOwn ? 'rgba(255,255,255,0.65)' : colors.textTertiary, marginTop: 2 }}>
              {durationStr} • {dataStr}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Hook personnalisé pour détecter un appui long (mobile) ou clic droit (desktop)
function useLongPress(
  onLongPress: () => void,
  { delay = 600 } = {}
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    timerRef.current = setTimeout(onLongPress, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    },
  } as const;
}

export function MessageBubble({ message, isOwn, index = 0, myProfileId, bubbleSelfColor, bubbleOtherColor, onImageClick, onVideoExpand, onDelete }: MessageBubbleProps) {
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = useCallback(() => {
    onDelete?.(message.id);
    setShowDeleteMenu(false);
    setConfirmDelete(false);
  }, [onDelete, message.id]);

  const longPressHandlers = useLongPress(() => {
    // Seulement les propres messages peuvent être supprimés
    if (isOwn && onDelete) setShowDeleteMenu(true);
  });

  const attachments = message.attachments || [];
  const hasAttachment = attachments.length > 0;
  const attachment = attachments[0];

  const selfColor = bubbleSelfColor || colors.bubbleSelf;
  const otherColor = bubbleOtherColor || colors.bubbleOther;
  const hasReply = !!message.reply_to_message?.id;

  const bubbleContent = (() => {
    // Journal d'appel → rendu spécial
    if (message.type === 'call') {
      return <CallLogBubble message={message} isOwn={isOwn} selfColor={selfColor} otherColor={otherColor} />;
    }

    return (
      <div style={{
        maxWidth: '78%',
        backgroundColor: isOwn ? selfColor : otherColor,
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderRadius: borderRadius.lg,
        borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
        borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        border: !isOwn ? `1px solid ${colors.borderLight}` : undefined,
        boxShadow: `0 2px 6px ${isOwn ? colors.glowBurgundy : colors.shadow}`,
      }}>
        {/* Quoted message (reply) */}
        {hasReply && message.reply_to_message && (
          <QuotedMessage replyTo={message.reply_to_message} isOwn={isOwn} />
        )}

        {/* Image */}
        {hasAttachment && getMediaType(attachment.mime_type) === 'image' && (
          <div style={{
            margin: `-${spacing.lg}px`,
            marginBottom: spacing.sm,
            borderTopLeftRadius: borderRadius.lg,
            borderTopRightRadius: borderRadius.lg,
            overflow: 'hidden',
          }}>
            <StorageImage
              storagePath={attachment.storage_path}
              alt="Media"
              style={{ width: 240, height: 200, objectFit: 'cover', display: 'block' }}
              onClick={onImageClick ? () => onImageClick(attachment.storage_path) : undefined}
            />
          </div>
        )}

        {/* Vidéo */}
        {hasAttachment && getMediaType(attachment.mime_type) === 'video' && (
          <div style={{
            margin: `-${spacing.lg}px`,
            marginBottom: spacing.sm,
            borderTopLeftRadius: borderRadius.lg,
            borderTopRightRadius: borderRadius.lg,
            overflow: 'hidden',
          }}>
            <VideoBubble
              storagePath={attachment.storage_path}
              mimeType={attachment.mime_type}
              onExpand={onVideoExpand ? (blobUrl, mt) => onVideoExpand(attachment.storage_path, mt) : undefined}
            />
          </div>
        )}

        {/* Voice Note */}
        {hasAttachment && getMediaType(attachment.mime_type) === 'audio' && (
          <VoiceNoteBubble
            storagePath={attachment.storage_path}
            durationMs={attachment.duration_ms || 0}
            isOwn={isOwn}
            bubbleSelfColor={selfColor}
          />
        )}

        {/* Texte */}
        {message.content && (
          <span style={{
            fontSize: 16, lineHeight: '22px',
            color: isOwn ? colors.bubbleSelfText : colors.text,
          }}>
            {message.content}
          </span>
        )}

        {/* Heure + Statut */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOwn ? 'flex-end' : 'flex-start',
          gap: 4,
          marginTop: 4,
        }}>
          <span style={{
            fontSize: 11,
            color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textTertiary,
          }}>
            {formatTime(message.created_at)}
          </span>
          {isOwn && (
            <MessageStatus statuses={message.statuses} myProfileId={myProfileId} />
          )}
        </div>
      </div>
    );
  })();

  // Appliquer les handlers long-press sur le conteneur principal
  return (
    <div
      {...(isOwn && onDelete ? longPressHandlers : {})}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.35,
          delay: Math.min(index * 0.025, 0.3),
          ease: [0.25, 0.1, 0.25, 1],
        }}
        style={{
          display: 'flex',
          justifyContent: isOwn ? 'flex-end' : 'flex-start',
          marginBottom: showDeleteMenu && isOwn && onDelete ? spacing.xs : spacing.sm,
          padding: `0 ${spacing.lg}px`,
        }}
      >
        {bubbleContent}
      </motion.div>

      {/* ─── Barre de suppression (élégante, en dessous de la bulle) ─── */}
      {showDeleteMenu && isOwn && onDelete && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            display: 'flex',
            justifyContent: isOwn ? 'flex-end' : 'flex-start',
            padding: `0 ${spacing.lg}px`,
            marginBottom: spacing.sm,
            overflow: 'hidden',
          }}
        >
          {confirmDelete ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: `${colors.error}12`,
              border: `1px solid ${colors.error}30`,
              borderRadius: borderRadius.lg,
              padding: `${spacing.sm}px ${spacing.md}px`,
            }}>
              <span style={{
                fontSize: 13, color: colors.error, fontWeight: 500,
                fontFamily: 'inherit',
              }}>
                Supprimer ?
              </span>
              <button
                onClick={handleDelete}
                style={{
                  backgroundColor: colors.error, color: '#FAFAF9', border: 'none',
                  borderRadius: borderRadius.sm, padding: '4px 12px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: 0.3,
                }}
              >
                Oui
              </button>
              <button
                onClick={() => { setShowDeleteMenu(false); setConfirmDelete(false); }}
                style={{
                  backgroundColor: 'transparent', color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm, padding: '4px 12px',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Annuler
              </button>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setConfirmDelete(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                backgroundColor: `${colors.error}10`,
                border: `1px solid ${colors.error}25`,
                borderRadius: borderRadius.md,
                padding: `${spacing.xs}px ${spacing.md}px`,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <TrashIcon size={14} color={colors.error} />
              <span style={{ fontSize: 13, color: colors.error, fontWeight: 600 }}>
                Supprimer
              </span>
            </motion.button>
          )}
        </motion.div>
      )}
    </div>
  );
}
