// ============================================================
// 📞 Écran d'appel audio/vidéo — ZegoCloud
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet, findNodeHandle } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ZegoSurfaceView } from 'zego-express-engine-reactnative';
import { setPreviewView, setRemoteView } from '../../src/lib/zego';
import { colors, typography } from '../../src/constants/theme';
import { useCall } from '../../src/hooks/useCall';
import { useRef, useCallback } from 'react';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CallScreen() {
  const { role, type: routeType } = useLocalSearchParams<{
    callId: string;
    type: 'audio' | 'video';
    role: 'caller' | 'callee';
  }>();
  const insets = useSafeAreaInsets();

  const localVideoRef = useRef<typeof ZegoSurfaceView>(null);
  const remoteVideoRef = useRef<typeof ZegoSurfaceView>(null);

  const {
    callState,
    callType,
    callDuration,
    isMuted,
    isSpeakerOn,
    toggleMute,
    toggleSpeakerFn,
    endCall,
  } = useCall();

  const isVideo = callType === 'video' || routeType === 'video';
  const isConnected = callState === 'connected';
  const isCalling = callState === 'calling' || callState === 'ringing';

  // Enregistrer la vue locale pour la preview vidéo
  const handleLocalVideoLayout = useCallback(() => {
    const tag = findNodeHandle(localVideoRef.current as unknown as View);
    if (tag !== null) {
      setPreviewView({ reactTag: tag, viewMode: 1, backgroundColor: 0x000000 });
    }
  }, []);

  // Enregistrer la vue distante pour le playback vidéo
  const handleRemoteVideoLayout = useCallback(() => {
    const tag = findNodeHandle(remoteVideoRef.current as unknown as View);
    if (tag !== null) {
      setRemoteView({ reactTag: tag, viewMode: 1, backgroundColor: 0x1A1120 });
    }
  }, []);

  const statusColors: Record<string, string> = {
    calling: colors.textSecondary,
    ringing: colors.warning,
    connecting: colors.warning,
    connected: colors.success,
    ended: colors.error,
  };

  const statusTexts: Record<string, string> = {
    calling: 'Appel en cours…',
    ringing: 'Sonnerie…',
    connecting: 'Connexion…',
    connected: formatDuration(callDuration),
    ended: 'Appel terminé',
  };

  const statusColor = statusColors[callState] || colors.textSecondary;
  const statusText = statusTexts[callState] || '';

  return (
    <View style={styles.container}>
      {/* Fond vidéo */}
      <View style={styles.videoBackground}>
        {isVideo && (
          <View style={styles.remoteVideo}>
            {/* Vue de rendu distante Zego — affichée quand connectée */}
            {isConnected && (
              <ZegoSurfaceView
                ref={remoteVideoRef as any}
                onLayout={handleRemoteVideoLayout}
                style={StyleSheet.absoluteFill}
              />
            )}
            {/* Placeholder tant que le flux distant n'est pas actif */}
            {!isConnected && (
              <View style={styles.remoteVideoPlaceholder}>
                <Text style={styles.remoteVideoEmoji}>💕</Text>
              </View>
            )}
          </View>
        )}

        {/* Gradient overlay — seulement sur le placeholder */}
        {isVideo && !isConnected && <View style={styles.overlay} />}

        {/* PiP local (appel vidéo seulement) */}
        {isVideo && (
          <View style={styles.localVideo}>
            {isConnected && (
              <ZegoSurfaceView
                ref={localVideoRef as any}
                onLayout={handleLocalVideoLayout}
                style={StyleSheet.absoluteFill}
              />
            )}
            {!isConnected && (
              <View style={styles.localVideoPlaceholder}>
                <Text style={styles.localVideoEmoji}>👤</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Appel audio — grande photo + infos */}
      {!isVideo && (
        <View style={styles.audioContent}>
          <View style={styles.audioAvatarRing}>
            <View style={styles.audioAvatarBg}>
              <Text style={styles.audioAvatarEmoji}>💕</Text>
            </View>
          </View>
          <Text style={styles.partnerName}>Ma chérie 💕</Text>
          <Text style={[styles.callStatus, { color: statusColor }]}>
            {statusText}
          </Text>
        </View>
      )}

      {/* Timer appel vidéo */}
      {isVideo && (
        <View style={styles.videoTimerContainer}>
          <Text style={[styles.videoTimer, { color: statusColor }]}>
            {statusText}
          </Text>
        </View>
      )}

      {/* Contrôles d'appel */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.controlsRow}>
          {/* Mute */}
          <TouchableOpacity
            onPress={toggleMute}
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          >
            <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
            <Text style={styles.controlLabel}>
              {isMuted ? 'Micro coupé' : 'Micro'}
            </Text>
          </TouchableOpacity>

          {/* Haut-parleur */}
          <TouchableOpacity
            onPress={toggleSpeakerFn}
            style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
          >
            <Text style={styles.controlIcon}>{isSpeakerOn ? '🔊' : '🔉'}</Text>
            <Text style={styles.controlLabel}>
              {isSpeakerOn ? 'Haut-parleur' : 'Écouteur'}
            </Text>
          </TouchableOpacity>

          {/* Raccrocher */}
          <TouchableOpacity onPress={endCall} style={[styles.controlButton, styles.endCallButton]}>
            <Text style={styles.endCallIcon}>📞</Text>
            <Text style={[styles.controlLabel, { color: '#fff' }]}>Raccrocher</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlay "Appel en cours" */}
      {isCalling && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.callingOverlay, { paddingTop: insets.top + 100 }]}
        >
          <Text style={styles.callingText}>
            {role === 'caller' ? 'Appel en cours…' : 'Appel entrant…'}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1120',
  },
  videoBackground: {
    ...StyleSheet.absoluteFill,
  },
  remoteVideo: {
    flex: 1,
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2D1B36',
  },
  remoteVideoEmoji: {
    fontSize: 80,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  localVideo: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 120,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  localVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3D2B46',
  },
  localVideoEmoji: {
    fontSize: 32,
  },
  audioContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  audioAvatarRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 10,
  },
  audioAvatarBg: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioAvatarEmoji: {
    fontSize: 56,
  },
  partnerName: {
    ...typography.heading,
    color: '#fff',
    marginBottom: 8,
  },
  callStatus: {
    ...typography.body,
    textAlign: 'center',
  },
  videoTimerContainer: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  videoTimer: {
    ...typography.subheading,
    fontSize: 18,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  controlButton: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(232, 160, 180, 0.3)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  controlIcon: {
    fontSize: 22,
  },
  controlLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  endCallButton: {
    backgroundColor: colors.callRed,
    paddingHorizontal: 20,
  },
  endCallIcon: {
    fontSize: 22,
    color: '#fff',
    transform: [{ rotate: '135deg' }],
  },
  callingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  callingText: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
  },
});
