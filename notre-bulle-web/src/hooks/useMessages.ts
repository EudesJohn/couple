// ============================================================
// Hook — Messages (Supabase + Realtime)
// Pas de cache local (web)
//
// NOMS DE CHANNEL UNIQUES : chaque mount StrictMode reçoit un
// nom différent pour contourner la réutilisation de channel par
// RealtimeClient.channel() (qui ne retire pas les channels de
// this.channels[] après removeChannel/teardown)
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia, compressImage } from '../lib/media';
import { cacheMessages, getCachedMessages, addCachedMessage } from '../lib/cache';
import { getMyProfileId as getProfileId } from '../lib/profile';
import { notifyNewMessage } from './useNotifications';
import type { MessageWithDetails, Message, MessageType, Attachment, MessageStatus } from '../types/database';

let msgMountId = 0;

interface UseMessagesReturn {
  messages: MessageWithDetails[];
  sendText: (content: string, replyToId?: string) => Promise<void>;
  sendVoice: (uri: string, durationMs: number) => Promise<void>;
  sendImage: (uri: string, mimeType: string, width: number, height: number) => Promise<void>;
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number | null;
  myProfileId: string | null;
  error: string | null;
}

export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<MessageWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const myProfileIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(true);

  // ==========================================
  // Récupération de l'ID du profil
  // ==========================================
  const getMyProfileId = useCallback(async (): Promise<string | null> => {
    if (myProfileIdRef.current) return myProfileIdRef.current;

    const id = getProfileId();
    if (id) {
      myProfileIdRef.current = id;
      setMyProfileId(id);
      return id;
    }

    return null;
  }, []);

  // ==========================================
  // EFFET 1 — Chargement des données (async)
  // ==========================================
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 1. ID du profil
      const profileId = await getMyProfileId();

      // 2. Récupérer la conversation
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .limit(1)
        .single();

      if (!mounted) return;

      if (convError || !convData?.id) {
        console.warn('Erreur chargement conversation:', convError?.message);
        if (mounted) {
          setError('Aucune conversation trouvée');
          setIsLoading(false);
          isLoadingRef.current = false;
        }
        return;
      }

      const loadedConvId = convData.id;

      // 3a. Cache local d'abord — affichage instantané
      try {
        const cached = await getCachedMessages(loadedConvId);
        if (mounted && cached.length > 0) {
          setMessages(cached);
        }
      } catch {
        // Le cache peut échouer silencieusement (IndexedDB désactivé, etc.)
      }

      // 3b. Synchronisation Supabase en arrière-plan
      try {
        const { data, error: msgError } = await supabase
          .from('messages')
          .select(`
            *,
            sender:profiles!sender_id(id, display_name, avatar_url),
            attachments(*),
            statuses:message_status(*),
            reply_to_message:messages!reply_to(id, content, type)
          `)
          .eq('conversation_id', loadedConvId)
          .order('created_at', { ascending: true })
          .limit(100);

        if (mounted) {
          if (data) {
            const fetched = data as unknown as MessageWithDetails[];
            setMessages(fetched);
            // Mettre à jour le cache avec les données fraîches
            cacheMessages(loadedConvId, fetched).catch(() => {});
          }
          if (msgError) {
            console.warn('Erreur chargement messages:', msgError.message);
            setError(msgError.message);
          }
          setIsLoading(false);
          isLoadingRef.current = false;
          // Déclencher l'effet 2 (Realtime) avec le convId chargé
          setConvId(loadedConvId);
        }
      } catch (err) {
        if (mounted) {
          console.warn('Erreur sync Supabase:', err);
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [getMyProfileId]);

  // ==========================================
  // EFFET 2 — Souscription Realtime (noms UNIQUES)
  // Déclenché une fois le convId connu.
  // Chaque mount reçoit des noms de channel différents
  // (...:realtime:1, ...:status:1 puis ...:realtime:2, ...:status:2)
  // pour contourner la réutilisation de RealtimeClient.channel()
  // ==========================================
  useEffect(() => {
    if (!convId) return;

    const mid = ++msgMountId;
    const msgChannel = supabase
      .channel(`messages:realtime:${mid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        async (payload: any) => {
          const newMsg = payload.new as Message;

          // Éviter les doublons
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return prev;
          });

          // Récupérer les détails complets
          const { data: details } = await supabase
            .from('messages')
            .select(`
              *,
              sender:profiles!sender_id(id, display_name, avatar_url),
              attachments(*),
              statuses:message_status(*)
            `)
            .eq('id', newMsg.id)
            .single();

          if (!details) return;

          const fullMsg = details as unknown as MessageWithDetails;

          setMessages((prev) => {
            if (prev.some((m) => m.id === fullMsg.id)) return prev;
            return [...prev, fullMsg];
          });

          // Mettre en cache le nouveau message pour les prochains montages
          addCachedMessage(fullMsg).catch(() => {});

          // Notification si message du partenaire (sauf journaux d'appel)
          const isOwn = fullMsg.sender_id === myProfileIdRef.current;
          if (!isOwn && myProfileIdRef.current && fullMsg.type !== 'call') {
            try {
              await supabase.from('message_status').upsert({
                message_id: fullMsg.id,
                profile_id: myProfileIdRef.current,
                status: 'delivered',
              }, { onConflict: 'message_id,profile_id' });

              const senderName = fullMsg.sender?.display_name || 'Partenaire';
              const content = fullMsg.type === 'text' ? fullMsg.content : null;
              await notifyNewMessage(senderName, content, convId);
            } catch {
              // Silencieux
            }
          }
        }
      )
      .subscribe();

    const statusChannel = supabase
      .channel(`messages:status:${mid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_status' },
        (payload: any) => {
          const updatedStatus = payload.new as MessageStatus;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== updatedStatus.message_id) return msg;
              const existingStatuses = msg.statuses || [];
              const idx = existingStatuses.findIndex(
                (s) => s.profile_id === updatedStatus.profile_id
              );
              let newStatuses = [...existingStatuses];
              if (idx >= 0) {
                newStatuses[idx] = updatedStatus;
              } else {
                newStatuses.push(updatedStatus);
              }
              return { ...msg, statuses: newStatuses };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(statusChannel);
    };
  }, [convId]);

  // ==========================================
  // Créer un message
  // ==========================================
  const createMessage = useCallback(async (
    type: MessageType,
    content: string | null,
    attachmentData?: { storage_path: string; mime_type: string; file_size?: number; duration_ms?: number; width?: number; height?: number },
    replyToId?: string | null,
  ): Promise<boolean> => {
    const profileId = myProfileId || getProfileId();
    if (!convId || !profileId) return false;

    // Insérer dans Supabase
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: profileId,
        content,
        type,
        reply_to: replyToId || null,
      })
      .select()
      .single();

    if (msgError || !msg) {
      console.warn('Erreur création message:', msgError?.message);
      return false;
    }

    // Créer le statut "sent"
    await supabase.from('message_status').insert({
      message_id: msg.id,
      profile_id: profileId,
      status: 'sent',
    });

    // Créer l'attachment si présent
    if (attachmentData) {
      await supabase.from('attachments').insert({
        message_id: msg.id,
        storage_path: attachmentData.storage_path,
        mime_type: attachmentData.mime_type,
        file_size: attachmentData.file_size ?? null,
        duration_ms: attachmentData.duration_ms ?? null,
        width: attachmentData.width ?? null,
        height: attachmentData.height ?? null,
      });
    }

    return true;
  }, [convId, myProfileId]);

  // --- ENVOI TEXTE ---
  const sendText = useCallback(async (content: string, replyToId?: string) => {
    await createMessage('text', content, undefined, replyToId);
  }, [createMessage]);

  // --- ENVOI NOTE VOCALE ---
  const sendVoice = useCallback(async (uri: string, durationMs: number) => {
    try {
      const result = await uploadMedia('VOICE_NOTES', uri, 'audio/webm');
      await createMessage('voice', null, {
        storage_path: result.path,
        mime_type: 'audio/webm',
        duration_ms: durationMs,
      });
    } catch (err) {
      console.error('Erreur envoi vocal:', err);
    }
  }, [createMessage]);

  // --- ENVOI IMAGE (avec progression) ---
  const sendImage = useCallback(async (uri: string, mimeType: string, width: number, height: number) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const compressedUri = await compressImage(uri);
      setUploadProgress(10); // compression faite
      const result = await uploadMedia('MEDIA', compressedUri, 'image/jpeg', (p) => {
        setUploadProgress(10 + Math.round(p * 0.85)); // 10% → 95%
      });
      setUploadProgress(95);
      await createMessage('image', null, {
        storage_path: result.path,
        mime_type: 'image/jpeg',
        width,
        height,
        file_size: 0,
      });
      setUploadProgress(100);
    } catch (err: any) {
      console.error('Erreur envoi image:', err);
      const msg = err?.message || err?.error_description || "Erreur lors de l'envoi de l'image";
      setError(msg);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  }, [createMessage]);

  // --- ENVOI VIDÉO (pas de compression, progression) ---
  const sendVideo = useCallback(async (uri: string, mimeType: string, width: number, height: number, durationMs?: number) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const result = await uploadMedia('MEDIA', uri, mimeType, (p) => {
        setUploadProgress(Math.round(p * 0.95)); // 0% → 95%
      });
      setUploadProgress(95);
      await createMessage('video', null, {
        storage_path: result.path,
        mime_type: mimeType,
        width,
        height,
        duration_ms: durationMs, // undefined → omis par la DB
        file_size: 0,
      });
      setUploadProgress(100);
    } catch (err: any) {
      console.error('Erreur envoi vidéo:', err);
      const msg = err?.message || err?.error_description || "Erreur lors de l'envoi de la vidéo";
      setError(msg);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  }, [createMessage]);

  return {
    messages, sendText, sendVoice, sendImage,
    isLoading, isUploading, uploadProgress, myProfileId, error,
  };
}
