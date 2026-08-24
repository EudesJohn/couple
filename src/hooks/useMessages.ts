// ============================================================
// Hook — Messages local-first (SQLite + Supabase)
// 1. SQLite → UI instantanée
// 2. Supabase → sync + temps réel
// Notifications sur messages entrants
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia, compressImage } from '../lib/media';
import { config } from '../constants/config';
import { getOwnProfileId } from '../lib/profile';
import {
  getMessages,
  insertMessage,
  updateMessageStatus,
  getConversationId as getLocalConvId,
  cacheConversation,
  getMessageById,
} from '../lib/localdb';
import { notifyNewMessage } from './useNotifications';
import type { MessageWithDetails, Message, MessageStatus, MessageType, Attachment } from '../types/database';

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
  // Récupération des IDs (cache SQLite + Supabase)
  // ==========================================
  const getConvId = useCallback(async (): Promise<string | null> => {
    if (convIdRef.current) return convIdRef.current;

    // 1. Essayer le cache local d'abord
    const localId = await getLocalConvId();
    if (localId) {
      convIdRef.current = localId;
      return localId;
    }

    // 2. Sinon Supabase
    const { data, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .limit(1)
      .single();

    if (data?.id) {
      await cacheConversation(data.id);
      convIdRef.current = data.id;
      return data.id;
    }

    if (convError) {
      console.warn('Erreur chargement conversation:', convError.message);
    }
    return null;
  }, []);

  const getMyProfileId = useCallback(async (): Promise<string | null> => {
    if (myProfileIdRef.current) return myProfileIdRef.current;

    // Utiliser l'identité stockée (femme/homme) pour résoudre le bon profil
    const ownId = await getOwnProfileId();
    if (ownId) {
      setMyProfileId(ownId);
      myProfileIdRef.current = ownId;
      return ownId;
    }

    // Fallback : premier profil configuré
    const fallbackId = config.myProfileId;
    if (fallbackId) {
      myProfileIdRef.current = fallbackId;
      setMyProfileId(fallbackId);
      return fallbackId;
    }

    return null;
  }, []);

  // ==========================================
  // CHARGEMENT : SQLite d'abord → Supabase ensuite
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

      // === PHASE 1 : SQLite → UI instantanée ===
      const localMessages = await getMessages(convId);
      if (mounted && localMessages.length > 0) {
        setMessages(localMessages);
        setIsLoading(false);
        isLoadingRef.current = false;
      }

      // === PHASE 2 : Supabase → compléter les messages manquants ===
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
            const remoteMessages = data as unknown as MessageWithDetails[];

            // Si on avait déjà des messages locaux, comparer
            if (localMessages.length > 0) {
              const localIds = new Set(localMessages.map((m) => m.id));
              const newMessages = remoteMessages.filter((m) => !localIds.has(m.id));
              const updatedMessages = remoteMessages; // Use remote as source of truth

              if (newMessages.length > 0) {
                // Ajouter les nouveaux à la liste
                setMessages(updatedMessages);

                // Les mettre en cache SQLite
                for (const msg of newMessages) {
                  const att = msg.attachments?.[0];
                  await insertMessage(
                    msg,
                    att
                      ? {
                          id: att.id,
                          message_id: msg.id,
                          storage_path: att.storage_path,
                          mime_type: att.mime_type,
                          file_size: att.file_size,
                          duration_ms: att.duration_ms,
                          width: att.width,
                          height: att.height,
                          thumbnail_path: att.thumbnail_path,
                          created_at: att.created_at,
                        }
                      : null,
                    msg.statuses
                  );
                }
              }
            } else {
              // Pas de cache local, utiliser Supabase directement
              setMessages(remoteMessages);

              // Mettre en cache SQLite
              for (const msg of remoteMessages) {
                const att = msg.attachments?.[0];
                await insertMessage(
                  msg,
                  att
                    ? {
                        id: att.id,
                        message_id: msg.id,
                        storage_path: att.storage_path,
                        mime_type: att.mime_type,
                        file_size: att.file_size,
                        duration_ms: att.duration_ms,
                        width: att.width,
                        height: att.height,
                        thumbnail_path: att.thumbnail_path,
                        created_at: att.created_at,
                      }
                    : null,
                  msg.statuses
                );
              }
            }
          }
          if (msgError) {
            console.warn('Erreur chargement messages:', msgError.message);
            if (localMessages.length === 0) {
              setError(msgError.message);
            }
          }
          // Arrêter le loader même si Supabase a échoué (on a les données SQLite)
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      } catch (err) {
        if (mounted) {
          console.warn('Erreur sync Supabase, utilisation du cache local');
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }

      // === PHASE 3 : Realtime ===
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

            // 1. Stocker dans SQLite
            const att = fullMsg.attachments?.[0];
            await insertMessage(
              fullMsg,
              att
                ? {
                    id: att.id,
                    message_id: fullMsg.id,
                    storage_path: att.storage_path,
                    mime_type: att.mime_type,
                    file_size: att.file_size,
                    duration_ms: att.duration_ms,
                    width: att.width,
                    height: att.height,
                    thumbnail_path: att.thumbnail_path,
                    created_at: att.created_at,
                  }
                : null,
              fullMsg.statuses
            );

            // 2. Ajouter à l'état React
            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMsg.id)) return prev;
              return [...prev, fullMsg];
            });

            // 3. Si c'est le message du partenaire → delivered + notification
            const isOwn = fullMsg.sender_id === myProfileIdRef.current;
            if (!isOwn && myProfileIdRef.current) {
              try {
                await supabase.from('message_status').upsert({
                  message_id: fullMsg.id,
                  profile_id: myProfileIdRef.current,
                  status: 'delivered',
                }, { onConflict: 'message_id,profile_id' });

                // Notification locale stylée
                const senderName = fullMsg.sender?.display_name || 'Partenaire';
                const content = fullMsg.type === 'text' ? fullMsg.content : null;
                await notifyNewMessage(senderName, content, convId);
              } catch {
                // Silencieux — pas bloquer l'UI pour une notification
              }
            }
          }
        )
        .subscribe();

      // === PHASE 4 : Realtime status ===
      const statusChannel = supabase
        .channel('messages:status')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'message_status',
          },
          (payload) => {
            if (!mounted) return;
            const updatedStatus = payload.new as MessageStatus;

            // 1. Mettre à jour SQLite
            updateMessageStatus(updatedStatus.message_id, updatedStatus.profile_id, updatedStatus.status);

            // 2. Mettre à jour l'état React
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
  // Créer un message en local + Supabase
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

    // 1. Insérer dans Supabase (source de vérité)
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

    // 2. Créer le statut "sent" dans Supabase
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

    // 3. Créer l'attachment si présent
    let attInsert: Partial<Attachment> | null = null;
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
      attInsert = {
        id: `${msg.id}-att`,
        message_id: msg.id,
        storage_path: attachmentData.storage_path,
        mime_type: attachmentData.mime_type,
        file_size: attachmentData.file_size,
        duration_ms: attachmentData.duration_ms,
        width: attachmentData.width,
        height: attachmentData.height,
      };
    }

    // 4. Stocker en local SQLite (cache)
    const fullMsg: Message = {
      id: msg.id,
      conversation_id: convId,
      sender_id: profileId,
      type,
      content,
      reply_to: replyToId || null,
      edited_at: null,
      created_at: msg.created_at,
    };

    await insertMessage(fullMsg, attInsert, [statusSent as MessageStatus]);

    // 5. Mettre à jour l'état React avec le message complet
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [
        ...prev,
        {
          ...fullMsg,
          sender: { id: profileId, display_name: '', avatar_url: null },
          attachments: attInsert ? [attInsert as Attachment] : [],
          statuses: [statusSent as MessageStatus],
        } as MessageWithDetails,
      ];
    });

    return true;
  }, [getConvId, myProfileId]);

  // --- ENVOI TEXTE ---
  const sendText = useCallback(async (content: string, replyToId?: string) => {
    await createMessage('text', content, undefined, replyToId);
  }, [createMessage]);

  // --- ENVOI NOTE VOCALE ---
  const sendVoice = useCallback(async (uri: string, durationMs: number) => {
    try {
      const result = await uploadMedia('VOICE_NOTES', uri, 'audio/m4a');
      await createMessage('voice', null, {
        storage_path: result.path,
        mime_type: 'audio/m4a',
        duration_ms: durationMs,
      });
    } catch (err) {
      console.error('Erreur envoi vocal:', err);
    }
  }, [createMessage]);

  // --- ENVOI IMAGE (avec compression) ---
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
    messages,
    sendText,
    sendVoice,
    sendImage,
    isLoading,
    myProfileId,
    error,
  };
}
