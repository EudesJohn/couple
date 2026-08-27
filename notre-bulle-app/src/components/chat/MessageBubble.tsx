// ============================================================
// Bulle de message — Texte / Image / Voice / Call / Quoted reply
// Design premium, secondes, statuts (envoyé/distribué/lu)
// ============================================================
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import { VoiceNoteBubble } from '../media/VoiceNoteBubble';
import { useMediaUrl, getMediaType } from '../../lib/media';
import { DoubleCheckIcon, ReplyIcon, PhoneIcon, VideoIcon, PhoneOffIcon } from '../Icons';
import type { MessageWithDetails } from '../../types/database';

interface MessageBubbleProps {
  message: MessageWithDetails;
  isOwn: boolean;
  index?: number;
  myProfileId: string | null;
  bubbleSelfColor?: string;
  bubbleOtherColor?: string;
  onImageClick?: (storagePath: string) => void;
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
    return <DoubleCheckIcon size={14} color={colors.accent} />;
  }

  return null;
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

  const iconColor = (isMissed || isCancelled) ? colors.error : (isOwn ? '#FAFAF9' : colors.primary);
  const label = isMissed ? 'Appel manqué' : (isCancelled ? 'Appel annulé' : `Appel ${callType === 'video' ? 'vidéo' : 'audio'}`);

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationStr = duration > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : '';

  return (
    <View style={[
      styles.callBubble,
      {
        backgroundColor: isOwn ? selfColor : otherColor,
        borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
        borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        borderWidth: !isOwn ? 1 : 0,
        borderColor: !isOwn ? colors.borderLight : undefined,
      },
    ]}>
      <View style={[
        styles.callIconCircle,
        { backgroundColor: (isMissed || isCancelled) ? `${colors.error}20` : 'rgba(255,255,255,0.15)' },
      ]}>
        {(isMissed || isCancelled) ? (
          <PhoneOffIcon size={22} color={iconColor} />
        ) : callType === 'video' ? (
          <VideoIcon size={22} color={iconColor} />
        ) : (
          <PhoneIcon size={22} color={iconColor} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.callLabel, { color: isOwn ? '#FAFAF9' : colors.text }]}>
          {label}
        </Text>
        {!isMissed && duration > 0 && (
          <Text style={[styles.callDuration, { color: isOwn ? 'rgba(255,255,255,0.65)' : colors.textTertiary }]}>
            {durationStr}
          </Text>
        )}
      </View>
      <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textTertiary }]}>
        {formatTime(message.created_at)}
      </Text>
    </View>
  );
}

// ==========================================
// QUOTED MESSAGE PREVIEW (Reply)
// ==========================================
function QuotedMessage({ replyTo, isOwn }: { replyTo: NonNullable<MessageWithDetails['reply_to_message']>; isOwn: boolean }) {
  const previewText = replyTo.content
    ? replyTo.content
    : replyTo.type === 'image' ? 'Photo'
    : replyTo.type === 'voice' ? 'Message vocal'
    : replyTo.type === 'video' ? 'Vidéo'
    : 'Media';

  return (
    <View style={[styles.quotedContainer, { borderLeftColor: isOwn ? 'rgba(255,255,255,0.5)' : colors.primary }]}>
      <View style={[styles.quotedContent, { backgroundColor: isOwn ? 'rgba(255,255,255,0.08)' : 'rgba(124,45,18,0.06)' }]}>
        <View style={styles.quotedHeader}>
          <ReplyIcon size={10} color={isOwn ? 'rgba(255,255,255,0.7)' : colors.primary} />
          <Text style={[styles.quotedLabel, { color: isOwn ? 'rgba(255,255,255,0.7)' : colors.primary }]}>
            Réponse
          </Text>
        </View>
        <Text
          style={[styles.quotedText, { color: isOwn ? 'rgba(255,255,255,0.75)' : colors.textSecondary }]}
          numberOfLines={2}
        >
          {previewText}
        </Text>
      </View>
    </View>
  );
}

// ==========================================
// MESSAGE BUBBLE
// ==========================================
export function MessageBubble({ message, isOwn, index = 0, myProfileId, bubbleSelfColor, bubbleOtherColor, onImageClick }: MessageBubbleProps) {
  const attachments = message.attachments || [];
  const hasAttachment = attachments.length > 0;
  const attachment = attachments[0];
  const imageUrl = useMediaUrl(attachment?.storage_path);

  const selfColor = bubbleSelfColor || colors.bubbleSelf;
  const otherColor = bubbleOtherColor || colors.bubbleOther;
  // Vérifier reply_to (la colonne DB) ET reply_to_message (données jointes)
  // Le LEFT JOIN PostgREST peut renvoyer {id:null} au lieu de null
  const hasReply = !!(message.reply_to && message.reply_to_message?.id);

  // ─── Journal d'appel → rendu spécial ───
  if (message.type === 'call') {
    return (
      <Animated.View
        entering={FadeInUp.duration(300).delay(Math.min(index * 30, 200)).springify()}
        style={[
          styles.container,
          { alignItems: isOwn ? 'flex-end' : 'flex-start' },
        ]}
      >
        <CallLogBubble message={message} isOwn={isOwn} selfColor={selfColor} otherColor={otherColor} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(300).delay(Math.min(index * 30, 200)).springify()}
      style={[
        styles.container,
        { alignItems: isOwn ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isOwn ? selfColor : otherColor,
            borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
            borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
            borderWidth: !isOwn ? 1 : 0,
            borderColor: !isOwn ? colors.borderLight : undefined,
            shadowColor: isOwn ? colors.glowBurgundy : colors.shadow,
          },
        ]}
      >
        {/* Quoted message (reply) */}
        {hasReply && message.reply_to_message && (
          <QuotedMessage replyTo={message.reply_to_message} isOwn={isOwn} />
        )}

        {/* Image */}
        {hasAttachment && getMediaType(attachment.mime_type) === 'image' && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onImageClick?.(attachment.storage_path)}
            style={[styles.imageContainer, hasReply && { marginTop: spacing.sm }]}
          >
            <Image
              source={{ uri: imageUrl ?? undefined }}
              style={styles.image}
              resizeMode="cover"
            />
          </TouchableOpacity>
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
          <Text style={[styles.text, { color: isOwn ? colors.bubbleSelfText : colors.text }]}>
            {message.content}
          </Text>
        )}

        {/* Heure + Statut */}
        <View style={[styles.footer, { justifyContent: isOwn ? 'flex-end' : 'flex-start' }]}>
          {message.edited_at && (
            <Text style={[styles.edited, { color: isOwn ? 'rgba(255,255,255,0.55)' : colors.textTertiary }]}>
              Modifié
            </Text>
          )}
          <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textTertiary }]}>
            {formatTime(message.created_at)}
          </Text>
          {isOwn && (
            <MessageStatus statuses={message.statuses} myProfileId={myProfileId} />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  text: {
    ...typography.body,
    lineHeight: 22,
  },
  imageContainer: {
    margin: -spacing.lg,
    marginBottom: spacing.sm,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  image: {
    width: 240,
    height: 200,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  time: {
    fontSize: 11,
  },
  edited: {
    fontSize: 10,
    fontStyle: 'italic',
  },

  // Call log
  callBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  callIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  callDuration: {
    fontSize: 13,
    marginTop: 2,
  },

  // Quoted reply
  quotedContainer: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  quotedContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quotedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  quotedLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  quotedText: {
    fontSize: 13,
    lineHeight: 17,
  },
});
