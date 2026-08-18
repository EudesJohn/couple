// ============================================================
// Chat — Texte + Médias (images, vidéos, notes vocales)
// Reply-to (Swipe), fond d'écran personnalisé, thème dynamique
// ============================================================
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors as staticColors, typography, spacing } from '../../src/constants/theme';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { SwipeToReply } from '../../src/components/chat/SwipeToReply';
import { TypingIndicator } from '../../src/components/chat/TypingIndicator';
import { useMessages } from '../../src/hooks/useMessages';
import { usePresence } from '../../src/hooks/usePresence';
import { useMediaPicker } from '../../src/hooks/useMediaPicker';
import { useTheme } from '../../src/hooks/useTheme';
import { AlertIcon, HeartFilledIcon } from '../../src/components/Icons';
import type { MessageWithDetails } from '../../src/types/database';

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
  const { messages, sendText, sendVoice, sendImage, isLoading, myProfileId, error } = useMessages();
  const { setIsTyping, partnerPresence } = usePresence();
  const { pickImage, takePhoto, pickVideo } = useMediaPicker();
  const { bubbleSelf, bubbleOther, bg, backgroundImage, refresh: refreshTheme } = useTheme();

  const [bgImage, setBgImage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<MessageWithDetails | null>(null);
  const isPartnerTyping = partnerPresence?.is_typing ?? false;

  // Recharger le thème à chaque focus (retour des paramètres)
  useFocusEffect(
    useCallback(() => {
      void refreshTheme();
    }, [refreshTheme])
  );

  // Mettre à jour le fond quand le thème change
  useEffect(() => {
    if (backgroundImage) setBgImage(backgroundImage);
  }, [backgroundImage]);

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

  // --- REPLY HANDLER ---
  const handleReply = useCallback((message: MessageWithDetails) => {
    setReplyTarget(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

  // --- HANDLERS D'ENVOI ---
  const handleSendText = useCallback((text: string) => {
    const replyToId = replyTarget?.id || undefined;
    sendText(text, replyToId);
    setReplyTarget(null);
  }, [sendText, replyTarget]);

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
      sendImage(media.uri, media.mimeType, media.width, media.height);
    }
  }, [pickVideo, sendImage]);

  // Rendu des items FlatList
  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (item.type === 'date') {
        return <DateSeparator date={item.data} />;
      }
      const msg = item.data as MessageWithDetails;
      const isOwn = msg.sender_id === myProfileId;
      const bubble = (
        <MessageBubble
          message={msg}
          isOwn={isOwn}
          bubbleSelfColor={bubbleSelf}
          bubbleOtherColor={bubbleOther}
        />
      );
      return (
        <SwipeToReply onReply={() => handleReply(msg)}>
          {bubble}
        </SwipeToReply>
      );    }, [bubbleSelf, bubbleOther, handleReply, myProfileId]
  );

  const keyExtractor = useCallback((item: any, index: number) => {
    if (item.type === 'date') return `date-${index}`;
    return item.data.id;
  }, []);

  // État d'erreur (ex: pas de connexion Supabase)
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: staticColors.background }]}>
        <View style={styles.emptyState}>
          <View style={styles.errorIconCircle}>
            <AlertIcon size={32} color={staticColors.error} />
          </View>
          <Text style={styles.emptyTitle}>Oups…</Text>
          <Text style={[styles.emptySubtitle, { marginBottom: 8 }]}>{error}</Text>
          <Text style={[styles.emptySubtitle, { fontSize: 13 }]}>
            Vérifie que la base Supabase est bien configurée.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Fond d'écran personnalisé */}
      {bgImage && (
        <Image
          source={{ uri: bgImage }}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      )}

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
              <HeartFilledIcon size={48} color={staticColors.accent} />
              <Text style={styles.emptyTitle}>Notre Bulle</Text>
              <Text style={styles.emptySubtitle}>
                Envoie ton premier message,{'\n'}une photo ou une note vocale
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.loadingText}>Chargement…</Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ height: isPartnerTyping ? 50 : 20 }} />
        }
      />

      {/* Indicateur "écrit…" */}
      {isPartnerTyping && (
        <View style={styles.typingOverlay}>
          <TypingIndicator name="Partenaire" />
        </View>
      )}

      {/* Input avec médias + reply preview */}
      <ChatInput
        onSendText={handleSendText}
        onSendVoice={handleSendVoice}
        onSendImage={handleSendImage}
        onTakePhoto={handleTakePhoto}
        onSendVideo={handleSendVideo}
        onTypingChange={setIsTyping}
        replyTo={replyTarget}
        onCancelReply={handleCancelReply}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
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
    backgroundColor: staticColors.border,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: staticColors.textTertiary,
    textTransform: 'capitalize',
  },

  // État vide
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: staticColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.subheading,
    color: staticColors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.body,
    color: staticColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingText: {
    ...typography.body,
    color: staticColors.textTertiary,
    fontStyle: 'italic',
  },

  // Typing overlay
  typingOverlay: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
  },
});
