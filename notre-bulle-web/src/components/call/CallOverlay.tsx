// ============================================================
// CallOverlay — superposition flottante (PiP) pour les appels
// Apparaît quand un appel est actif et que l'utilisateur n'est
// pas sur l'écran plein écran /call.
//
// DRAGGABLE — pointer events pour déplacer l'overlay
// (comportement natif PiP mobile)
//
// ATTENTION : tous les hooks sont appelés avant le return,
// y compris les useEffects et useCallbacks, pour ne pas violer
// les Règles des Hooks (pas d'early return avant les hooks).
// ============================================================
import { useRef, useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCall } from '../../hooks/useCall';
import { getWebRTCStreams, setOnRemoteStreamReady } from '../../lib/zego';
import { colors, borderRadius } from '../../constants/theme';
import {
  MicIcon, MicOffIcon, PhoneOffIcon, VideoIcon, FlipCameraIcon,
} from '../Icons';
import { setPipVideoElement, requestPictureInPicture, exitPictureInPicture, isPiPSupported } from '../../lib/zego';

// ==========================================
// FORMATAGE DURÉE D'APPEL
// ==========================================
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// STATUS TEXTS
// ==========================================
const statusTexts: Record<string, string> = {
  calling: 'Appel en cours…',
  ringing: 'Sonnerie…',
  connecting: 'Connexion…',
  connected: '', // displays duration
  ended: 'Appel terminé',
};

// ==========================================
// BOUTON DE CONTRÔLE MINIATURE
// ==========================================
function MiniControlBtn({
  onClick,
  danger,
  children,
  label,
}: {
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={onClick}
        aria-label={label}
        style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: danger ? colors.error : 'rgba(255,255,255,0.1)',
          border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }}
      >
        {children}
      </motion.button>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

// ==========================================
// OVERLAY PRINCIPAL
// ==========================================
export default function CallOverlay() {
  // ─── TOUS LES HOOKS AVANT TOUT RETOUR CONDITIONNEL ───
  const location = useLocation();
  const navigate = useNavigate();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    callState, callType, callDuration, isMuted,
    toggleMute, endCall,
  } = useCall();

  // ==========================================
  // DRAG STATE (refs pour éviter re-renders)
  // ==========================================
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const _dragOffset = useRef({ x: 0, y: 0 });
  const _isDragging = useRef(false);
  const _dragStart = useRef({ x: 0, y: 0 });
  const _dragStartOffset = useRef({ x: 0, y: 0 });
  const _hasMoved = useRef(false);
  const overlayWidth = useRef(0);

  // Ref callback pour mesurer la largeur dès le montage
  // (plus fiable que useEffect + offsetWidth sur ref)
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node && overlayWidth.current === 0) {
      overlayWidth.current = node.offsetWidth;
    }
  }, []);

  // Callback immédiat pour le flux distant
  useEffect(() => {
    setOnRemoteStreamReady((stream) => {
      setRemoteStream(stream);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
    });
    return () => setOnRemoteStreamReady(null);
  }, []);

  // Fallback polling pour le flux distant (rattrapage)
  useEffect(() => {
    const interval = setInterval(() => {
      const streams = getWebRTCStreams();
      if (streams.remote && remoteVideoRef.current && remoteVideoRef.current.srcObject !== streams.remote) {
        remoteVideoRef.current.srcObject = streams.remote;
        setRemoteStream(streams.remote);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Attacher le flux à la ref vidéo (miniature overlay)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ==========================================
  // PiP — attacher le flux distant à l'élément
  // vidéo PiP et enregistrer la référence
  // ==========================================
  useEffect(() => {
    const el = pipVideoRef.current;
    if (el && remoteStream) {
      el.srcObject = remoteStream;
    }
    setPipVideoElement(el);

    // Quand l'utilisateur ferme la fenêtre PiP (bouton X ou retour),
    // on le ramène vers l'écran d'appel si l'appel est toujours actif
    const onLeavePip = () => {
      if (callState === 'connected') {
        navigate('/call');
      }
    };
    el?.addEventListener('leavepictureinpicture', onLeavePip);

    return () => {
      setPipVideoElement(null);
      el?.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [remoteStream, callState, navigate]);

  // Sortir du PiP quand l'appel se termine
  useEffect(() => {
    if (callState === 'idle' || callState === 'ended') {
      exitPictureInPicture();
    }
  }, [callState]);

  // Clamp les offsets pour rester dans la fenêtre
  const clampOffset = useCallback((x: number, y: number) => {
    const w = overlayWidth.current || 300;
    const maxX = Math.max(0, window.innerWidth - w - 16);
    const minX = -(window.innerWidth - w - 16);
    const maxY = 60;
    const minY = -(window.innerHeight - 160);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    _isDragging.current = true;
    _hasMoved.current = false;
    _dragStart.current = { x: e.clientX, y: e.clientY };
    _dragStartOffset.current = { ..._dragOffset.current };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!_isDragging.current) return;

    const dx = e.clientX - _dragStart.current.x;
    const dy = e.clientY - _dragStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 5) _hasMoved.current = true;

    const clamped = clampOffset(
      _dragStartOffset.current.x + dx,
      _dragStartOffset.current.y + dy,
    );
    _dragOffset.current = clamped;
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
    }
  }, [clampOffset]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!_isDragging.current) return;
    _isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    const final = { ..._dragOffset.current };
    setDragOffset(final);

    if (!_hasMoved.current && callState !== 'ended') {
      navigate('/call');
    }
  }, [callState, navigate]);

  // ─── LOGIQUE CONDITIONNELLE (ne change pas le nombre de hooks) ───
  const isOnCallScreen = location.pathname === '/call';
  const isVideo = callType === 'video';
  const notIdle = ['calling', 'ringing', 'connecting', 'connected', 'ended'].includes(callState);
  const statusLabel = statusTexts[callState] || '';
  const showDuration = callState === 'connected';
  const statusLine = showDuration ? formatDuration(callDuration) : statusLabel;

  // ─── PAS DE RETURN ANTICIPÉ — on utilise AnimatePresence pour
  //     contrôler l'affichage, ce qui préserve le nombre de hooks ───
  const pipSupported = isPiPSupported();
  const pipActive = typeof document !== 'undefined' && !!document.pictureInPictureElement;

  return (
    <>
      {/* Élément vidéo PiP — toujours présent dans le DOM tant que
          l'appel vidéo est actif. Positionné hors-écran (1×1 px,
          transparent). C'est sur CET élément que requestPictureInPicture()
          est appelé, ce qui crée une vraie fenêtre flottante OS.
          Ne doit PAS être dans AnimatePresence car il doit survivre
          au démontage de CallScreen. */}
      {notIdle && isVideo && (
        <video
          ref={pipVideoRef}
          autoPlay
          playsInline
          muted
          disablePictureInPicture={false}
          style={{
            position: 'fixed',
            width: 1, height: 1,
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
      )}

      {pipActive && isVideo && notIdle && (
        <div style={{
          position: 'fixed', top: 16, left: 16, zIndex: 9999,
          display: 'flex', gap: 8,
        }}>
          <MiniControlBtn
            onClick={(e) => { e.stopPropagation(); exitPictureInPicture(); }}
            label="Plein écran"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FAFAF9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </MiniControlBtn>
          <MiniControlBtn
            onClick={(e) => { e.stopPropagation(); endCall(); }}
            danger
            label="Raccrocher"
          >
            <PhoneOffIcon size={14} color="#FAFAF9" />
          </MiniControlBtn>
        </div>
      )}

      <AnimatePresence>
        {!isOnCallScreen && notIdle && (
        <motion.div
          ref={setContainerRef}
          initial={{ y: 100, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 22, stiffness: 250 }}
          exit={{ y: 100, opacity: 0, scale: 0.9 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 9999,
            backgroundColor: 'rgba(13, 10, 16, 0.96)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: borderRadius.xl,
            border: `1px solid ${isVideo ? 'rgba(160, 82, 45, 0.4)' : 'rgba(202, 138, 4, 0.3)'}`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${colors.glowBurgundy}`,
            overflow: 'hidden',
            cursor: 'grab',
            maxWidth: 380,
            margin: '0 auto',
            transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Barre de progression d'appel */}
          {callState === 'ended' && (
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, ${colors.accent}, ${colors.error})`,
            }} />
          )}
          {callState === 'connected' && (
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent}, ${colors.primary})`,
              backgroundSize: '200% 100%',
            }} />
          )}

          {/* Indicateur de drag (poignée) */}
          <div
            style={{
              display: 'flex', justifyContent: 'center', paddingTop: 4,
              opacity: 0.4,
            }}
          >
            <div style={{
              width: 32, height: 3, borderRadius: 1.5,
              backgroundColor: 'rgba(255,255,255,0.3)',
            }} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 14px 10px',
              gap: 10,
            }}
          >
            {/* Icône / miniature vidéo */}
            {isVideo ? (
              <div
                style={{
                  width: 56, height: 56, borderRadius: 12, overflow: 'hidden',
                  backgroundColor: '#1A1120', flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.1)',
                  position: 'relative',
                }}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    opacity: remoteStream ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    transform: 'scaleX(-1)',
                  }}
                />
                {(!remoteStream || callState !== 'connected') && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backgroundColor: '#1A1120',
                  }}>
                    <VideoIcon size={18} color="rgba(255,255,255,0.3)" />
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: 22,
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentDark})`,
                flexShrink: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
              }}>
                <div style={{ transform: 'rotate(135deg)', display: 'flex' }}>
                  <PhoneOffIcon size={18} color="#FAFAF9" />
                </div>
              </div>
            )}

            {/* Infos appel */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: callState === 'ended' ? colors.textSecondary : '#FAFAF9',
              }}>
                {callState === 'ended' ? 'Appel terminé' : `Appel ${isVideo ? 'vidéo' : 'audio'}`}
              </div>
              <div style={{
                fontSize: 12,
                color: callState === 'connected' ? colors.accent : colors.textTertiary,
                marginTop: 1,
              }}>
                {statusLine}
              </div>
            </div>

            {/* Contrôles — stopPropagation pour ne pas drag/naviguer */}
            {callState !== 'ended' && (
              <div onClick={(e) => e.stopPropagation()} style={{
                display: 'flex', gap: 6, flexShrink: 0,
              }}>
                <MiniControlBtn
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  label={isMuted ? 'Micro' : 'Micro'}
                >
                  {isMuted
                    ? <MicOffIcon size={14} color={colors.error} />
                    : <MicIcon size={14} color="#FAFAF9" />
                  }
                </MiniControlBtn>

                {isVideo && pipSupported && (
                  <MiniControlBtn
                    onClick={(e) => { e.stopPropagation(); requestPictureInPicture(); }}
                    label="PiP"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={pipActive ? colors.accent : '#FAFAF9'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <rect x="11" y="9" width="11" height="8" rx="1" />
                    </svg>
                  </MiniControlBtn>
                )}

                <MiniControlBtn
                  onClick={(e) => { e.stopPropagation(); endCall(); }}
                  danger
                  label="Raccrocher"
                >
                  <PhoneOffIcon size={14} color="#FAFAF9" />
                </MiniControlBtn>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
