// ============================================================
// SwipeToReply — Balayer un message vers la droite pour répondre
// Web: utilise pointer events au lieu de react-native-gesture-handler
// Design Burgundy & Gold, animations Framer Motion
// ============================================================
import { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ReplyIcon } from '../Icons';
import { colors, borderRadius, spacing } from '../../constants/theme';

interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  style?: React.CSSProperties;
}

const SWIPE_THRESHOLD = 60;

export function SwipeToReply({ children, onReply, style }: SwipeToReplyProps) {
  const x = useMotionValue(0);
  const [swiped, setSwiped] = useState(false);

  const springX = useSpring(x, { damping: 18, stiffness: 180 });

  // Révélation du bouton Répondre sur la gauche de la bulle :
  // apparaît quand la bulle glisse vers la droite (x 0 → 120).
  const reveal = useTransform(x, [0, 120], [0, 1]);
  const btnOpacity = useTransform(x, [0, 80], [0, 1]);

  const startXRef = useRef(0);
  const isSwipingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    isSwipingRef.current = true;
    // Capturer le pointer : on continue de recevoir les pointermove/up
    // même quand le doigt/cursor sort de l'élément pendant le drag.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* non supporté → on continue sans capture */ }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isSwipingRef.current) return;
    const dx = e.clientX - startXRef.current;
    // Seulement vers la droite (positif)
    if (dx < -10) { x.set(0); return; }
    const limited = Math.min(dx, 120);
    x.set(limited);
  };

  const finishSwipe = (trigger: boolean) => {
    if (!isSwipingRef.current) return;
    isSwipingRef.current = false;
    if (trigger && x.get() > SWIPE_THRESHOLD) {
      setSwiped(true);
      onReply();
    }
    x.set(0);
    setTimeout(() => setSwiped(false), 300);
  };

  // Fin du gesture : pointerup ou pointercancel → on décide.
  const handlePointerUp = (e: React.PointerEvent) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    finishSwipe(true);
  };

  // Le pointer "sort" de l'élément : on ne réinitialise PAS pendant un
  // drag (grâce à la capture, ce cas ne devrait presque plus arriver).
  // Si le gesture est déjà terminé, c'est un no-op grâce au guard.
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (!isSwipingRef.current) return;
    // Le doigt/cursor est sorti sans pointerup (ex. scroll interrompu) :
    // on garde la position mais on n'annule pas le gesture en cours.
  };

  return (
    <div style={{ position: 'relative', overflow: 'visible', touchAction: 'pan-y', ...style }}>
      {/* Bouton Répondre révélé derrière la bulle, côté gauche */}
      <motion.div
        style={{
          position: 'absolute',
          left: spacing.md,
          top: 0, bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
          width: 48,
          opacity: btnOpacity,
          scale: reveal,
        }}
      >
        <ReplyIcon size={18} color={colors.primary} />
        <span style={{ fontSize: 10, fontWeight: 600, color: colors.primary }}>Répondre</span>
      </motion.div>

      {/* Message swipable */}
      <motion.div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => finishSwipe(false)}
        onPointerLeave={handlePointerLeave}
        style={{ x: springX, cursor: 'grab', userSelect: 'none', touchAction: 'pan-y' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
