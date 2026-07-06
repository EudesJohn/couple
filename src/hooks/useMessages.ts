// ============================================================
// Hook — Messages en temps réel + envoi texte/média
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia } from '../lib/media';
import type { MessageWithDetails, Message, MessageType } from '../types/database';

interface UseMessagesReturn {
  messages: MessageWithDetails[];
  sendText: (content: string) => Promise<void>;
  sendVoice: (uri: string, durationMs: number) => Promise<void>;
  sendImage: (uri: string, mimeType: string, width: number, height: number) => Promise<void>;
  isLoading: boolean;
  myProfileId: string | null;
}

export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<MessageWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);

  // Récupération lazy de l'ID de conversation + profil courant
  const getConvId = useCallback(async () => {
    if (convIdRef.current) return convIdRef.current;
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .limit(1)
      .single();
    convIdRef.current = data?.id ?? null;
    return convIdRef.current;
  }, []);

  // Récupérer son profile_id
  const getMyProfileId = useCallback(async () => {
    if (myProfileId) return myProfileId;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('supabase_uid', user.id)
      .single();

    if (profile) setMyProfileId(profile.id);
    return profile?.id ?? null;
  }, [myProfileId]);

  // Chargement initial + Realtime
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const convId = await getConvId();
      if (!convId) { setIsLoading(false); return; }

      // Récupérer son profile_id
      await getMyProfileId();

      // Charger les messages existants
      const { data } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles(id, display_name, avatar_url),
          attachments(*),
          statuses:message_status(*),
          reply_to_message:messages!reply_to(id, content, type)
        `)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (mounted && data) {
        setMessages(data as unknown as MessageWithDetails[]);
        setIsLoading(false);
      }

      // S'abonner aux nouveaux messages
      const channel = supabase
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
            const { data: details } = await supabase
              .from('messages')
              .select(`
                *,
                sender:profiles(id, display_name, avatar_url),
                attachments(*),
                statuses:message_status(*)
              `)
              .eq('id', newMsg.id)
              .single();

            if (mounted && details) {
              setMessages((prev) => [...prev, details as unknown as MessageWithDetails]);
            }
          }
        )
        .subscribe();

      return channel;
    };

    const channelPromise = init();

    return () => {
      mounted = false;
      channelPromise.then((channel) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [getConvId, getMyProfileId]);

  // Créer un message + son statut + optionnellement un attachment
  const createMessage = useCallback(async (
    type: MessageType,
    content: string | null,
    attachmentData?: { storage_path: string; mime_type: string; file_size?: number; duration_ms?: number; width?: number; height?: number }
  ): Promise<boolean> => {
    const convId = await getConvId();
    const profileId = await getMyProfileId();
    if (!convId || !profileId) return false;

    // 1. Insérer le message
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: profileId,
        content,
        type,
      })
      .select()
      .single();

    if (msgError || !msg) return false;

    // 2. Créer le statut "sent"
    await supabase.from('message_status').insert({
      message_id: msg.id,
      profile_id: profileId,
      status: 'sent',
    });

    // 3. Créer l'attachment si présent
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
  }, [getConvId, getMyProfileId]);

  // --- ENVOI TEXTE ---
  const sendText = useCallback(async (content: string) => {
    await createMessage('text', content);
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

  // --- ENVOI IMAGE ---
  const sendImage = useCallback(async (uri: string, mimeType: string, width: number, height: number) => {
    try {
      const result = await uploadMedia('MEDIA', uri, mimeType);
      await createMessage('image', null, {
        storage_path: result.path,
        mime_type: mimeType,
        width,
        height,
        file_size: 0, // sera mis à jour
      });
    } catch (err) {
      console.error('Erreur envoi image:', err);
    }
  }, [createMessage]);

  return {
    messages,
    sendText,
    sendVoice,
    sendImage,
    isLoading,
    myProfileId,
  };
}
