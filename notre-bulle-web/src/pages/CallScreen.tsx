// ============================================================
// Appel premium — Audio / Vidéo (WebRTC)
// Design Burgundy & Gold, animations Framer Motion
// ============================================================
import { useRef, useCallback, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getWebRTCStreams, setOnRemoteStreamReady } from '../lib/zego';
import { colors, borderRadius } from '../constants/theme';
import { useCall } from '../hooks/useCall';
import {
  HeartFilledIcon, UserIcon, MicIcon, MicOffIcon,
  VolumeIcon, PhoneOffIcon, VideoIcon,
} from '../components/Icons';

// ==========================================
// BOUTON DE CONTRÔLE AVEC ANIMATION
// ==========================================
function ControlBtn({
  onPress, active, danger,
  children, label,
}: {
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onPress}
      aria-label={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        borderRadius: 20, padding: '8px 4px', minWidth: 72,
        backgroundColor: danger
          ? colors.error
          : active
            ? 'rgba(202, 138, 4, 0.2)'
            : 'rgba(255,255,255,0.08)',
        border: active ? `1.5px solid ${colors.accent}` : '1px solid transparent',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 24,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        backgroundColor: active ? 'rgba(202, 138, 4, 0.15)' : 'rgba(255,255,255,0.06)',
      }}>
        {children}
      </div>
      <span style={{ fontSize: 11, color: active ? colors.accent : 'rgba(255,255,255,0.6)', fontWeight: 500, textAlign: 'center' }}>
        {label}
      </span>
    </motion.button>
  );
}

function EndCallBtn({ onPress }: { onPress: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onPress}
      aria-label="Raccrocher"
      style={{
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.error,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        border: 'none', cursor: 'pointer',
        boxShadow: `0 4px 12px ${colors.error}66`,
      }}
    >
      <PhoneOffIcon size={22} color="#FAFAF9" />
    </motion.button>
  );
}

function PulsingRing({ isCalling }: { isCalling: boolean }) {
  return (
    <div style={{
      width: 200, height: 200,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      marginBottom: 32, position: 'relative',
    }}>
      {isCalling && (
        <>
          <motion.div
            animate={{ opacity: [0.1, 0.25, 0.1], scale: [1, 1.3, 1] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
            style={{
              position: 'absolute', width: 200, height: 200, borderRadius: 100,
              border: `2px solid ${colors.primary}`,
            }}
          />
          <motion.div
            animate={{ opacity: [0.05, 0.15, 0.05], scale: [1, 1.4, 1] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
            style={{
              position: 'absolute', width: 200, height: 200, borderRadius: 100,
              border: `2px solid ${colors.primary}`,
            }}
          />
          <motion.div
            animate={{ opacity: [0.3, 0.25, 0.3], scale: [1, 1.3, 1] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', width: 200, height: 200, borderRadius: 100,
              border: `2px solid ${colors.primary}`,
            }}
          />
        </>
      )}
      <div style={{
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: '#1A1120',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        border: `1.5px solid rgba(124, 45, 18, 0.4)`,
        boxShadow: `0 0 30px ${colors.glowBurgundy}`,
        position: 'relative', zIndex: 1,
      }}>
        <HeartFilledIcon size={56} color={colors.accent} />
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function CallScreen() {
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || 'caller';
  const routeType = searchParams.get('type') || 'audio';

  // Web: refs pour éléments vidéo
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const {
    callState, callType, callDuration, isMuted, isSpeakerOn,
    toggleMute, toggleSpeakerFn, endCall,
  } = useCall();

  const [webRTCStreams, setWebRTCStreams] = useState<{ local: MediaStream | null; remote: MediaStream | null }>({ local: null, remote: null });

  // Web: callback immédiat quand le flux distant arrive (évite le polling 500ms
  // qui cause des sauts d'image sur mobile — le flux est attaché dès l'événement ontrack)
  useEffect(() => {
    setOnRemoteStreamReady((stream) => {
      // Attacher immédiatement le flux à l'élément DOM
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
      // Mettre à jour l'état React pour le rendu
      setWebRTCStreams((prev) => {
        if (prev.remote === stream) return prev;
        return { ...prev, remote: stream };
      });
    });
    return () => setOnRemoteStreamReady(null);
  }, []);

  // Web: fallback polling basse fréquence pour le cas où le flux existe déjà
  // au moment du montage du composant (rate limiter évite les reassignations intempestives)
  useEffect(() => {
    let lastLocal: MediaStream | null = null;
    let lastRemote: MediaStream | null = null;
    let idleTicks = 0;

    const interval = setInterval(() => {
      const streams = getWebRTCStreams();

      // Rattrapage si le flux distant n'a pas encore été attaché par le callback
      if (remoteVideoRef.current && streams.remote && remoteVideoRef.current.srcObject !== streams.remote) {
        remoteVideoRef.current.srcObject = streams.remote;
      }
      if (localVideoRef.current && streams.local && localVideoRef.current.srcObject !== streams.local) {
        localVideoRef.current.srcObject = streams.local;
      }

      // Mise à jour de l'état React seulement si changement effectif
      if (streams.local !== lastLocal || streams.remote !== lastRemote) {
        lastLocal = streams.local;
        lastRemote = streams.remote;
        setWebRTCStreams({ local: streams.local, remote: streams.remote });
        idleTicks = 0;
      } else {
        idleTicks++;
        // Arrêter le polling après 30 ticks sans changement (30s)
        if (idleTicks > 60) {
          clearInterval(interval);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = webRTCStreams.local;
  }, [webRTCStreams.local]);

  useEffect(() => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.srcObject = webRTCStreams.remote;
  }, [webRTCStreams.remote]);

  const isVideo = callType === 'video' || routeType === 'video';
  const isConnected = callState === 'connected';
  const isCalling = callState === 'calling' || callState === 'ringing';

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
    <div style={{
      height: '100vh',
      backgroundColor: '#0D0A10',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Fond vidéo */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {isVideo && (
          <div style={{ position: 'absolute', inset: 0 }}>
            {/* Vidéo distante — toujours montée pour éviter le saut d'image */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: isConnected && webRTCStreams.remote ? 1 : 0,
                transition: 'opacity 0.3s ease',
              }}
            />
            {/* Placeholder superposé tant que le flux n'est pas prêt */}
            {(!isConnected || !webRTCStreams.remote) && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                backgroundColor: '#1A1120',
              }}>
                <HeartFilledIcon size={80} color={colors.accent} />
              </div>
            )}
          </div>
        )}
        {isVideo && !isConnected && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        )}

        {/* PiP local — vidéo toujours montée */}
        {isVideo && (
          <div style={{
            position: 'absolute', top: 60, right: 16,
            width: 120, height: 180, borderRadius: 16, overflow: 'hidden',
            border: `2px solid rgba(255,255,255,0.2)`,
            boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: isConnected && webRTCStreams.local ? 1 : 0,
                transition: 'opacity 0.3s ease',
                transform: 'scaleX(-1)', // Miroir : gauche→gauche, droite→droite
              }}
            />
            {(!isConnected || !webRTCStreams.local) && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                backgroundColor: '#2D1B36',
              }}>
                <UserIcon size={28} color="rgba(255,255,255,0.4)" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* APPEL AUDIO */}
      {!isVideo && (
        <>
          {/* Élément audio caché pour jouer le flux distant */}
          <audio ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 120 }}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center',
              padding: '0 40px',
              position: 'relative', zIndex: 1,
            }}
          >
            <PulsingRing isCalling={isCalling} />
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#FAFAF9', marginBottom: 8, letterSpacing: -0.5 }}>
              Ma chérie
            </h1>
            <motion.span
              key={callState}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              style={{ fontSize: 15, color: statusColor, textAlign: 'center' }}
            >
              {statusText}
            </motion.span>
          </motion.div>
        </>
      )}

      {/* TIMER VIDÉO */}
      {isVideo && (
        <div style={{
          position: 'absolute', top: 100, left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          zIndex: 2,
        }}>
          <motion.span
            key={callState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            style={{
              fontSize: 18, fontWeight: 600, color: statusColor,
              backgroundColor: 'rgba(0,0,0,0.4)',
              padding: '6px 20px', borderRadius: 20,
            }}
          >
            {statusText}
          </motion.span>
        </div>
      )}

      {/* OVERLAY APPEL EN COURS */}
      <AnimatePresence>
        {isCalling && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              display: 'flex', justifyContent: 'center',
              paddingTop: 'calc(60px + env(safe-area-inset-top, 0px))',
              zIndex: 2,
            }}
          >
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
              {role === 'caller' ? 'Appel en cours…' : 'Appel entrant…'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTRÔLES */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
          backgroundColor: 'rgba(13, 10, 16, 0.85)',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          zIndex: 2,
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 24,
        }}>
          <ControlBtn onPress={toggleMute} active={isMuted} label={isMuted ? 'Micro coupé' : 'Micro'}>
            {isMuted ? <MicOffIcon size={20} color={colors.error} /> : <MicIcon size={20} color="#FAFAF9" />}
          </ControlBtn>

          <ControlBtn onPress={toggleSpeakerFn} active={isSpeakerOn} label={isSpeakerOn ? 'Haut-parleur' : 'Écouteur'}>
            <VolumeIcon size={20} color={isSpeakerOn ? colors.accent : '#FAFAF9'} />
          </ControlBtn>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <EndCallBtn onPress={endCall} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500, textAlign: 'center' }}>
              Raccrocher
            </span>
          </div>

          {isVideo && (
            <ControlBtn onPress={() => {}} active label="Vidéo">
              <VideoIcon size={20} color={colors.accent} />
            </ControlBtn>
          )}
        </div>
      </motion.div>
    </div>
  );
}
