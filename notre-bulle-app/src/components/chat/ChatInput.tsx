// ============================================================
// ChatInput premium — Texte, médias, notes vocales, Reply Preview
// SVG icons, MediaPickerSheet, animations spring
// Design Burgundy & Gold
// ============================================================
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useState, useCallback } from 'react';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
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
  onSendVideo?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  replyTo?: MessageWithDetails | null;
  onCancelReply?: () => void;
}

// ==========================================
// BOUTON ICÔNE AVEC ANIMATION DE SCALE
// ==========================================
function AnimatedIconBtn({
  onPress,
  children,
  style,
  disabled,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.88); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        activeOpacity={1}
        disabled={disabled}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
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
  const plusRotation = useSharedValue(0);

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

  const plusAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotation.value}deg` }],
  }));

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value);
      onTypingChange?.(value.length > 0);
    },
    [onTypingChange]
  );

  const handleSendText = () => {
    if (!text.trim()) return;
    onSendText(text.trim());
    setText('');
    onTypingChange?.(false);
  };

  // ==========================================
  // MEDIA — Ouverture du bottom sheet
  // ==========================================
  const handleMediaPress = useCallback(() => {
    plusRotation.value = withSpring(45);
    setMediaSheetVisible(true);
  }, []);

  const handleCloseMedia = useCallback(() => {
    plusRotation.value = withSpring(0);
    setMediaSheetVisible(false);
  }, []);

  // ==========================================
  // VOIX
  // ==========================================
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

  const handleSendRecordedVoice = useCallback(() => {
    if (recordedUri && recordedDuration > 0) {
      onSendVoice(recordedUri, recordedDuration);
      setRecordedUri(null);
      setRecordedDuration(0);
    }
  }, [recordedUri, recordedDuration, onSendVoice]);

  // Mode enregistrement vocal
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
      {replyTo && onCancelReply && (
        <ReplyPreview replyTo={replyTo} onCancel={onCancelReply} />
      )}

      <View style={styles.container}>
        {/* Media (galerie/caméra) — bouton animé */}
        <AnimatedIconBtn onPress={handleMediaPress}>
          <Animated.View
            style={[
              styles.plusButton,
              mediaSheetVisible && { backgroundColor: colors.primary },
              plusAnimStyle,
            ]}
          >
            <PlusIcon size={20} color={mediaSheetVisible ? '#FAFAF9' : colors.textSecondary} />
          </Animated.View>
        </AnimatedIconBtn>

        {/* Champ de texte */}
        <View style={styles.inputWrapper}>
          <TextInput
            value={text}
            onChangeText={handleChangeText}
            placeholder={replyTo ? 'Ecris ta réponse…' : 'Écris quelque chose…'}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            style={styles.textInput}
          />
        </View>

        {/* Micro — note vocale */}
        <AnimatedIconBtn onPress={handleMicPress} style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}>
          <MicIcon size={18} color={colors.textSecondary} />
        </AnimatedIconBtn>

        {/* Envoi texte */}
        <AnimatedIconBtn
          onPress={handleSendText}
          disabled={!hasText}
          style={[
            styles.sendButton,
            { backgroundColor: hasText ? colors.primary : colors.surfaceAlt },
          ]}
        >
          <ArrowUpIcon size={18} color={hasText ? '#FAFAF9' : colors.textTertiary} />
        </AnimatedIconBtn>
      </View>

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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  plusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
  },
  textInput: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
    padding: 0,
    maxHeight: 80,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
});
