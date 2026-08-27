// ============================================================
// Bannière d'appel entrant — superposée sur n'importe quel écran
// Équivalent mobile de notre-bulle-web/src/components/call/IncomingCallBanner.tsx
// Décrocher (vert) / Rejeter (rouge), animations Reanimated.
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors } from '../../constants/theme';
import { useCall } from '../../hooks/useCall';
import { callStore } from '../../lib/callStore';
import { useIncomingCallSound } from '../../hooks/useIncomingCallSound';
import { PhoneIcon, VideoIcon, PhoneOffIcon } from '../Icons';

function PulsingButton({ onPress, color, children }: {
  onPress: () => void;
  color: string;
  children: React.ReactNode;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.12, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={style}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.actionBtn, { backgroundColor: color }]}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function IncomingCallBanner() {
  const { callState, incomingCall, callType, answerCall, rejectCall } = useCall();

  const visible = callState === 'ringing' && incomingCall !== null;
  // Sonnerie en boucle pendant que ça sonne (intégrée ou musique perso)
  useIncomingCallSound(visible);
  if (!visible) return null;

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutDown.duration(250)} style={styles.banner}>
      <View style={styles.iconCircle}>
        {callType === 'video'
          ? <VideoIcon size={20} color="#FAFAF9" />
          : <PhoneIcon size={20} color="#FAFAF9" />}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Appel{callType === 'video' ? ' vidéo' : ''} entrant…</Text>
        <Text style={styles.subtitle}>{callStore.getPartnerName()} t'appelle</Text>
      </View>

      <PulsingButton onPress={() => answerCall()} color="#25D366">
        <PhoneIcon size={22} color="#FAFAF9" />
      </PulsingButton>

      <TouchableOpacity onPress={() => rejectCall()} activeOpacity={0.85} style={[styles.actionBtn, { backgroundColor: '#E53935', transform: [{ rotate: '135deg' }] }]}>
        <PhoneOffIcon size={22} color="#FAFAF9" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#0D0A10',
    borderWidth: 1,
    borderColor: 'rgba(202, 138, 4, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 1000,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FAFAF9',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
