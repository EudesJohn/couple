// ============================================================
// Hook — Messages (Supabase + Realtime)
// Pas de cache local (web)
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia, compressImage } from '../lib/media';
import { config } from '../constants/config';
import { notifyNewMessage } from './useNotifications';
import type { MessageWithDetails, Message, MessageType, Attachment, MessageStatus } from '../types/database';

interface UseMessagesReturn {
  messages: MessageWithDetails[];
  sendText: (content: string, replyToId?: string) => Promise<void>;
  sendVoice: (uri: string, durationMs: number) => Promise<void>;
  sendImage: (uri: string, mimeType: string, width: number, height: number) => Promise<void>;
  isLoading: boolean;
  myProfileId: string | null;
  error: string | null;
}

export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<MessageWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const myProfileIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(true);
  const initStartedRef = useRef(false);

  // ==========================================
  // Récupération des IDs
  // ==========================================
  const getConvId = useCallback(async (): Promise<string | null> => {
    if (convIdRef.current) return convIdRef.current;

    const { data, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .limit(1)
      .single();

    if (data?.id) {
      convIdRef.current = data.id;
      return data.id;
    }

    if (convError) console.warn('Erreur chargement conversation:', convError.message);
    return null;
  }, []);

  const getMyProfileId = useCallback(async (): Promise<string | null> => {
    if (myProfileIdRef.current) return myProfileIdRef.current;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('supabase_uid', user.id)
          .single();

        if (profile) {
          setMyProfileId(profile.id);
          myProfileIdRef.current = profile.id;
          return profile.id;
        }
      }
    } catch (err) {
      console.warn('Auth Supabase non disponible, fallback ID config');
    }

    const fallbackId = config.myProfileId;
    if (fallbackId) {
      myProfileIdRef.current = fallbackId;
      setMyProfileId(fallbackId);
      return fallbackId;
    }

    return null;
  }, []);

  // ==========================================
  // CHARGEMENT : Supabase → Realtime
  // ==========================================
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let mounted = true;
    let cleanupChannels: (() => void) | null = null;

    const init = async () => {
      const convId = await getConvId();
      if (!convId) {
        if (mounted) {
          setError('Aucune conversation trouvée');
          setIsLoading(false);
          isLoadingRef.current = false;
        }
        return;
      }

      const profileId = await getMyProfileId();

      // Charger les messages depuis Supabase
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
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true })
          .limit(100);

        if (mounted) {
          if (data) {
            setMessages(data as unknown as MessageWithDetails[]);
          }
          if (msgError) {
            console.warn('Erreur chargement messages:', msgError.message);
            setError(msgError.message);
          }
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      } catch (err) {
        if (mounted) {
          console.warn('Erreur sync Supabase:', err);
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }

      // Realtime: nouveaux messages
      const msgChannel = supabase
        .channel('messages:realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${convId}`,
          },
          async (payload) => {
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

            if (!mounted || !details) return;

            const fullMsg = details as unknown as MessageWithDetails;

            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMsg.id)) return prev;
              return [...prev, fullMsg];
            });

            // Notification si message du partenaire
            const isOwn = fullMsg.sender_id === myProfileIdRef.current;
            if (!isOwn && myProfileIdRef.current) {
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

      // Realtime: statuts
      const statusChannel = supabase
        .channel('messages:status')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_status' },
          (payload) => {
            if (!mounted) return;
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

      cleanupChannels = () => {
        supabase.removeChannel(msgChannel);
        supabase.removeChannel(statusChannel);
      };
    };

    init().catch((err) => {
      console.error('Erreur init messages:', err);
      if (mounted) {
        setError('Erreur de chargement');
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    });

    return () => {
      mounted = false;
      cleanupChannels?.();
    };
  }, [getConvId, getMyProfileId]);

  // ==========================================
  // Créer un message
  // ==========================================
  const createMessage = useCallback(async (
    type: MessageType,
    content: string | null,
    attachmentData?: { storage_path: string; mime_type: string; file_size?: number; duration_ms?: number; width?: number; height?: number },
    replyToId?: string | null,
  ): Promise<boolean> => {
    const convId = await getConvId();
    const profileId = myProfileId || config.myProfileId;
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
    const statusSent: Partial<MessageStatus> = {
      message_id: msg.id,
      profile_id: profileId,
      status: 'sent',
    };
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
  }, [getConvId, myProfileId]);

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

  // --- ENVOI IMAGE ---
  const sendImage = useCallback(async (uri: string, mimeType: string, width: number, height: number) => {
    try {
      const compressedUri = await compressImage(uri);
      const result = await uploadMedia('MEDIA', compressedUri, 'image/jpeg');
      await createMessage('image', null, {
        storage_path: result.path,
        mime_type: 'image/jpeg',
        width,
        height,
        file_size: 0,
      });
    } catch (err: any) {
      console.error('Erreur envoi image:', err);
      const msg = err?.message || err?.error_description || "Erreur lors de l'envoi de l'image";
      setError(msg);
    }
  }, [createMessage]);

  return {
    messages, sendText, sendVoice, sendImage,
    isLoading, myProfileId, error,
  };
}
