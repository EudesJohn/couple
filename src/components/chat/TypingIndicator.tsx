import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  withDelay,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, borderRadius, spacing, typography } from '../../constants/theme';

interface TypingIndicatorProps {
  name: string;
}

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withDelay(
        delay,
        withTiming(1, { duration: 400 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: colors.textTertiary,
        },
        animatedStyle,
      ]}
    />
  );
}

export function TypingIndicator({ name }: TypingIndicatorProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.bubbleOther,
          borderRadius: borderRadius.lg,
          borderBottomLeftRadius: borderRadius.sm,
        }}
      >
        <Dot delay={0} />
        <Dot delay={200} />
        <Dot delay={400} />
      </View>
    </View>
  );
}
