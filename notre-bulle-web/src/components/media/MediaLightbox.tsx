// ============================================================
// Lightbox média — visualisation plein écran (image / vidéo)
// Overlay sombre, fermeture au clic ou touche Échap
// Animation Framer Motion à l'ouverture/fermeture
// ============================================================
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MediaLightboxProps {
  open: boolean;
  /** blob URL ou src de l'image/vidéo */
  src: string | null;
  /** 'image' | 'video' */
  type?: 'image' | 'video';
  mimeType?: string;
  onClose: () => void;
}

export function MediaLightbox({ open, src, type = 'image', mimeType, onClose }: MediaLightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fermeture avec la touche Échap
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Mettre en pause la vidéo quand on ferme
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={onClose}
        >
          {/* Bouton fermer */}
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: 16, right: 16, zIndex: 10,
              width: 40, height: 40, borderRadius: 20,
              border: 'none', cursor: 'pointer',
              backgroundColor: 'rgba(0,0,0,0.5)',
              color: '#FAFAF9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, lineHeight: 1,
              backdropFilter: 'blur(4px)',
            }}
          >
            ✕
          </button>

          {/* Image plein écran */}
          {type === 'image' && (
            <motion.img
              key="lightbox-image"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25 }}
              src={src}
              alt=""
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '92vw',
                maxHeight: '92vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}
            />
          )}

          {/* Vidéo plein écran */}
          {type === 'video' && (
            <motion.div
              key="lightbox-video"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '95vw',
                maxHeight: '95vh',
              }}
            >
              <video
                ref={videoRef}
                src={src}
                controls
                autoPlay
                playsInline
                style={{
                  maxWidth: '100%',
                  maxHeight: '90vh',
                  borderRadius: 8,
                  boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                }}
              />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
