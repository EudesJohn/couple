// ============================================================
// Hook — Galerie / Caméra pour images et vidéos
// ============================================================
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

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

export function useMediaPicker(): UseMediaPickerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demander les permissions
  const requestGalleryPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        'Nous avons besoin d\'accéder à ta galerie pour partager des photos 💕'
      );
      return false;
    }
    return true;
  }, []);

  const requestCameraPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        'Nous avons besoin d\'accéder à ta caméra pour prendre des photos 📸'
      );
      return false;
    }
    return true;
  }, []);

  // Choisir une image depuis la galerie
  const pickImage = useCallback(async (): Promise<MediaResult | null> => {
    const granted = await requestGalleryPermission();
    if (!granted) return null;

    setIsLoading(true);
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]) return null;

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize ?? undefined,
      };
    } catch (e) {
      setError('Erreur lors de la sélection de l\'image');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [requestGalleryPermission]);

  // Prendre une photo
  const takePhoto = useCallback(async (): Promise<MediaResult | null> => {
    const granted = await requestCameraPermission();
    if (!granted) return null;

    setIsLoading(true);
    setError(null);

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]) return null;

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize ?? undefined,
      };
    } catch (e) {
      setError('Erreur lors de la prise de photo');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [requestCameraPermission]);

  // Choisir une vidéo
  const pickVideo = useCallback(async (): Promise<MediaResult | null> => {
    const granted = await requestGalleryPermission();
    if (!granted) return null;

    setIsLoading(true);
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]) return null;

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'video/mp4',
        width: asset.width,
        height: asset.height,
        durationMs: asset.duration ?? undefined,
        fileSize: asset.fileSize ?? undefined,
      };
    } catch (e) {
      setError('Erreur lors de la sélection de la vidéo');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [requestGalleryPermission]);

  return { pickImage, takePhoto, pickVideo, isLoading, error };
}
