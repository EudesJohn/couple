// ============================================================
// ScreenHeader — en-tête d'écran secondaire (galerie, appels…)
// Bouton retour + titre + actions optionnelles
// Design Burgundy & Gold
// ============================================================
import { colors, borderRadius, spacing } from '../../constants/theme';
import { BackIcon } from '../Icons';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${spacing.md}px ${spacing.lg}px`,
      backgroundColor: colors.surface,
      borderBottom: `1px solid ${colors.borderLight}`,
      flexShrink: 0,
      gap: spacing.md,
    }}>
      <button
        onClick={onBack}
        aria-label="Retour"
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.surfaceAlt,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexShrink: 0,
          transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
        onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)'; }}
        onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        <BackIcon size={20} color={colors.primary} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: colors.text, letterSpacing: -0.3 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>

      {right && <div style={{ display: 'flex', gap: spacing.sm, flexShrink: 0 }}>{right}</div>}
    </div>
  );
}
