// ============================================================
// DownloadPlaceholder — Média verrouillé derrière un bouton de
// téléchargement (style WhatsApp).
// ------------------------------------------------------------------
// Affiche une zone grisée avec un bouton fléché "Télécharger".
// Tant que l'utilisateur n'a pas tapé, le média n'est pas chargé.
// États : prêt → téléchargement (spinner) → erreur (réessayer).
// ============================================================
import { colors, borderRadius, spacing } from '../../constants/theme';
import { DownloadIcon } from '../Icons';

interface DownloadPlaceholderProps {
  label: string;
  downloading: boolean;
  error?: boolean;
  width: number | string;
  height: number | string;
  onDownload: () => void;
  borderRadiusValue?: string | number;
  style?: React.CSSProperties;
}

export function DownloadPlaceholder({
  label,
  downloading,
  error,
  width,
  height,
  onDownload,
  borderRadiusValue,
  style,
}: DownloadPlaceholderProps) {
  // Couleurs neutres : fonctionne sur les bulles blanches (reçues)
  // comme sur les bulles burgundy (envoyées).
  const fg = colors.primary;
  const circleBg = '#FFFFFF';

  return (
    <div
      onClick={downloading ? undefined : onDownload}
      role="button"
      aria-label={`Télécharger ${label}`}
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        cursor: downloading ? 'default' : 'pointer',
        backgroundColor: colors.surfaceAlt2,
        borderRadius: borderRadiusValue ?? 0,
        color: fg,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      {downloading ? (
        <>
          <div style={{
            width: 26, height: 26,
            border: `2px solid ${colors.border}`,
            borderTopColor: fg,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>
            Téléchargement…
          </span>
        </>
      ) : error ? (
        <>
          <DownloadIcon size={22} color={fg} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Réessayer</span>
        </>
      ) : (
        <>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: circleBg,
            boxShadow: '0 2px 8px rgba(28,25,23,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DownloadIcon size={20} color={fg} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>
            {label}
          </span>
        </>
      )}
    </div>
  );
}
