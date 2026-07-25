// ============================================================
// Hook — Galerie / Caméra pour images et vidéos (Web)
// Utilise <input type="file"> au lieu d'expo-image-picker
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
  takePhoto: () => Promise<MediaResult | null>;
  pickVideo: () => Promise<MediaResult | null>;
  isLoading: boolean;
  error: string | null;
}

function pickFile(accept: string, capture?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}

function fileToMediaResult(file: File): MediaResult {
  const uri = URL.createObjectURL(file);
  const mimeType = file.type || 'image/jpeg';

  // Pour les images, on peut obtenir les dimensions
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');

  return {
    uri,
    mimeType,
    width: isImage ? 0 : isVideo ? 0 : 0,
    height: 0,
    fileSize: file.size,
  };
}

export function useMediaPicker(): UseMediaPickerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = useCallback(async (): Promise<MediaResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const file = await pickFile('image/*');
      if (!file) return null;

      const result = fileToMediaResult(file);

      // Obtenir les dimensions réelles de l'image
      const img = new Image();
      const url = result.uri;
      await new Promise<void>((resolve) => {
        img.onload = () => {
          result.width = img.width;
          result.height = img.height;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });

      return result;
    } catch (e) {
      setError("Erreur lors de la sélection de l'image");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const takePhoto = useCallback(async (): Promise<MediaResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const file = await pickFile('image/*', 'environment');
      if (!file) return null;

      const result = fileToMediaResult(file);

      const img = new Image();
      const url = result.uri;
      await new Promise<void>((resolve) => {
        img.onload = () => {
          result.width = img.width;
          result.height = img.height;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });

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
      const file = await pickFile('video/*');
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
      URL.revokeObjectURL(url);

      return result;
    } catch (e) {
      setError("Erreur lors de la sélection de la vidéo");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { pickImage, takePhoto, pickVideo, isLoading, error };
}
