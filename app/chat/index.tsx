// ============================================================
// 💬 Chat — Texte + Médias (images, vidéos, notes vocales)
// ============================================================
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, typography, spacing } from '../../src/constants/theme';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { TypingIndicator } from '../../src/components/chat/TypingIndicator';
import { useMessages } from '../../src/hooks/useMessages';
import { usePresence } from '../../src/hooks/usePresence';
import { useMediaPicker } from '../../src/hooks/useMediaPicker';

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Séparateur de date
function DateSeparator({ date }: { date: string }) {
  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateSeparatorLine} />
      <Text style={styles.dateSeparatorText}>{formatDateSeparator(date)}</Text>
      <View style={styles.dateSeparatorLine} />
    </View>
  );
}

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null);
  const { messages, sendText, sendVoice, sendImage, isLoading } = useMessages();
  const { setIsTyping, partnerPresence } = usePresence();
  const { pickImage, takePhoto, pickVideo } = useMediaPicker();

  const isPartnerTyping = partnerPresence?.is_typing ?? false;

  // Scroll en bas au chargement et aux nouveaux messages
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isLoading]);

  // Messages avec séparateurs de date
  const messagesWithSeparators = useMemo(() => {
    const result: Array<{ type: 'date' | 'message'; data: any; date?: string }> = [];
    let lastDate = '';

    for (const msg of messages) {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== lastDate) {
        result.push({ type: 'date', data: msg.created_at });
        lastDate = msgDate;
      }
      result.push({ type: 'message', data: msg });
    }

    return result;
  }, [messages]);

  // --- HANDLERS D'ENVOI ---
  const handleSendText = useCallback((text: string) => {
    sendText(text);
  }, [sendText]);

  const handleSendVoice = useCallback((uri: string, durationMs: number) => {
    sendVoice(uri, durationMs);
  }, [sendVoice]);

  const handleSendImage = useCallback(async () => {
    const media = await pickImage();
    if (media) {
      sendImage(media.uri, media.mimeType, media.width, media.height);
    }
  }, [pickImage, sendImage]);

  const handleTakePhoto = useCallback(async () => {
    const media = await takePhoto();
    if (media) {
      sendImage(media.uri, media.mimeType, media.width, media.height);
    }
  }, [takePhoto, sendImage]);

  const handleSendVideo = useCallback(async () => {
    const media = await pickVideo();
    if (media) {
      // Pour l'instant on envoie comme image (sera amélioré pour la vidéo)
      sendImage(media.uri, media.mimeType, media.width, media.height);
    }
  }, [pickVideo, sendImage]);

  // Rendu des items FlatList
  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (item.type === 'date') {
        return <DateSeparator date={item.data} />;
      }
      const msg = item.data;
      const isOwn = msg.sender_id === item.data.sender?.id;
      return <MessageBubble message={msg} isOwn={isOwn} />;
    },
    []
  );

  const keyExtractor = useCallback((item: any, index: number) => {
    if (item.type === 'date') return `date-${index}`;
    return item.data.id;
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Liste des messages */}
      <FlatList
        ref={flatListRef}
        data={messagesWithSeparators}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💫</Text>
              <Text style={styles.emptyTitle}>Notre Bulle</Text>
              <Text style={styles.emptySubtitle}>
                Envoie ton premier message,{'\n'}une photo ou une note vocale 💕
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>⏳</Text>
              <Text style={styles.emptySubtitle}>Chargement…</Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ height: isPartnerTyping ? 50 : 20 }} />
        }
      />

      {/* Indicarteur "écrit…" */}
      {isPartnerTyping && (
        <View style={styles.typingOverlay}>
          <TypingIndicator name="Partenaire" />
        </View>
      )}

      {/* Input avec médias */}
      <ChatInput
        onSendText={handleSendText}
        onSendVoice={handleSendVoice}
        onSendImage={handleSendImage}
        onTakePhoto={handleTakePhoto}
        onSendVideo={handleSendVideo}
        onTypingChange={setIsTyping}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: spacing.sm,
    flexGrow: 1,
  },

  // Séparateur de date
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },

  // État vide
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.subheading,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Typing overlay
  typingOverlay: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
  },
});
