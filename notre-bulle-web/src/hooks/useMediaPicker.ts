// ============================================================
// Hook — Galerie / Caméra pour images et vidéos (Web)
// Utilise <input type="file"> (API web native)
// ============================================================
import { useState, useCallback } from 'react';

interface MediaResult {
  uri: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs?: number;
  fileSize?: number;
}

interface UseMediaPickerReturn {
  pickImage: () => Promise<MediaResult | null>;
  /** Ouvre le sélecteur natif en mode MULTI (plusieurs photos d'un coup) */
  pickImages: () => Promise<MediaResult[] | null>;
  takePhoto: () => Promise<MediaResult | null>;
  pickVideo: () => Promise<MediaResult | null>;
  isLoading: boolean;
  error: string | null;
}

// Ouvre un <input type="file"> et résout avec TOUS les fichiers choisis
// ([] si annulé). `multiple: true` autorise la sélection de plusieurs photos.
function pickFiles(accept: string, multiple: boolean, capture?: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (multiple) input.multiple = true;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      document.body.removeChild(input);
      resolve(files);
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve([]);
    };

    input.click();
  });
}

function fileToMediaResult(file: File): MediaResult {
  const uri = URL.createObjectURL(file);
  const mimeType = file.type || 'image/jpeg';
  return {
    uri,
    mimeType,
    width: 0,
    height: 0,
    fileSize: file.size,
  };
}

// Charge les dimensions réelles de l'image depuis l'URL objet
function loadImageSize(result: MediaResult): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      result.width = img.width;
      result.height = img.height;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = result.uri;
  });
}

export function useMediaPicker(): UseMediaPickerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = useCallback(async (): Promise<MediaResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const files = await pickFiles('image/*', false);
      const file = files[0] ?? null;
      if (!file) return null;

      const result = fileToMediaResult(file);
      await loadImageSize(result);

      return result;
    } catch (e) {
      setError("Erreur lors de la sélection de l'image");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pickImages = useCallback(async (): Promise<MediaResult[] | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const files = await pickFiles('image/*', true);
      if (files.length === 0) return null;

      const results: MediaResult[] = [];
      for (const file of files) {
        const result = fileToMediaResult(file);
        await loadImageSize(result);
        results.push(result);
      }

      return results;
    } catch (e) {
      setError('Erreur lors de la sélection des images');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const takePhoto = useCallback(async (): Promise<MediaResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const files = await pickFiles('image/*', false, 'environment');
      const file = files[0] ?? null;
      if (!file) return null;

      const result = fileToMediaResult(file);
      await loadImageSize(result);

      return result;
    } catch (e) {
      setError('Erreur lors de la prise de photo');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pickVideo = useCallback(async (): Promise<MediaResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const files = await pickFiles('video/*', false);
      const file = files[0] ?? null;
      if (!file) return null;

      const result = fileToMediaResult(file);

      // Obtenir la durée de la vidéo
      const video = document.createElement('video');
      const url = result.uri;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          result.durationMs = video.duration * 1000;
          result.width = video.videoWidth;
          result.height = video.videoHeight;
          resolve();
        };
        video.onerror = () => resolve();
        video.src = url;
      });
      // NE PAS revoke — l'URL est encore nécessaire pour uploadMedia() ensuite
      // (pickImage ne le fait pas non plus)

      return result;
    } catch (e) {
      setError("Erreur lors de la sélection de la vidéo");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { pickImage, pickImages, takePhoto, pickVideo, isLoading, error };
}
