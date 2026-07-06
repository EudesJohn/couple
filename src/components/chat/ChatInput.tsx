// ============================================================
// ChatInput — Texte + Galerie/Caméra + Notes vocales
// ============================================================
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform } from 'react-native';
import { useState, useCallback } from 'react';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';
import { VoiceRecorder } from '../media/VoiceRecorder';
import { useVoiceNotes } from '../../hooks/useVoiceNotes';

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendVoice: (uri: string, durationMs: number) => void;
  onSendImage: () => void;
  onTakePhoto: () => void;
  onSendVideo: () => void;
  onTypingChange?: (isTyping: boolean) => void;
}

export function ChatInput({
  onSendText,
  onSendVoice,
  onSendImage,
  onTakePhoto,
  onSendVideo,
  onTypingChange,
}: ChatInputProps) {
  const [text, setText] = useState('');
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
  // MEDIA — Action sheet (caméra / galerie)
  // ==========================================
  const handleMediaPress = useCallback(() => {
    const options = ['📸 Photo', '🖼 Galerie', '🎬 Vidéo', 'Annuler'];
    const cancelIndex = 3;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        (index) => {
          if (index === 0) onTakePhoto();
          else if (index === 1) onSendImage();
          else if (index === 2) onSendVideo();
        }
      );
    } else {
      // Android : simple menu avec Alert
      const { Alert: RNAlert } = require('react-native');
      RNAlert.alert('Ajouter un média', '', [
        { text: '📸 Photo', onPress: onTakePhoto },
        { text: '🖼 Galerie', onPress: onSendImage },
        { text: '🎬 Vidéo', onPress: onSendVideo },
        { text: 'Annuler', style: 'cancel' },
      ]);
    }
  }, [onSendImage, onTakePhoto, onSendVideo]);

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

  return (
    <View style={styles.container}>
      {/* Media (galerie/caméra) */}
      <TouchableOpacity onPress={handleMediaPress} style={styles.iconButton}>
        <Text style={styles.iconText}>+</Text>
      </TouchableOpacity>

      {/* Champ de texte */}
      <View style={styles.inputWrapper}>
        <TextInput
          value={text}
          onChangeText={handleChangeText}
          placeholder="Écris quelque chose…"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
          style={styles.textInput}
        />
      </View>

      {/* Micro — note vocale */}
      <TouchableOpacity
        onPress={handleMicPress}
        style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
      >
        <View style={styles.micIcon} />
      </TouchableOpacity>

      {/* Envoi texte */}
      <TouchableOpacity
        onPress={handleSendText}
        disabled={!text.trim()}
        style={[
          styles.sendButton,
          { backgroundColor: text.trim() ? colors.primary : colors.surfaceAlt },
        ]}
      >
        <Text style={[styles.sendArrow, { color: text.trim() ? '#fff' : colors.textTertiary }]}>
          ↑
        </Text>
      </TouchableOpacity>
    </View>
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
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  iconText: {
    fontSize: 22,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  micIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.inputBackground,
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
  sendArrow: {
    fontSize: 18,
    fontWeight: '600',
  },
});
