// ============================================================
// Appel premium — Audio / Vidéo (WebRTC)
// Design Burgundy & Gold, animations Framer Motion
//
// Vidéo : swap local/distant (comme WhatsApp)
// PiP local tappable, caméra avant/arrière
// ============================================================
import { useRef, useCallback, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getWebRTCStreams, setOnRemoteStreamReady, requestPictureInPicture, exitPictureInPicture, isPiPSupported } from '../lib/webrtc';
import { colors, borderRadius } from '../constants/theme';
import { useCall } from '../hooks/useCall';
import { useAuth } from '../hooks/useAuth';
import {
  HeartFilledIcon, UserIcon, MicIcon, MicOffIcon,
  VolumeIcon, PhoneOffIcon, FlipCameraIcon, VideoIcon,
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
      whileTap={{ scale: 0.94 }}
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
      whileTap={{ scale: 0.93 }}
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
// COMPOSANT PiP — carré vidéo en incrustation
// ==========================================
function PiPVideo({
  videoRef,
  stream,
  size,
  position,
  onClick,
  label,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  size: { width: number; height: number };
  position: React.CSSProperties;
  onClick?: () => void;
  label: string;
}) {
  const hasStream = !!stream;
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        ...position,
        width: size.width,
        height: size.height,
        borderRadius: size.width > 100 ? 16 : 12,
        overflow: 'hidden',
        border: `2px solid rgba(255,255,255,0.2)`,
        boxShadow: size.width > 100
          ? '0 0 20px rgba(0,0,0,0.5)'
          : '0 8px 16px rgba(0,0,0,0.4)',
        cursor: onClick ? 'pointer' : 'default',
        zIndex: size.width > 100 ? 5 : 10,
        transition: 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.3s ease',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={label === 'Vous'}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: hasStream ? 1 : 0,
          transition: 'opacity 0.3s ease',
          transform: 'scaleX(-1)',
        }}
      />
      {!hasStream && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backgroundColor: '#2D1B36',
        }}>
          <UserIcon size={size.width > 100 ? 40 : 20} color="rgba(255,255,255,0.4)" />
        </div>
      )}

      {/* Label en bas */}
      <div style={{
        position: 'absolute', bottom: 4, left: 4, right: 4,
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }}>
        {label}
      </div>
    </div>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function CallScreen() {
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || 'caller';
  const routeType = searchParams.get('type') || 'audio';
  const navigate = useNavigate();
  const { identity } = useAuth();
  // Nom du partenaire affiché pendant l'appel (celui qu'on appelle /
  // qui nous appelle) — selon l'identité, comme dans ChatLayout.
  const PARTNER_NAME = identity === 'woman' ? 'Mon chéri' : 'Ma chérie';

  // Web: refs pour éléments vidéo
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const {
    callState, callType, callDuration, isMuted, isSpeakerOn,
    toggleMute, toggleSpeakerFn, endCall, switchCamera, enableVideo,
  } = useCall();

  const [webRTCStreams, setWebRTCStreams] = useState<{ local: MediaStream | null; remote: MediaStream | null }>({ local: null, remote: null });

  // État de swap vidéo : qui est en plein écran ?
  const [videoFocused, setVideoFocused] = useState<'remote' | 'local'>('remote');

  // Web: callback immédiat quand le flux distant arrive
  useEffect(() => {
    setOnRemoteStreamReady((stream) => {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
      setWebRTCStreams((prev) => {
        if (prev.remote === stream) return prev;
        return { ...prev, remote: stream };
      });
    });
    return () => setOnRemoteStreamReady(null);
  }, []);

  // Web: fallback polling basse fréquence
  useEffect(() => {
    let lastLocal: MediaStream | null = null;
    let lastRemote: MediaStream | null = null;
    let idleTicks = 0;

    const interval = setInterval(() => {
      const streams = getWebRTCStreams();

      if (remoteVideoRef.current && streams.remote && remoteVideoRef.current.srcObject !== streams.remote) {
        remoteVideoRef.current.srcObject = streams.remote;
      }
      if (localVideoRef.current && streams.local && localVideoRef.current.srcObject !== streams.local) {
        localVideoRef.current.srcObject = streams.local;
      }

      if (streams.local !== lastLocal || streams.remote !== lastRemote) {
        lastLocal = streams.local;
        lastRemote = streams.remote;
        setWebRTCStreams({ local: streams.local, remote: streams.remote });
        idleTicks = 0;
      } else {
        idleTicks++;
        if (idleTicks > 60) clearInterval(interval);
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

  // ─── Sortie d'appel : quitter /call quand l'appel se termine ───
  // Le store partagé passe à 'idle' dans tous les cas de fin : raccrochage
  // local (endCall), raccrochage du PARTENAIRE (UPDATE Realtime), échec WebRTC,
  // refus/annulation. Sans ce retour à /chat, on restait bloqué sur l'écran
  // d'appel quand c'est l'autre qui coupe.
  // Le guard prevCallStateRef :
  //   - ignore le montage initial si l'appel est déjà fini (pas de boucle),
  //   - évite la double navigation (endCall ne navigue plus lui-même).
  const prevCallStateRef = useRef(callState);
  useEffect(() => {
    if (callState === 'idle' && prevCallStateRef.current !== 'idle') {
      navigate('/chat', { replace: true });
    }
    prevCallStateRef.current = callState;
  }, [callState, navigate]);

  const isVideo = callType === 'video' || routeType === 'video';
  const isConnected = callState === 'connected';
  const isCalling = callState === 'calling' || callState === 'ringing';

  // Caméra locale déjà active ? Sinon le bouton caméra active la vidéo
  // (passage audio → vidéo à la volée, comme WhatsApp).
  const localHasVideo = (webRTCStreams.local?.getVideoTracks().length ?? 0) > 0;
  const handleCamera = () => {
    if (localHasVideo) switchCamera();
    else enableVideo();
  };

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

  // Déterminer quel flux est plein écran et quel flux est en PiP
  const fullscreenVideoRef = videoFocused === 'remote' ? remoteVideoRef : localVideoRef;
  const fullscreenStream = videoFocused === 'remote' ? webRTCStreams.remote : webRTCStreams.local;
  const pipVideoRef = videoFocused === 'remote' ? localVideoRef : remoteVideoRef;
  const pipStream = videoFocused === 'remote' ? webRTCStreams.local : webRTCStreams.remote;
  const pipLabel = videoFocused === 'remote' ? 'Vous' : 'Partenaire';

  return (
    <div style={{
      height: '100vh',
      backgroundColor: '#0D0A10',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Bouton minimiser */}
      <button
        onClick={() => {
          // Entrer en PiP avant de minimiser
          if (isConnected) {
            requestPictureInPicture();
          }
          navigate(-1);
        }}
        aria-label="Minimiser"
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 20,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FAFAF9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Fond vidéo */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {isVideo && (
          <>
            {/* Piste en plein écran */}
            <video
              ref={fullscreenVideoRef as React.RefObject<HTMLVideoElement>}
              autoPlay
              playsInline
              muted={videoFocused === 'local'}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: isConnected && fullscreenStream ? 1 : 0,
                transition: 'opacity 0.3s ease',
                transform: 'scaleX(-1)',
              }}
            />
            {(!isConnected || !fullscreenStream) && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                backgroundColor: '#1A1120',
              }}>
                <HeartFilledIcon size={80} color={colors.accent} />
              </div>
            )}

            {/* PiP (incrustation) — tappable pour swap */}
            <PiPVideo
              videoRef={pipVideoRef as React.RefObject<HTMLVideoElement>}
              stream={pipStream}
              size={
                videoFocused === 'remote'
                  ? { width: 120, height: 180 }
                  : { width: 120, height: 180 }
              }
              position={
                videoFocused === 'remote'
                  ? { top: 60, right: 16 }
                  : { top: 60, right: 16 }
              }
              onClick={() => setVideoFocused(v => v === 'remote' ? 'local' : 'remote')}
              label={pipLabel}
            />

            {/* Indicateur swap */}
            {isConnected && (
              <div style={{
                position: 'absolute', bottom: 100, left: 0, right: 0,
                display: 'flex', justifyContent: 'center', zIndex: 11,
              }}>
                <span style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.3)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  padding: '2px 10px', borderRadius: 10,
                }}>
                  Tapez la vignette pour inverser
                </span>
              </div>
            )}
          </>
        )}
        {isVideo && !isConnected && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        )}
      </div>

      {/* APPEL AUDIO */}
      {!isVideo && (
        <>
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
              {PARTNER_NAME}
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

          {/* Bouton caméra : active la vidéo si en appel audio, sinon
              bascule avant/arrière (comme WhatsApp). Toujours visible. */}
          <ControlBtn
            onPress={handleCamera}
            label={localHasVideo || isVideo ? 'Caméra' : 'Vidéo'}
          >
            {localHasVideo || isVideo
              ? <FlipCameraIcon size={20} color="#FAFAF9" />
              : <VideoIcon size={20} color={colors.accent} />
            }
          </ControlBtn>
        </div>
      </motion.div>
    </div>
  );
}
