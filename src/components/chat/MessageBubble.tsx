// ============================================================
// MessageBubble — gère tous les types (texte, image, vidéo, voix)
// ============================================================
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';
import type { MessageWithDetails } from '../../types/database';
import { VoiceNoteBubble } from '../media/VoiceNoteBubble';
import { MediaBubble } from '../media/MediaBubble';

interface MessageBubbleProps {
  message: MessageWithDetails;
  isOwn: boolean;
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  sent: { icon: '✓', color: colors.textTertiary },
  delivered: { icon: '✓✓', color: colors.primary },
  read: { icon: '✓✓', color: colors.success },
};

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const senderName = message.sender?.display_name ?? '';
  const status = message.statuses?.[0]?.status ?? 'sent';
  const time = new Date(message.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const attachment = message.attachments?.[0];

  // Rendu selon le type
  const renderContent = () => {
    switch (message.type) {
      // --- NOTE VOCALE ---
      case 'voice':
        if (!attachment) return <Text style={styles.errorText}>Note vocale indisponible</Text>;
        return (
          <VoiceNoteBubble
            storagePath={attachment.storage_path}
            durationMs={attachment.duration_ms ?? 0}
            isOwn={isOwn}
          />
        );

      // --- IMAGE ---
      case 'image':
        if (!attachment) return <Text style={styles.errorText}>Image indisponible</Text>;
        return (
          <MediaBubble
            storagePath={attachment.storage_path}
            mimeType={attachment.mime_type}
            width={attachment.width ?? 800}
            height={attachment.height ?? 600}
            thumbnailPath={attachment.thumbnail_path}
            caption={message.content}
            isOwn={isOwn}
          />
        );

      // --- VIDÉO ---
      case 'video':
        if (!attachment) return <Text style={styles.errorText}>Vidéo indisponible</Text>;
        return (
          <MediaBubble
            storagePath={attachment.storage_path}
            mimeType={attachment.mime_type}
            width={attachment.width ?? 800}
            height={attachment.height ?? 600}
            thumbnailPath={attachment.thumbnail_path}
            caption={message.content}
            isOwn={isOwn}
          />
        );

      // --- APPEL (Étape 6) ---
      case 'call':
        return (
          <View style={styles.callBubble}>
            <Text style={styles.callIcon}>📞</Text>
            <Text style={[styles.callText, { color: isOwn ? colors.bubbleSelfText : colors.bubbleOtherText }]}>
              Appel {message.content === 'missed' ? 'manqué' : 'de ' + message.content}
            </Text>
          </View>
        );

      // --- TEXTE (défaut) ---
      default:
        return (
          <View style={[
            styles.textBubble,
            {
              backgroundColor: isOwn ? colors.bubbleSelf : colors.bubbleOther,
              borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
              borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
            },
          ]}>
            {message.content && (
              <Text style={[
                styles.textContent,
                { color: isOwn ? colors.bubbleSelfText : colors.bubbleOtherText },
              ]}>
                {message.content}
              </Text>
            )}
          </View>
        );
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.container,
        isOwn ? styles.ownMessage : styles.otherMessage,
      ]}
    >
      {renderContent()}

      {/* Métadonnées */}
      <View style={[styles.meta, isOwn ? styles.metaOwn : styles.metaOther]}>
        <Text style={styles.timeText}>{time}</Text>

        {isOwn && message.type === 'text' && (
          <Text style={[styles.statusIcon, { color: STATUS_ICONS[status]?.color ?? colors.textTertiary }]}>
            {STATUS_ICONS[status]?.icon ?? '✓'}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: '78%',
    marginVertical: 3,
    paddingHorizontal: spacing.md,
  },
  ownMessage: {
    alignSelf: 'flex-end',
  },
  otherMessage: {
    alignSelf: 'flex-start',
  },

  // Texte
  textBubble: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  textContent: {
    ...typography.body,
  },

  // Médias (image/vidéo)
  mediaBubble: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
  },

  // Appel
  callBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  callIcon: {
    fontSize: 16,
  },
  callText: {
    ...typography.body,
    fontSize: 14,
  },

  // Erreur
  errorText: {
    color: colors.textTertiary,
    fontSize: 13,
    fontStyle: 'italic',
  },

  // Métadonnées
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  metaOwn: {
    justifyContent: 'flex-end',
  },
  metaOther: {
    justifyContent: 'flex-start',
  },
  timeText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  statusIcon: {
    fontSize: 10,
  },
});
