// ============================================================
// Chat — Texte + Médias (images, notes vocales)
// Reply-to (Swipe), fond d'écran personnalisé, thème dynamique
// ============================================================
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { colors as staticColors, spacing } from '../constants/theme';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { useMessages } from '../hooks/useMessages';
import { usePresence } from '../hooks/usePresence';
import { useMediaPicker } from '../hooks/useMediaPicker';
import { useTheme } from '../hooks/useTheme';
import { AlertIcon, HeartFilledIcon } from '../components/Icons';
import type { MessageWithDetails } from '../types/database';

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

function DateSeparator({ date }: { date: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: `${spacing.md}px ${spacing.xl}px`,
      gap: spacing.md,
    }}>
      <div style={{ flex: 1, height: 1, backgroundColor: staticColors.border }} />
      <span style={{ fontSize: 12, color: staticColors.textTertiary, textTransform: 'capitalize' }}>
        {formatDateSeparator(date)}
      </span>
      <div style={{ flex: 1, height: 1, backgroundColor: staticColors.border }} />
    </div>
  );
}

export default function ChatScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendText, sendVoice, sendImage, isLoading, error } = useMessages();
  const { setIsTyping, partnerPresence } = usePresence();
  const { pickImage, takePhoto, pickVideo } = useMediaPicker();
  const { bubbleSelf, bubbleOther, bg, backgroundImage, refresh: refreshTheme } = useTheme();

  const isPartnerTyping = partnerPresence?.is_typing ?? false;
  const [replyTarget, setReplyTarget] = useState<MessageWithDetails | null>(null);

  // Recharger le thème à chaque montée du composant
  useEffect(() => {
    refreshTheme();
  }, [refreshTheme]);

  // Scroll en bas aux nouveaux messages
  useEffect(() => {
    if (!isLoading && messages.length > 0 && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length, isLoading]);

  const handleReply = useCallback((message: MessageWithDetails) => {
    setReplyTarget(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

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

  // État d'erreur
  if (error) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: bg, padding: '0 40px',
        minHeight: '100%',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32,
          backgroundColor: staticColors.surface,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          marginBottom: spacing.lg,
        }}>
          <AlertIcon size={32} color={staticColors.error} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: staticColors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
          Oups…
        </h3>
        <p style={{ fontSize: 16, color: staticColors.textSecondary, textAlign: 'center', lineHeight: '24px', marginBottom: 8 }}>
          {error}
        </p>
        <p style={{ fontSize: 13, color: staticColors.textTertiary, textAlign: 'center' }}>
          Vérifie que la base Supabase est bien configurée.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: bg,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Fond d'écran personnalisé */}
      {backgroundImage && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          pointerEvents: 'none',
        }} />
      )}

      {/* Liste des messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `${spacing.sm}px 0`,
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
        }}
      >
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          {messagesWithSeparators.length === 0 && !isLoading && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0 40px',
            }}>
              <HeartFilledIcon size={48} color={staticColors.accent} />
              <h3 style={{ fontSize: 18, fontWeight: 600, color: staticColors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
                Notre Bulle
              </h3>
              <p style={{
                fontSize: 16, color: staticColors.textSecondary,
                textAlign: 'center', lineHeight: '24px',
              }}>
                Envoie ton premier message,{'\n'}une photo ou une note vocale
              </p>
            </div>
          )}

          {isLoading && messagesWithSeparators.length === 0 && (
            <div style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <p style={{ fontSize: 16, color: staticColors.textTertiary, fontStyle: 'italic' }}>
                Chargement…
              </p>
            </div>
          )}

          {messagesWithSeparators.map((item, i) => {
            if (item.type === 'date') {
              return <DateSeparator key={`date-${i}`} date={item.data} />;
            }
            const msg = item.data as MessageWithDetails;
            const isOwn = msg.sender_id === msg.sender?.id;

            return (
              <div key={msg.id} style={{ cursor: 'pointer' }}>
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  index={i}
                  bubbleSelfColor={bubbleSelf}
                  bubbleOtherColor={bubbleOther}
                />
              </div>
            );
          })}

          {/* Espace pour le typing indicator */}
          {isPartnerTyping && <div style={{ height: 50 }} />}
        </div>
      </div>

      {/* Typing indicator (overlay) */}
      {isPartnerTyping && (
        <div style={{ position: 'absolute', bottom: 64, left: 0, right: 0 }}>
          <TypingIndicator name="Partenaire" />
        </div>
      )}

      {/* Input */}
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
    </div>
  );
}
