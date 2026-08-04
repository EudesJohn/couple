// ============================================================
// Affiche une image stockée dans Supabase Storage
// Utilise downloadMedia() au lieu de getPublicUrl() pour
// fonctionner même si le bucket n'est pas public.
//
// Verrouillage WhatsApp : si requireDownload est vrai, l'image
// reste derrière un bouton "Télécharger" jusqu'au tap.
// ============================================================
import { useDownloadGate } from '../../hooks/useDownloadGate';
import { DownloadPlaceholder } from './DownloadPlaceholder';
import { colors } from '../../constants/theme';

interface StorageImageProps {
  storagePath: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  /** Appelé quand l'utilisateur clique sur l'image (ouvrir lightbox) */
  onClick?: () => void;
  /** Bloque l'affichage derrière un bouton Télécharger (style WhatsApp) */
  requireDownload?: boolean;
}

export function StorageImage({ storagePath, alt = '', style, className, onClick, requireDownload }: StorageImageProps) {
  const { blobUrl, downloading, error, startDownload } = useDownloadGate(storagePath, !!requireDownload);

  const w = typeof style?.width === 'number' ? style.width : 240;
  const h = typeof style?.height === 'number' ? style.height : 200;

  // Verrouillé : bouton de téléchargement (style WhatsApp)
  if (requireDownload && !blobUrl) {
    return (
      <DownloadPlaceholder
        label="Télécharger la photo"
        downloading={downloading}
        error={error}
        width={w}
        height={h}
        onDownload={startDownload}
      />
    );
  }

  if (error) {
    return (
      <div style={{
        width: w, height: h,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        color: colors.textTertiary,
        fontSize: 13,
        ...style,
      }}>
        Image non disponible
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div style={{
        width: w, height: h,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        ...style,
      }}>
        <div style={{
          width: 24, height: 24,
          border: `2px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      className={className}
      loading="lazy"
      onClick={onClick}
    />
  );
}
