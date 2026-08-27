// ============================================================
// Appel premium — Audio / Vidéo (Web + Mobile)
// Web: WebRTC via media elements, Mobile: Zego native
// Design Burgundy & Gold, animations fluides
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet, Platform, AppState } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  useSharedValue,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useRef, useCallback, useState, useEffect } from 'react';
import { isZegoAvailable, getWebRTCStreams, setOnRemoteStreamReady, getRTCView, streamToUrl } from '../../src/lib/zego';
import { colors, typography, borderRadius } from '../../src/constants/theme';
import { useCall } from '../../src/hooks/useCall';
import { callStore } from '../../src/lib/callStore';
import {
  HeartFilledIcon, UserIcon, MicIcon, MicOffIcon,
  VolumeIcon, PhoneOffIcon, VideoIcon,
} from '../../src/components/Icons';
import { getActualPartnerProfileId } from '../../src/lib/profile';
import { Image } from 'react-native';

const isWeb = Platform.OS === 'web';

// Module natif PiP (Android) — fenêtre flottante au-dessus des autres applis.
// Indisponible (web / iOS) → null et on ignore silencieusement.
let CallPipModule: any = null;
if (!isWeb && Platform.OS === 'android') {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    CallPipModule = requireNativeModule('NotreBulleCall');
  } catch {}
}

// ==========================================
// BOUTON DE CONTRÔLE AVEC ANIMATION SPRING
// ==========================================
function ControlBtn({
  onPress,
  active,
  danger,
  children,
  label,
}: {
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.85, { damping: 12, stiffness: 200 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 150 }); }}
        activeOpacity={1}
        style={[styles.controlBtn, {
          borderWidth: active ? 1.5 : 0,
          borderColor: active ? colors.accent : 'transparent',
          backgroundColor: danger ? colors.error : active ? 'rgba(202, 138, 4, 0.2)' : 'rgba(255,255,255,0.08)',
        }]}
      >
        <View style={[styles.controlIconWrap, active && { backgroundColor: 'rgba(202, 138, 4, 0.15)' }, danger && { backgroundColor: 'rgba(220, 38, 38, 0.15)' }]}>
          {children}
        </View>
        <Text style={[styles.controlLabel, active && { color: colors.accent }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function EndCallBtn({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ shadowOpacity: 0.3 + pulse.value * 0.5, shadowRadius: 8 + pulse.value * 16 }));

  return (
    <Animated.View style={pulseStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.88); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        activeOpacity={1}
        style={[styles.endCallBtn, { transform: [{ scale: scale.value }] }]}
      >
        <PhoneOffIcon size={22} color="#FAFAF9" />
      </TouchableOpacity>
    </Animated.View>
  );
}

function PulsingRing({ isCalling, avatar }: { isCalling: boolean; avatar?: string | null }) {
  const ring1 = useSharedValue(0.3);
  const ring2 = useSharedValue(0.05);
  const ring3 = useSharedValue(0.0);

  useEffect(() => {
    if (isCalling) {
      ring1.value = withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1, true);
      ring2.value = withDelay(600, withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(0.05, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1, true));
      ring3.value = withDelay(1200, withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(0.0, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1, true));
    } else {
      ring1.value = withTiming(0, { duration: 300 });
      ring2.value = withTiming(0, { duration: 300 });
      ring3.value = withTiming(0, { duration: 300 });
    }
  }, [isCalling]);

  const r1 = useAnimatedStyle(() => ({ opacity: ring1.value * 0.25, transform: [{ scale: 1 + ring1.value * 0.3 }] }));
  const r2 = useAnimatedStyle(() => ({ opacity: ring2.value * 0.15, transform: [{ scale: 1 + ring2.value * 0.4 }] }));
  const r3 = useAnimatedStyle(() => ({ opacity: ring3.value * 0.10, transform: [{ scale: 1 + ring3.value * 0.5 }] }));

  return (
    <View style={styles.ringContainer}>
      <Animated.View style={[styles.ring, r3]} />
      <Animated.View style={[styles.ring, r2]} />
      <Animated.View style={[styles.ring, r1]} />
      <View style={styles.ringCore}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: 120, height: 120, borderRadius: 60 }} />
        ) : (
          <HeartFilledIcon size={56} color={colors.accent} />
        )}
      </View>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// RENDU DU FLUX — RTCView (mobile) / <video> (web)
// ==========================================
function RemoteVideo({
  stream,
  mirrored,
  style,
}: {
  stream: MediaStream | null;
  mirrored?: boolean;
  style?: any;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isWeb && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  // Mobile natif → RTCView
  const RTCViewCmp = getRTCView();
  if (RTCViewCmp) {
    const url = streamToUrl(stream);
    if (!url) return null;
    return (
      <RTCViewCmp
        streamURL={url}
        objectFit="cover"
        zOrder={0}
        mirror={mirrored ? 1 : 0}
        style={[StyleSheet.absoluteFill, { borderRadius: 0 }]}
      />
    );
  }

  // Web → élément <video>
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={mirrored}
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirrored ? 'scaleX(-1)' : undefined }}
    />
  );
}


// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function CallScreen() {
  const { role, type: routeType } = useLocalSearchParams<{ callId: string; type: 'audio' | 'video'; role: 'caller' | 'callee' }>();
  const insets = useSafeAreaInsets();

  const { callState, callType, callDuration, isMuted, isSpeakerOn, incomingCall,
    toggleMute, toggleSpeakerFn, endCall, switchCamera,
  } = useCall();

  // Nom du partenaire depuis le callStore (chargé depuis profiles.display_name)
  const partnerName = callStore.getPartnerName();
  const displayName = partnerName || 'Partenaire';
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const pid = await getActualPartnerProfileId();
        if (!pid) return;
        const { supabase } = await import('../../src/lib/supabase');
        const { data } = await supabase.from('profiles').select('avatar_url').eq('id', pid).single();
        if (data?.avatar_url) {
          const { getSignedMediaUrl } = await import('../../src/lib/media');
          const url = await getSignedMediaUrl(data.avatar_url);
          setPartnerAvatar(url);
        }
      } catch {}
    })();
  }, []);

  const [webRTCStreams, setWebRTCStreams] = useState<{ local: MediaStream | null; remote: MediaStream | null }>({ local: null, remote: null });

  // Réf de l'état connecté (pour le handler AppState / PiP)
  const isConnectedRef = useRef(false);
  useEffect(() => {
    isConnectedRef.current = callState === 'connected';
  }, [callState]);

  // Web + Mobile: callback immédiat quand le flux distant arrive
  useEffect(() => {
    setOnRemoteStreamReady((stream) => {
      setWebRTCStreams((prev) => (prev.remote === stream ? prev : { ...prev, remote: stream }));
    });
    return () => setOnRemoteStreamReady(null);
  }, []);

  // Web: attacher les flux vidéo aux éléments <video>
  useEffect(() => {
    if (!isWeb) return;
    const interval = setInterval(() => {
      const streams = getWebRTCStreams();
      if (streams.local !== webRTCStreams.local || streams.remote !== webRTCStreams.remote) {
        setWebRTCStreams({ local: streams.local, remote: streams.remote });
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const isVideo = callType === 'video' || routeType === 'video';
  const isConnected = callState === 'connected';
  const isCalling = callState === 'calling' || callState === 'ringing';

  // PiP : pendant un appel vidéo connecté, si l'utilisateur quitte l'app,
  // la vidéo passe en fenêtre flottante au-dessus des autres applis
  // (comme WhatsApp) via onUserLeaveHint natif. Fallback : AppState.
  useEffect(() => {
    if (isWeb) return;
    const wantPip = !!(isVideo && isConnected);
    try { CallPipModule?.setAutoPip?.(wantPip); } catch {}
    if (!wantPip) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      try { CallPipModule?.enterPip?.(); } catch { /* PiP indisponible */ }
    });
    return () => sub.remove();
  }, [isVideo, isConnected]);

  // Sécurité : désactiver le drapeau PiP au démontage de l'écran d'appel
  useEffect(() => {
    return () => {
      try { CallPipModule?.setAutoPip?.(false); } catch {}
    };
  }, []);

  const statusColors: Record<string, string> = {
    calling: colors.textSecondary, ringing: colors.warning,
    connecting: colors.warning, connected: colors.success, ended: colors.error,
  };
  const statusTexts: Record<string, string> = {
    calling: 'Appel en cours…', ringing: 'Sonnerie…',
    connecting: 'Connexion…', connected: formatDuration(callDuration), ended: 'Appel terminé',
  };

  const statusColor = statusColors[callState] || colors.textSecondary;
  const statusText = statusTexts[callState] || '';

  return (
    <View style={styles.container}>
      {/* Fond vidéo */}
      <View style={styles.videoBackground}>
        {isVideo && (
          <View style={styles.remoteVideo}>
            {isConnected && webRTCStreams.remote ? (
              <RemoteVideo stream={webRTCStreams.remote} />
            ) : (
              <View style={styles.remotePlaceholder}>
                {partnerAvatar ? (
                  <Image source={{ uri: partnerAvatar }} style={{ width: 120, height: 120, borderRadius: 60 }} />
                ) : (
                  <HeartFilledIcon size={80} color={colors.accent} />
                )}
              </View>
            )}
          </View>
        )}
        {isVideo && !isConnected && <View style={styles.overlay} />}

        {/* PiP local */}
        {isVideo && (
          <View style={styles.localVideo}>
            {isConnected && webRTCStreams.local ? (
              <RemoteVideo stream={webRTCStreams.local} mirrored />
            ) : (
              <View style={styles.localPlaceholder}>
                <UserIcon size={28} color="rgba(255,255,255,0.4)" />
              </View>
            )}
          </View>
        )}
      </View>

      {/* APPEL AUDIO */}
      {!isVideo && (
        <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.audioContent}>
          <PulsingRing isCalling={isCalling} avatar={partnerAvatar} />
          <Text style={styles.partnerName}>{displayName}</Text>
          <Animated.Text key={callState} entering={FadeIn.duration(200)} style={[styles.callStatus, { color: statusColor }]}>
            {statusText}
          </Animated.Text>
        </Animated.View>
      )}

      {/* TIMER VIDÉO */}
      {isVideo && (
        <View style={styles.videoTimerContainer}>
          <Animated.Text key={callState} entering={FadeIn.duration(200)} style={[styles.videoTimer, { color: statusColor }]}>
            {statusText}
          </Animated.Text>
        </View>
      )}

      {/* OVERLAY APPEL EN COURS */}
      {isCalling && (
        <Animated.View entering={FadeIn.duration(400)} style={[styles.callingOverlay, { paddingTop: insets.top + 100 }]}>
          <Text style={styles.callingText}>
            {role === 'caller' ? 'Appel en cours…' : 'Appel entrant…'}
          </Text>
        </Animated.View>
      )}

      {/* CONTRÔLES */}
      <Animated.View
        entering={FadeIn.duration(500).delay(300)}
        exiting={FadeOutDown.duration(300)}
        style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.controlsRow}>
          <ControlBtn onPress={toggleMute} active={isMuted} label={isMuted ? 'Micro coupé' : 'Micro'}>
            {isMuted ? <MicOffIcon size={20} color={colors.error} /> : <MicIcon size={20} color="#FAFAF9" />}
          </ControlBtn>

          <ControlBtn onPress={toggleSpeakerFn} active={isSpeakerOn} label={isSpeakerOn ? 'Haut-parleur' : 'Écouteur'}>
            <VolumeIcon size={20} color={isSpeakerOn ? colors.accent : '#FAFAF9'} />
          </ControlBtn>

          <View style={{ alignItems: 'center', gap: 6 }}>
            <EndCallBtn onPress={endCall} />
            <Text style={styles.endCallLabel}>Raccrocher</Text>
          </View>

          {isVideo && (
            <ControlBtn onPress={() => switchCamera()} label="Caméra">
              <VideoIcon size={20} color="#FAFAF9" />
            </ControlBtn>
          )}


        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0A10' },
  videoBackground: { ...StyleSheet.absoluteFill },
  remoteVideo: { flex: 1 },
  remotePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1120' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.3)' },
  localVideo: {
    position: 'absolute', top: 60, right: 16,
    width: 120, height: 180, borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  localPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2D1B36' },
  audioContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  ringContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 2, borderColor: colors.primary },
  ringCore: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#1A1120',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.glowBurgundy, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 10,
    borderWidth: 1.5, borderColor: 'rgba(124, 45, 18, 0.4)',
  },
  partnerName: { ...typography.heading, fontSize: 28, color: '#FAFAF9', marginBottom: 8, letterSpacing: -0.5 },
  callStatus: { ...typography.body, fontSize: 15, textAlign: 'center' },
  videoTimerContainer: { position: 'absolute', top: 100, left: 0, right: 0, alignItems: 'center' },
  videoTimer: {
    ...typography.subheading, fontSize: 18, backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20, overflow: 'hidden',
  },
  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 24,
    backgroundColor: 'rgba(13, 10, 16, 0.85)',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
  },
  controlsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 24 },
  controlBtn: { alignItems: 'center', gap: 6, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 6, minWidth: 76, backgroundColor: 'rgba(255,255,255,0.12)' },
  controlIconWrap: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  controlLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontWeight: '500' },
  endCallBtn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#E53935',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  endCallLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontWeight: '500' },
  callingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  callingText: { ...typography.body, color: 'rgba(255,255,255,0.7)', fontSize: 14 },
});
