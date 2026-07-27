// ============================================================
// ChatInput premium — Texte, médias, notes vocales, Reply Preview
// Design Burgundy & Gold, Framer Motion
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { VoiceRecorder } from '../media/VoiceRecorder';
import { MediaPickerSheet } from '../media/MediaPickerSheet';
import { ReplyPreview } from './ReplyPreview';
import { useVoiceNotes } from '../../hooks/useVoiceNotes';
import { PlusIcon, MicIcon, ArrowUpIcon } from '../Icons';
import type { MessageWithDetails } from '../../types/database';

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendVoice: (uri: string, durationMs: number) => void;
  onSendImage: () => void;
  onTakePhoto: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  replyTo?: MessageWithDetails | null;
  onCancelReply?: () => void;
}

export function ChatInput({
  onSendText,
  onSendVoice,
  onSendImage,
  onTakePhoto,
  onTypingChange,
  replyTo,
  onCancelReply,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [mediaSheetVisible, setMediaSheetVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    recordingState,
    recordingDurationMs,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceNotes();

  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);

  const isRecording = recordingState === 'recording';
  const isRecordStopped = recordingState === 'stopped';
  const showRecorder = isRecording || isRecordStopped;

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value);
      onTypingChange?.(value.length > 0);

      // Auto-grow : la hauteur suit le contenu
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
        textareaRef.current.style.height = `${newHeight}px`;
      }
    },
    [onTypingChange]
  );

  const handleSendText = () => {
    if (!text.trim()) return;
    onSendText(text.trim());
    setText('');
    onTypingChange?.(false);
    // Reset hauteur
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleMediaPress = () => {
    setMediaSheetVisible(true);
  };

  const handleCloseMedia = () => {
    setMediaSheetVisible(false);
  };

  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        setRecordedUri(result.uri);
        setRecordedDuration(result.durationMs);
      }
    } else {
      setRecordedUri(null);
      setRecordedDuration(0);
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleCancelRecording = useCallback(async () => {
    await cancelRecording();
    setRecordedUri(null);
    setRecordedDuration(0);
  }, [cancelRecording]);

  const handleSendRecordedVoice = useCallback(async () => {
    if (recordedUri && recordedDuration > 0) {
      onSendVoice(recordedUri, recordedDuration);
      setRecordedUri(null);
      setRecordedDuration(0);
      await cancelRecording(); // ← ferme le recorder après envoi
    }
  }, [recordedUri, recordedDuration, onSendVoice, cancelRecording]);

  if (showRecorder) {
    return (
      <VoiceRecorder
        durationMs={recordingDurationMs}
        isRecording={isRecording}
        onStop={handleMicPress}
        onCancel={handleCancelRecording}
        onSend={handleSendRecordedVoice}
      />
    );
  }

  const hasText = text.trim().length > 0;

  return (
    <>
      {/* Reply Preview bar */}
      <AnimatePresence>
        {replyTo && onCancelReply && (
          <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />
        )}
      </AnimatePresence>

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        padding: `${spacing.sm}px`,
        backgroundColor: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        gap: spacing.sm,
      }}>
        {/* Media button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleMediaPress}
          aria-label="Joindre un média"
          style={{
            width: 36, height: 36, borderRadius: 18, cursor: 'pointer',
            backgroundColor: mediaSheetVisible ? colors.primary : colors.surfaceAlt,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            border: `1.5px solid ${colors.border}`,
            marginBottom: 2, flexShrink: 0,
          }}
        >
          <motion.div animate={{ rotate: mediaSheetVisible ? 45 : 0 }}>
            <PlusIcon size={20} color={mediaSheetVisible ? '#FAFAF9' : colors.textSecondary} />
          </motion.div>
        </motion.button>

        {/* Text input */}
        <div style={{
          flex: 1,
          backgroundColor: colors.surfaceAlt,
          borderRadius: borderRadius.lg,
          padding: `${spacing.sm}px ${spacing.md}px`,
          maxHeight: 100,
        }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleChangeText(e.target.value)}
            placeholder={replyTo ? 'Ecris ta réponse…' : 'Écris quelque chose…'}
            maxLength={2000}
            rows={1}
            style={{
              width: '100%',
              fontSize: 16,
              color: colors.text,
              lineHeight: '22px',
              padding: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              resize: 'none',
              fontFamily: 'inherit',
              maxHeight: 120,
              overflow: 'auto',
            }}
          />
        </div>

        {/* Mic button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleMicPress}
          aria-label="Message vocal"
          style={{
            width: 36, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer',
            backgroundColor: colors.surfaceAlt,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            marginBottom: 2, flexShrink: 0,
          }}
        >
          <MicIcon size={18} color={colors.textSecondary} />
        </motion.button>

        {/* Send button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleSendText}
          disabled={!hasText}
          aria-label="Envoyer le message"
          style={{
            width: 36, height: 36, borderRadius: 18, border: 'none',
            cursor: hasText ? 'pointer' : 'not-allowed',
            backgroundColor: hasText ? colors.primary : colors.surfaceAlt,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            marginBottom: 2, flexShrink: 0,
            opacity: hasText ? 1 : 1,
          }}
        >
          <ArrowUpIcon size={18} color={hasText ? '#FAFAF9' : colors.textTertiary} />
        </motion.button>
      </div>

      {/* Media Picker Sheet */}
      <MediaPickerSheet
        visible={mediaSheetVisible}
        onClose={handleCloseMedia}
        onTakePhoto={onTakePhoto}
        onPickImage={onSendImage}
      />
    </>
  );
}
