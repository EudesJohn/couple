// ============================================================
// Bulle média — Image ou Vidéo dans le chat
// ============================================================
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';
import { getMediaUrl } from '../../lib/media';

interface MediaBubbleProps {
  storagePath: string;
  mimeType: string;
  width: number;
  height: number;
  thumbnailPath?: string | null;
  caption?: string | null;
  isOwn: boolean;
  onPress?: () => void;
}

export function MediaBubble({
  storagePath,
  mimeType,
  width: imgWidth,
  height: imgHeight,
  thumbnailPath,
  caption,
  isOwn,
  onPress,
}: MediaBubbleProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const imageUrl = getMediaUrl(storagePath);
  const isVideo = mimeType.startsWith('video/');
  const maxBubbleWidth = 240;
  const aspectRatio = imgWidth / imgHeight;
  const displayWidth = Math.min(maxBubbleWidth, imgWidth);
  const displayHeight = displayWidth / aspectRatio;

  if (hasError) {
    return (
      <View
        style={[
          styles.errorContainer,
          {
            width: displayWidth,
            height: 120,
            backgroundColor: isOwn ? colors.bubbleSelf : colors.bubbleOther,
            borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
            borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
          },
        ]}
      >
        <Text style={styles.errorText}>
          {isVideo ? '🎬' : '🖼'} Impossible de charger
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.container,
        {
          borderBottomRightRadius: isOwn ? borderRadius.sm : borderRadius.lg,
          borderBottomLeftRadius: !isOwn ? borderRadius.sm : borderRadius.lg,
        },
      ]}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.9} disabled={!onPress}>
        <Image
          source={{ uri: imageUrl }}
          style={[
            styles.image,
            {
              width: displayWidth,
              height: displayHeight,
            },
          ]}
          resizeMode="cover"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />

        {/* Overlay vidéo */}
        {isVideo && (
          <View style={styles.videoOverlay}>
            <View style={styles.playButtonBg}>
              <Text style={styles.playIcon}>▶️</Text>
            </View>
          </View>
        )}

        {/* Loading shimmer */}
        {!isLoaded && (
          <View
            style={[
              styles.loadingOverlay,
              { width: displayWidth, height: displayHeight },
            ]}
          >
            <Text style={styles.loadingText}>⏳</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Caption */}
      {caption && (
        <View style={[styles.captionContainer, { backgroundColor: isOwn ? colors.bubbleSelf : colors.bubbleOther }]}>
          <Text
            style={[
              styles.captionText,
              { color: isOwn ? colors.bubbleSelfText : colors.bubbleOtherText },
            ]}
          >
            {caption}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
  },
  image: {
    borderRadius: borderRadius.lg,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.lg,
  },
  playButtonBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.lg,
  },
  loadingText: {
    fontSize: 24,
  },
  captionContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  captionText: {
    ...typography.body,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  errorText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
