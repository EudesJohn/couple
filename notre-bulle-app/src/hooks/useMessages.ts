// ============================================================
// Hook — Messages local-first (SQLite + Supabase)
// Copie fidèle de notre-bulle-web/src/hooks/useMessages.ts
// avec cache SQLite en plus pour mobile
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia, compressImage } from '../lib/media';
import { config } from '../constants/config';
import { getMyProfileId, getOwnProfileId, getActualPartnerProfileId } from '../lib/profile';
import {
  getMessages,
  insertMessage,
  updateMessageStatus,
  getConversationId as getLocalConvId,
  cacheConversation,
} from '../lib/localdb';
import { notifyNewMessage } from './useNotifications';
import type { MessageWithDetails, Message, MessageType, Attachment, MessageStatus } from '../types/database';

let msgMountId = 0;

interface UseMessagesReturn {
  messages: MessageWithDetails[];
  sendText: (content: string, replyToId?: string) => Promise<void>;
  sendVoice: (uri: string, durationMs: number, mimeType?: string) => Promise<void>;
  sendImage: (uri: string, mimeType: string, width: number, height: number) => Promise<void>;
  refreshMessages: () => Promise<void>;
  isLoading: boolean;
  myProfileId: string | null;
  error: string | null;
}

export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<MessageWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myProfileIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(true);
  const convIdRef = useRef<string | null>(null);
  const lastMsgTimestampRef = useRef<string | null>(null);
  // Set des IDs deja marques "lu" — evite les upserts redondants
  const markedReadRef = useRef<Set<string>>(new Set());

  // ==========================================
  // Resolution locale des messages cites (reply)
  // Le LEFT JOIN PostgREST peut renvoyer null sur un re-fetch.
  // On comble cote client comme le web.
  // ==========================================
  useEffect(() => {
    const hasMissingReply = messages.some((m) => m.reply_to && !m.reply_to_message?.id);
    if (!hasMissingReply) return;
    const byId = new Map(messages.map((m) => [m.id, m]));
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (!m.reply_to || m.reply_to_message?.id) return m;
        const target = byId.get(m.reply_to);
        if (!target) return m;
        changed = true;
        return { ...m, reply_to_message: { id: target.id, content: target.content, type: target.type } };
      });
      return changed ? next : prev;
    });
  }, [messages]);

  // ==========================================
  // Resolution du profil (mapping inverse historique)
  // ==========================================
  const resolveMyProfileId = useCallback(async (): Promise<string | null> => {
    if (myProfileIdRef.current) return myProfileIdRef.current;
    const id = await getMyProfileId();
    if (id) {
      myProfileIdRef.current = id;
      setMyProfileId(id);
      return id;
    }
    return null;
  }, []);

  // ==========================================
  // EFFET 1 — Chargement des donnees
  // ==========================================
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const profileId = await resolveMyProfileId();

      // 1. Recuperer la conversation
      let convId: string | null = await getLocalConvId();
      if (!convId) {
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('id')
          .limit(1)
          .single();
        if (convError || !convData?.id) {
          if (mounted) { setError('Aucune conversation trouvee'); setIsLoading(false); isLoadingRef.current = false; }
          return;
        }
        convId = convData.id as string;
        await cacheConversation(convId);
      }
      convIdRef.current = convId!;

      // 2a. Cache local d'abord → affichage instantane
      let cached: MessageWithDetails[] = [];
      try {
        cached = await getMessages(convId!);
        if (mounted && cached.length > 0) {
          setMessages(cached);
          lastMsgTimestampRef.current = cached[cached.length - 1].created_at;
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      } catch {}

      // 2b. Synchronisation Supabase
      try {
        const after = cached.length > 0 ? cached[cached.length - 1].created_at : null;

        let query = supabase
          .from('messages')
          .select(`
            *,
            sender:profiles!sender_id(id, display_name, avatar_url),
            attachments(*),
            statuses:message_status(*),
            reply_to_message:messages!reply_to(id, content, type)
          `)
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true });

        if (after) {
          query = query.gte('created_at', after);
        } else {
          query = query.limit(100);
        }

        const { data, error: msgError } = await query;

        if (mounted) {
          if (data) {
            const fetched = data as unknown as MessageWithDetails[];
            if (after) {
              if (fetched.length > 0) {
                const now = fetched[fetched.length - 1].created_at;
                if (now > (lastMsgTimestampRef.current || '')) lastMsgTimestampRef.current = now;
                setMessages((prev) => {
                  const map = new Map(prev.map((m) => [m.id, m]));
                  for (const msg of fetched) map.set(msg.id, msg);
                  return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
                });
                for (const msg of fetched) {
                  const att = msg.attachments?.[0];
                  insertMessage(msg, att ? { id: att.id, message_id: msg.id, storage_path: att.storage_path, mime_type: att.mime_type, file_size: att.file_size, duration_ms: att.duration_ms, width: att.width, height: att.height, thumbnail_path: att.thumbnail_path, created_at: att.created_at } : null, msg.statuses).catch(() => {});
                }
              }
            } else {
              setMessages(fetched);
              if (fetched.length > 0) lastMsgTimestampRef.current = fetched[fetched.length - 1].created_at;
              for (const msg of fetched) {
                const att = msg.attachments?.[0];
                insertMessage(msg, att ? { id: att.id, message_id: msg.id, storage_path: att.storage_path, mime_type: att.mime_type, file_size: att.file_size, duration_ms: att.duration_ms, width: att.width, height: att.height, thumbnail_path: att.thumbnail_path, created_at: att.created_at } : null, msg.statuses).catch(() => {});
              }
            }
          }
          if (msgError) {
            console.warn('Erreur chargement messages:', msgError.message);
            if (cached.length === 0) setError(msgError.message);
          }
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      } catch (err) {
        if (mounted) { setIsLoading(false); isLoadingRef.current = false; }
      }
    };

    init();
    return () => { mounted = false; };
  }, [resolveMyProfileId]);

  // ==========================================
  // EFFET 2 — Realtime
  // ==========================================
  useEffect(() => {
    const convId = convIdRef.current;
    if (!convId) return;

    const mid = ++msgMountId;

    const msgChannel = supabase
      .channel(`messages:realtime:${mid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        async (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;

            // Recuperer les details complets avec retry (race condition attachment)
            async function fetchFull(): Promise<MessageWithDetails | null> {
              for (let attempt = 0; attempt < 3; attempt++) {
                const { data } = await supabase
                  .from('messages')
                  .select(`
                    *,
                    sender:profiles!sender_id(id, display_name, avatar_url),
                    attachments(*),
                    statuses:message_status(*),
                    reply_to_message:messages!reply_to(id, content, type)
                  `)
                  .eq('id', newMsg.id)
                  .single();
                if (!data) return null;
                const full = data as unknown as MessageWithDetails;
                if ((full.type === 'voice' || full.type === 'image' || full.type === 'video') && (!full.attachments || full.attachments.length === 0)) {
                  await new Promise((r) => setTimeout(r, 300));
                  continue;
                }
                return full;
              }
              const { data } = await supabase
                .from('messages')
                .select(`
                  *,
                  sender:profiles!sender_id(id, display_name, avatar_url),
                  attachments(*),
                  statuses:message_status(*),
                  reply_to_message:messages!reply_to(id, content, type)
                `)
                .eq('id', newMsg.id)
                .single();
              return data ? (data as unknown as MessageWithDetails) : null;
            }

            const fullMsg = await fetchFull();
            if (!fullMsg) return;

            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMsg.id)) return prev;
              return [...prev, fullMsg];
            });

            if (fullMsg.created_at > (lastMsgTimestampRef.current || '')) {
              lastMsgTimestampRef.current = fullMsg.created_at;
            }

            // Cache SQLite
            const att = fullMsg.attachments?.[0];
            insertMessage(fullMsg, att ? { id: att.id, message_id: fullMsg.id, storage_path: att.storage_path, mime_type: att.mime_type, file_size: att.file_size, duration_ms: att.duration_ms, width: att.width, height: att.height, thumbnail_path: att.thumbnail_path, created_at: att.created_at } : null, fullMsg.statuses).catch(() => {});

            // Notification si message du partenaire (pas les appels)
            const isOwn = fullMsg.sender_id === myProfileIdRef.current;
            if (!isOwn && myProfileIdRef.current && fullMsg.type !== 'call') {
              try {
                await supabase.from('message_status').upsert({
                  message_id: fullMsg.id,
                  profile_id: myProfileIdRef.current,
                  status: 'delivered',
                }, { onConflict: 'message_id,profile_id' });

                const partnerId = await getActualPartnerProfileId();
                let senderName = 'Partenaire';
                if (partnerId) {
                  const { data: np } = await supabase.from('profiles').select('display_name').eq('id', partnerId).single();
                  if (np?.display_name) senderName = np.display_name;
                }
                const content = fullMsg.type === 'text' ? fullMsg.content : fullMsg.type === 'image' ? 'Photo' : fullMsg.type === 'voice' ? 'Message vocal' : fullMsg.type === 'video' ? 'Video' : null;
                await notifyNewMessage(senderName, content, convId);
              } catch {}
            }
          }

          if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
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
              const existing = msg.statuses || [];
              const idx = existing.findIndex((s) => s.profile_id === updatedStatus.profile_id);
              let newStatuses = [...existing];
              if (idx >= 0) newStatuses[idx] = updatedStatus;
              else newStatuses.push(updatedStatus);
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
  }, [convIdRef.current]);

  // ==========================================
  // EFFET 3 — Polling de secours (10s)
  // ==========================================
  useEffect(() => {
    const convId = convIdRef.current;
    if (!convId) return;

    const interval = setInterval(async () => {
      try {
        const since = lastMsgTimestampRef.current;
        if (!since) return;

        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            sender:profiles!sender_id(id, display_name, avatar_url),
            attachments(*),
            statuses:message_status(*),
            reply_to_message:messages!reply_to(id, content, type)
          `)
          .eq('conversation_id', convId)
          .gt('created_at', since)
          .order('created_at', { ascending: true });

        if (error || !data || data.length === 0) return;

        const newMsgs = data as unknown as MessageWithDetails[];

        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          let changed = false;
          for (const msg of newMsgs) {
            const existing = map.get(msg.id);
            if (!existing) { map.set(msg.id, msg); changed = true; }
            else if ((!existing.attachments || existing.attachments.length === 0) && msg.attachments && msg.attachments.length > 0) { map.set(msg.id, msg); changed = true; }
          }
          return changed ? Array.from(map.values()) : prev;
        });

        const latest = newMsgs[newMsgs.length - 1];
        if (latest.created_at > (lastMsgTimestampRef.current || '')) lastMsgTimestampRef.current = latest.created_at;

        for (const msg of newMsgs) {
          const att = msg.attachments?.[0];
          insertMessage(msg, att ? { id: att.id, message_id: msg.id, storage_path: att.storage_path, mime_type: att.mime_type, file_size: att.file_size, duration_ms: att.duration_ms, width: att.width, height: att.height, thumbnail_path: att.thumbnail_path, created_at: att.created_at } : null, msg.statuses).catch(() => {});
        }
      } catch {}
    }, 10_000);

    return () => clearInterval(interval);
  }, [convIdRef.current]);

  // ==========================================
  // EFFET 4 — Marquage "lu"
  // ==========================================
  useEffect(() => {
    const convId = convIdRef.current;
    if (!convId || !myProfileIdRef.current || messages.length === 0) return;
    const myId = myProfileIdRef.current;

    // Messages du partenaire non encore marques "lu"
    const toMark = messages.filter((msg) => {
      if (msg.sender_id === myId) return false;
      if (markedReadRef.current.has(msg.id)) return false;
      return true;
    });

    if (toMark.length === 0) return;

    for (const msg of toMark) {
      markedReadRef.current.add(msg.id);
      void Promise.resolve(
        supabase
          .from('message_status')
          .upsert(
            { message_id: msg.id, profile_id: myId, status: 'read' },
            { onConflict: 'message_id,profile_id' }
          )
      ).then(() => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msg.id) return m;
              const newStatus: MessageStatus = { message_id: msg.id, profile_id: myId, status: 'read', read_at: new Date().toISOString(), created_at: new Date().toISOString() };
              const existing = m.statuses || [];
              const idx = existing.findIndex((s) => s.profile_id === myId);
              let updated;
              if (idx >= 0) { updated = [...existing]; updated[idx] = newStatus; }
              else { updated = [...existing, newStatus]; }
              return { ...m, statuses: updated };
            })
          );
      }).catch(() => {});
    }
  }, [convIdRef.current, messages]);

  // ==========================================
  // Envoyer un message
  // ==========================================
  const createMessage = useCallback(async (
    type: MessageType,
    content: string | null,
    attachmentData?: { storage_path: string; mime_type: string; file_size?: number; duration_ms?: number; width?: number; height?: number },
    replyToId?: string | null,
  ): Promise<boolean> => {
    const convId = convIdRef.current;
    const profileId = myProfileId || await getMyProfileId();
    console.log('📤 createMessage — convId:', convId, 'profileId:', profileId, 'type:', type);
    if (!convId || !profileId) { console.warn('📤 Envoi impossible: convId ou profileId manquant'); return false; }

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
      console.warn('📤 Erreur creation message:', msgError?.message, msgError?.details, msgError?.hint);
      return false;
    }
    console.log('📤 Message cree:', msg.id);

    await supabase.from('message_status').insert({
      message_id: msg.id,
      profile_id: profileId,
      status: 'sent',
    });

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

    // Ajout optimiste
    const optimisticAttachments: Attachment[] = attachmentData ? [{
      id: msg.id,
      message_id: msg.id,
      storage_path: attachmentData.storage_path,
      mime_type: attachmentData.mime_type,
      file_size: attachmentData.file_size ?? null,
      duration_ms: attachmentData.duration_ms ?? null,
      width: attachmentData.width ?? null,
      height: attachmentData.height ?? null,
      created_at: msg.created_at,
    } as Attachment] : [];

    let replyToMessage: MessageWithDetails['reply_to_message'] = null;
    if (replyToId) {
      const { data: replyData } = await supabase.from('messages').select('id, content, type').eq('id', replyToId).single();
      if (replyData) replyToMessage = replyData as MessageWithDetails['reply_to_message'];
    }

    const optimisticMsg: MessageWithDetails = {
      ...msg,
      sender: { id: profileId, display_name: '', avatar_url: '' },
      attachments: optimisticAttachments,
      statuses: [{ message_id: msg.id, profile_id: profileId, status: 'sent', created_at: msg.created_at, read_at: null }],
      reply_to_message: replyToMessage,
    };
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, optimisticMsg];
    });
    if (!lastMsgTimestampRef.current || msg.created_at > lastMsgTimestampRef.current) lastMsgTimestampRef.current = msg.created_at;
    insertMessage(optimisticMsg, optimisticAttachments[0] ? { id: optimisticAttachments[0].id, message_id: msg.id, storage_path: attachmentData!.storage_path, mime_type: attachmentData!.mime_type, file_size: attachmentData!.file_size, duration_ms: attachmentData!.duration_ms, width: attachmentData!.width, height: attachmentData!.height, thumbnail_path: null, created_at: msg.created_at } : null, optimisticMsg.statuses).catch(() => {});

    return true;
  }, [convIdRef.current, myProfileId]);

  const sendText = useCallback(async (content: string, replyToId?: string) => {
    await createMessage('text', content, undefined, replyToId);
  }, [createMessage]);

  const sendVoice = useCallback(async (uri: string, durationMs: number, mimeOverride?: string) => {
    try {
      const mime = mimeOverride || (uri.endsWith('.m4a') ? 'audio/m4a' : 'audio/webm');
      const result = await uploadMedia('VOICE_NOTES', uri, mime);
      await createMessage('voice', null, { storage_path: result.path, mime_type: mime, duration_ms: durationMs });
    } catch (err) { console.error('Erreur envoi vocal:', err); }
  }, [createMessage]);

  const sendImage = useCallback(async (uri: string, mimeType: string, width: number, height: number) => {
    try {
      const compressedUri = await compressImage(uri);
      const result = await uploadMedia('MEDIA', compressedUri, 'image/jpeg');
      await createMessage('image', null, { storage_path: result.path, mime_type: 'image/jpeg', width, height, file_size: 0 });
    } catch (err) { console.error('Erreur envoi image:', err); }
  }, [createMessage]);

  // ==========================================
  // Refresh manuel — recharge depuis Supabase
  // ==========================================
  const refreshMessages = useCallback(async () => {
    const convId = convIdRef.current;
    const profileId = myProfileIdRef.current;
    if (!convId || !profileId) return;

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
        .order('created_at', { ascending: true });

      if (!msgError && data) {
        const fetched = data as unknown as MessageWithDetails[];
        setMessages(fetched);
        if (fetched.length > 0) lastMsgTimestampRef.current = fetched[fetched.length - 1].created_at;
        // Cache local
        for (const msg of fetched) {
          const att = msg.attachments?.[0];
          insertMessage(msg, att ? { id: att.id, message_id: msg.id, storage_path: att.storage_path, mime_type: att.mime_type, file_size: att.file_size, duration_ms: att.duration_ms, width: att.width, height: att.height, thumbnail_path: att.thumbnail_path, created_at: att.created_at } : null, msg.statuses).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Erreur refreshMessages:', err);
    }
  }, []);

  return { messages, sendText, sendVoice, sendImage, refreshMessages, isLoading, myProfileId, error };
}
