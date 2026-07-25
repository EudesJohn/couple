// ============================================================
// SwipeToReply — Balayer un message vers la gauche pour répondre
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
}

const SWIPE_THRESHOLD = -60;

export function SwipeToReply({ children, onReply }: SwipeToReplyProps) {
  const x = useMotionValue(0);
  const [swiped, setSwiped] = useState(false);

  const springX = useSpring(x, { damping: 18, stiffness: 180 });

  const reveal = useTransform(x, [-120, 0], [1, 0]);
  const btnOpacity = useTransform(x, [-80, 0], [1, 0]);

  const startXRef = useRef(0);
  const isSwipingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    isSwipingRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isSwipingRef.current) return;
    const dx = e.clientX - startXRef.current;
    // Seulement vers la gauche
    if (dx > 10) { x.set(0); return; }
    const limited = Math.max(dx, -120);
    x.set(limited);
  };

  const handlePointerUp = () => {
    isSwipingRef.current = false;
    if (x.get() < SWIPE_THRESHOLD) {
      setSwiped(true);
      onReply();
    }
    x.set(0);
    setTimeout(() => setSwiped(false), 300);
  };

  return (
    <div style={{ position: 'relative', overflow: 'visible', touchAction: 'pan-y' }}>
      {/* Bouton Répondre révélé derrière */}
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
        onPointerLeave={handlePointerUp}
        style={{ x: springX, cursor: 'grab', userSelect: 'none' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
