// ============================================================
// Bulle de message — Texte / Image / Voice / Quoted reply
// Design premium, secondes, statuts (envoyé/distribué/lu)
// ============================================================
import { View, Text, Image, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import { VoiceNoteBubble } from '../media/VoiceNoteBubble';
import { getMediaUrl, getMediaType } from '../../lib/media';
import { DoubleCheckIcon, ReplyIcon } from '../Icons';
import type { MessageWithDetails } from '../../types/database';

interface MessageBubbleProps {
  message: MessageWithDetails;
  isOwn: boolean;
  index?: number;
  bubbleSelfColor?: string;
  bubbleOtherColor?: string;
}

function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
export function MessageBubble({ message, isOwn, index = 0, bubbleSelfColor, bubbleOtherColor }: MessageBubbleProps) {
  const attachments = message.attachments || [];
  const hasAttachment = attachments.length > 0;
  const attachment = attachments[0];

  const selfColor = bubbleSelfColor || colors.bubbleSelf;
  const otherColor = bubbleOtherColor || colors.bubbleOther;
  const hasReply = !!message.reply_to_message;

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
          <View style={[styles.imageContainer, hasReply && { marginTop: spacing.sm }]}>
            <Image
              source={{ uri: getMediaUrl(attachment.storage_path) }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
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
          <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textTertiary }]}>
            {formatTime(message.created_at)}
          </Text>
          {isOwn && (
            <MessageStatus statuses={message.statuses} myProfileId={null} />
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
