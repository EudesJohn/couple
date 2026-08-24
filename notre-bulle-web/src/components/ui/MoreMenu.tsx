// ============================================================
// MoreMenu — menu « ⋯ » réutilisable (groupe les actions secondaires)
// Fermeture au clic extérieur, touche Échap, ou après sélection
// Design Burgundy & Gold
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, borderRadius, spacing } from '../../constants/theme';
import { MoreIcon } from '../Icons';

export interface MoreMenuItem {
  label: string;
  icon: React.FC<{ size: number; color: string }>;
  color?: string;
  onClick: () => void;
}

interface MoreMenuProps {
  items: MoreMenuItem[];
  ariaLabel?: string;
}

export function MoreMenu({ items, ariaLabel = 'Plus d\'options' }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer au clic extérieur
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Bouton ⋯ */}
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        style={{
          width: 38, height: 38, borderRadius: 19,
          backgroundColor: open ? colors.surfaceDim : colors.surfaceAlt,
          border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          transition: 'background-color 0.15s ease',
        }}
      >
        <MoreIcon size={18} color={colors.textSecondary} />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 100,
              minWidth: 220,
              backgroundColor: colors.surface,
              borderRadius: borderRadius.lg,
              boxShadow: `0 8px 24px ${colors.shadowStrong}`,
              border: `1px solid ${colors.borderLight}`,
              overflow: 'hidden',
              padding: spacing.xs,
            }}
          >
            {items.map((item, i) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: spacing.md,
                  width: '100%', padding: `${spacing.md}px ${spacing.md}px`,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                  borderRadius: borderRadius.md,
                  transition: 'background-color 0.12s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.surfaceAlt; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <item.icon size={17} color={item.color ?? colors.textSecondary} />
                <span style={{ fontSize: 15, color: colors.text, fontWeight: 500 }}>
                  {item.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
