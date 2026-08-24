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
import { cacheMessages, getCachedMessages, addCachedMessage, updateCachedMessage, removeCachedMessage, upsertCachedMessages } from '../lib/cache';
import { getMyProfileId, getOwnProfileId, getActualPartnerProfileId } from '../lib/profile';
import { notifyNewMessage, triggerPushNotification } from './useNotifications';
import type { MessageWithDetails, Message, MessageType, Attachment, MessageStatus } from '../types/database';

let msgMountId = 0;

interface UseMessagesReturn {
  messages: MessageWithDetails[];
  sendText: (content: string, replyToId?: string) => Promise<void>;
  sendVoice: (uri: string, durationMs: number) => Promise<void>;
  sendImage: (uri: string, mimeType: string, width: number, height: number) => Promise<void>;
  /** Envoie plusieurs photos à la suite (sélection multiple de la galerie) */
  sendImages: (images: { uri: string; mimeType: string; width: number; height: number }[]) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  editMessage: (messageId: string, newContent: string) => Promise<boolean>;
  isLoading: boolean;
  isRefreshing: boolean;
  refreshMessages: () => Promise<void>;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const myProfileIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(true);
  const convIdRef = useRef<string | null>(null);

  // Set des IDs de messages déjà marqués "lu" pour éviter les doublons
  const markedReadRef = useRef<Set<string>>(new Set());

  // Timestamp du dernier message connu (pour le polling de secours)
  const lastMsgTimestampRef = useRef<string | null>(null);

  // ==========================================
  // Résolution locale des messages cités (reply)
  // L'embed PostgREST `reply_to_message:messages!reply_to(...)` peut
  // renvoyer null sur un re-fetch (relation mal déclarée). Comme on ne
  // peut répondre qu'à un message déjà chargé, on le retrouve toujours
  // dans `messages` : on comble reply_to_message côté client pour que la
  // citation s'affiche, sans dépendre de la jointure en base.
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
    });  }, [messages]);

  // ==========================================
  // Récupération de l'ID du profil
  // ==========================================
  const resolveMyProfileId = useCallback(async (): Promise<string | null> => {
    if (myProfileIdRef.current) return myProfileIdRef.current;

    // Mapping HISTORIQUE (inversé) pour la rétrocompatibilité des sender_id
    const id = getMyProfileId();
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
      // 1. ID du profil (mapping inversé historique)
      const profileId = await resolveMyProfileId();

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

      // 3a. Cache local d'abord → affichage instantané
      //     On lit l'historique complet en IndexedDB et on l'affiche tel quel.
      //     Aucune requête Supabase tant que ce cache est disponible.
      let cached: MessageWithDetails[] = [];
      try {
        cached = await getCachedMessages(loadedConvId);
        if (mounted && cached.length > 0) {
          // Trier par created_at croissant (l'IndexedDB ne garantit pas l'ordre)
          cached.sort((a, b) => a.created_at.localeCompare(b.created_at));
          setMessages(cached);
          // Base du polling : le dernier message local, même si le delta réseau est vide
          lastMsgTimestampRef.current = cached[cached.length - 1].created_at;
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      } catch {
        // Le cache peut échouer silencieusement (IndexedDB désactivé, etc.)
      }

      // 3b. Synchronisation Supabase en arrière-plan
      //     - Cache déjà rempli → fetch DELTA uniquement (messages >= dernier connu),
      //       sans `.limit(100)` : on récupère TOUT ce qui manque depuis le dernier
      //       message local. La base n'est plus sollicitée pour tout l'historique.
      //     - Pas de cache (première visite) → fetch complet initial (100) + remplissage.
      try {
        const after = cached.length > 0
          ? cached[cached.length - 1].created_at
          : null;

        let query = supabase
          .from('messages')
          .select(`
            *,
            sender:profiles!sender_id(id, display_name, avatar_url),
            attachments(*),
            statuses:message_status(*),
            reply_to_message:messages!reply_to(id, content, type)
          `)
          .eq('conversation_id', loadedConvId)
          .order('created_at', { ascending: true });

        if (after) {
          // Delta : tout ce qui est plus récent ou égal au dernier message local.
          // `.gte` + merge par id : évite de perdre des messages à la même seconde.
          query = query.gte('created_at', after);
        } else {
          query = query.limit(100);
        }

        const { data, error: msgError } = await query;

        if (mounted) {
          if (data) {
            const fetched = data as unknown as MessageWithDetails[];

            if (after) {
              // Delta : fusionner (upsert par id) avec l'état + le cache, garder le tri
              if (fetched.length > 0) {
                const now = fetched[fetched.length - 1].created_at;
                if (now > (lastMsgTimestampRef.current || '')) {
                  lastMsgTimestampRef.current = now;
                }
                setMessages((prev) => {
                  const map = new Map(prev.map((m) => [m.id, m]));
                  for (const msg of fetched) {
                    map.set(msg.id, msg);
                  }
                  return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
                });
                // Accumuler le delta dans le cache (updater au lieu d'écraser la tranche)
                upsertCachedMessages(fetched).catch(() => {});
              }
            } else {
              // Cache vide : être complet
              setMessages(fetched);
              if (fetched.length > 0) {
                lastMsgTimestampRef.current = fetched[fetched.length - 1].created_at;
              }
              // Initialiser le cache avec la tranche la plus récente
              cacheMessages(loadedConvId, fetched).catch(() => {});
            }
          }
          if (msgError) {
            console.warn('Erreur chargement messages:', msgError.message);
            // Ne bloquer l'écran sur une erreur que s'il n'existe pas de cache local
            if (cached.length === 0) {
              setError(msgError.message);
            }
          }
          setIsLoading(false);
          isLoadingRef.current = false;
          // Déclencher l'effet 2 (Realtime) avec le convId chargé
          convIdRef.current = loadedConvId;
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
  }, [resolveMyProfileId]);

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
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        async (payload: any) => {
          const eventType = payload.eventType as string;

          // ── INSERT : nouveau message ──
          if (eventType === 'INSERT') {
            const newMsg = payload.new as Message;

            // Récupérer les détails complets (avec retry si attachment manquant
            // à cause de la race condition INSERT message → INSERT attachment)
            async function fetchMessage(): Promise<MessageWithDetails | null> {
              for (let attempt = 0; attempt < 3; attempt++) {
                const { data: details } = await supabase
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

                if (!details) return null;

                const full = details as unknown as MessageWithDetails;

                // Si le message attend un attachment (voice/image/video) mais
                // n'en a pas encore → réessayer après 300ms
                if (
                  (full.type === 'voice' || full.type === 'image' || full.type === 'video') &&
                  (!full.attachments || full.attachments.length === 0)
                ) {
                  await new Promise((r) => setTimeout(r, 300));
                  continue;
                }

                return full;
              }

              // Dernier essai sans condition
              const { data: details } = await supabase
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
              return details ? (details as unknown as MessageWithDetails) : null;
            }

            const fullMsg = await fetchMessage();
            if (!fullMsg) return;

            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMsg.id)) return prev;
              return [...prev, fullMsg];
            });

            // Mettre à jour le timestamp du polling
            if (fullMsg.created_at > (lastMsgTimestampRef.current || '')) {
              lastMsgTimestampRef.current = fullMsg.created_at;
            }

            // Mettre en cache le nouveau message pour les prochains montages
            addCachedMessage(fullMsg).catch(() => {});

            // Notification si message du partenaire (sauf journaux d'appel)
            // isOwn : compare avec le mapping historique (inversé) pour
            // rester cohérent avec les anciens sender_id en base.
            const isOwn = fullMsg.sender_id === myProfileIdRef.current;
            if (!isOwn && myProfileIdRef.current && fullMsg.type !== 'call') {
              try {
                await supabase.from('message_status').upsert({
                  message_id: fullMsg.id,
                  profile_id: myProfileIdRef.current,
                  status: 'delivered',
                }, { onConflict: 'message_id,profile_id' });

                // Le sender_id utilise le mapping inversé historique, donc le
                // JOIN sender:profiles retourne le MAUVAIS display_name.
                // On résout le vrai nom du partenaire directement.
                const notifPartnerId = getActualPartnerProfileId();
                let senderName = 'Partenaire';
                if (notifPartnerId) {
                  const { data: np } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', notifPartnerId)
                    .single();
                  if (np?.display_name) senderName = np.display_name;
                }
                const content = fullMsg.type === 'text'
                  ? fullMsg.content
                  : fullMsg.type === 'image' ? 'Photo'
                  : fullMsg.type === 'voice' ? 'Message vocal'
                  : fullMsg.type === 'video' ? 'Vidéo'
                  : null;
                await notifyNewMessage(senderName, content, convId);
              } catch {
                // Silencieux
              }
            }
          }

          // ── UPDATE : modification d'un message existant ──
          if (eventType === 'UPDATE') {
            const { data: details } = await supabase
              .from('messages')
              .select(`
                *,
                sender:profiles!sender_id(id, display_name, avatar_url),
                attachments(*),
                statuses:message_status(*),
                reply_to_message:messages!reply_to(id, content, type)
              `)
              .eq('id', payload.new.id)
              .single();

            if (!details) return;

            const fullMsg = details as unknown as MessageWithDetails;

            setMessages((prev) =>
              prev.map((m) => (m.id === fullMsg.id ? fullMsg : m))
            );

            // Synchroniser le cache
            updateCachedMessage(fullMsg).catch(() => {});
          }

          // ── DELETE : suppression d'un message ──
          if (eventType === 'DELETE') {
            const deletedId = payload.old.id as string;

            setMessages((prev) => prev.filter((m) => m.id !== deletedId));

            // Nettoyer le cache
            removeCachedMessage(deletedId).catch(() => {});
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
  // EFFET 3 — Polling de secours (Realtime fallback)
  // Sur mobile, Realtime peut être déconnecté après mise en veille.
  // Ce polling rafraîchit les messages toutes les 15s en arrière-plan.
  // ==========================================
  useEffect(() => {
    if (!convId) return;

    const interval = setInterval(async () => {
      try {
        // Chercher les messages plus récents que le dernier connu
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
          // Fusion : remplace les messages existants (pour récupérer les
          // attachments qui ont pu manquer à cause de la race condition
          // entre INSERT du message et INSERT de l'attachment)
          const map = new Map(prev.map((m) => [m.id, m]));
          let changed = false;
          for (const msg of newMsgs) {
            const existing = map.get(msg.id);
            if (!existing) {
              map.set(msg.id, msg);
              changed = true;
            } else if (
              // Remplacer si l'existant n'a pas d'attachments mais que le
              // nouveau en a (cas de la race condition Realtime)
              (!existing.attachments || existing.attachments.length === 0) &&
              msg.attachments && msg.attachments.length > 0
            ) {
              map.set(msg.id, msg);
              changed = true;
            }
          }
          return changed ? Array.from(map.values()) : prev;
        });

        // Mettre à jour le timestamp et le cache
        const latest = newMsgs[newMsgs.length - 1];
        if (latest.created_at > (lastMsgTimestampRef.current || '')) {
          lastMsgTimestampRef.current = latest.created_at;
        }

        // Mettre en cache les nouveaux messages
        for (const msg of newMsgs) {
          addCachedMessage(msg).catch(() => {});
        }
      } catch {
        // Polling silencieux — pas de spam d'erreurs
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [convId]);

  // ==========================================
  // EFFET 4 — Marquage "lu" automatique
  // Dès que des messages du partenaire sont affichés,
  // on insère/update message_status → 'read'
  // ==========================================
  useEffect(() => {
    if (!convId || !myProfileIdRef.current || messages.length === 0) return;

    const myId = myProfileIdRef.current;

    // Messages du partenaire non encore marqués comme lus
    const toMark = messages.filter((msg) => {
      if (msg.sender_id === myId) return false; // Mes messages
      if (markedReadRef.current.has(msg.id)) return false; // Déjà traité
      return true;
    });

    if (toMark.length === 0) return;

    // Marquer chaque message comme lu
    for (const msg of toMark) {
      markedReadRef.current.add(msg.id);

      supabase
        .from('message_status')
        .upsert(
          {
            message_id: msg.id,
            profile_id: myId,
            status: 'read',
          },
          { onConflict: 'message_id,profile_id' }
        )
        .then(() => {
          // Mettre à jour l'état local pour que la coche devienne verte
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msg.id) return m;
              const newStatus: MessageStatus = {
                message_id: msg.id,
                profile_id: myId,
                status: 'read',
                read_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              };
              const existing = m.statuses || [];
              const idx = existing.findIndex(
                (s: any) => s.profile_id === myId
              );
              let updated;
              if (idx >= 0) {
                updated = [...existing];
                updated[idx] = newStatus;
              } else {
                updated = [...existing, newStatus];
              }
              return { ...m, statuses: updated };
            })
          );
        })
        .catch(() => {});
    }
  }, [convId, messages]);

  // ==========================================
  // Créer un message
  // ==========================================
  const createMessage = useCallback(async (
    type: MessageType,
    content: string | null,
    attachmentData?: { storage_path: string; mime_type: string; file_size?: number; duration_ms?: number; width?: number; height?: number },
    replyToId?: string | null,
  ): Promise<boolean> => {
    const profileId = myProfileId || getMyProfileId();
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

    // === Ajout optimiste au state local ===
    // Évite d'attendre Realtime (qui peut être lent ou déconnecté sur mobile)
    // Inclut l'attachment pour que l'audio/photo soit jouable immédiatement
    const optimisticAttachments: Attachment[] = attachmentData ? [{
      id: msg.id, // id provisoire — sera remplacé par la donnée réelle
      message_id: msg.id,
      storage_path: attachmentData.storage_path,
      mime_type: attachmentData.mime_type,
      file_size: attachmentData.file_size ?? null,
      duration_ms: attachmentData.duration_ms ?? null,
      width: attachmentData.width ?? null,
      height: attachmentData.height ?? null,
      created_at: msg.created_at,
    } as Attachment] : [];

    // Récupérer le message cité (réponse) pour afficher le bloc
    // "Réponse" immédiatement, sans attendre Realtime/rafraîchissement.
    let replyToMessage: MessageWithDetails['reply_to_message'] = null;
    if (replyToId) {
      const { data: replyData } = await supabase
        .from('messages')
        .select('id, content, type')
        .eq('id', replyToId)
        .single();
      if (replyData) replyToMessage = replyData as MessageWithDetails['reply_to_message'];
    }

    const optimisticMsg: MessageWithDetails = {
      ...msg,
      sender: { id: profileId, display_name: '', avatar_url: '' },
      attachments: optimisticAttachments,
      statuses: [{
        message_id: msg.id,
        profile_id: profileId,
        status: 'sent',
        created_at: msg.created_at,
        read_at: null,
      }],
      reply_to_message: replyToMessage,
    };
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, optimisticMsg];
    });
    // Mettre à jour le timestamp pour le polling
    if (!lastMsgTimestampRef.current || msg.created_at > lastMsgTimestampRef.current) {
      lastMsgTimestampRef.current = msg.created_at;
    }
    addCachedMessage(optimisticMsg).catch(() => {});

    // Envoyer une notification push au partenaire (en arrière-plan)
    // Double sécurisation : même si le trigger DB pg_net échoue,
    // le push est envoyé directement depuis le client.
    const partnerProfileId = getActualPartnerProfileId();
    if (partnerProfileId) {
      const pushBody = type === 'text' && content ? content
        : type === 'image' ? 'Photo'
        : type === 'voice' ? 'Message vocal'
        : type === 'video' ? 'Vidéo'
        : 'Nouveau message';
      supabase.from('profiles').select('display_name').eq('id', getOwnProfileId()).single()
        .then(({ data: p }: { data: { display_name: string } | null }) => {
          const senderName = p?.display_name || 'Ma chérie';
          triggerPushNotification(partnerProfileId, senderName, pushBody, {
            screen: 'chat',
            conversationId: convId,
          }).catch(() => {});
        }).catch(() => {});
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

  // --- ENVOI DE PLUSIEURS IMAGES (avec progression globale) ---
  // Les photos sont envoyées à la suite : compression → upload → message,
  // chacune occupant une fraction de la barre de progression (0% → 100%).
  const sendImages = useCallback(async (images: Array<{ uri: string; mimeType: string; width: number; height: number }>) => {
    if (images.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    const total = images.length;
    try {
      for (let i = 0; i < total; i++) {
        const img = images[i];
        const base = (i / total) * 100;
        const compressedUri = await compressImage(img.uri);
        setUploadProgress(base + (10 / total)); // compression faite
        const result = await uploadMedia('MEDIA', compressedUri, 'image/jpeg', (p) => {
          setUploadProgress(base + (10 / total) + Math.round(p * (85 / total))); // base → base+85/total
        });
        await createMessage('image', null, {
          storage_path: result.path,
          mime_type: 'image/jpeg',
          width: img.width,
          height: img.height,
          file_size: 0,
        });
      }
      setUploadProgress(100);
    } catch (err: any) {
      console.error('Erreur envoi images:', err);
      const msg = err?.message || err?.error_description || "Erreur lors de l'envoi des photos";
      setError(msg);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  }, [createMessage]);

  // --- ENVOI D'UNE SEULE IMAGE (photo prise / une seule sélectionnée) ---
  const sendImage = useCallback(async (uri: string, mimeType: string, width: number, height: number) => {
    await sendImages([{ uri, mimeType, width, height }]);
  }, [sendImages]);

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

  // ==========================================
  // RAFRAÎCHISSEMENT FORCÉ
  // Vide le cache et recharge tous les messages
  // ==========================================
  const refreshMessages = useCallback(async () => {
    if (!convId) return;
    setIsRefreshing(true);

    try {
      // Re-fetch tous les messages depuis Supabase
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
        .order('created_at', { ascending: true })
        .limit(100);

      if (!error && data) {
        const fetched = data as unknown as MessageWithDetails[];
        // Functional updater : fusionne avec l'état existant pour ne PAS écraser
        // les INSERT Realtime concurrents ET pour que les status (lu/délivré)
        // soient bien mis à jour même si les IDs sont les mêmes.
        setMessages((prev) => {
          if (prev.length === 0) return fetched;
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const msg of fetched) {
            map.set(msg.id, msg);
          }
          return Array.from(map.values());
        });
        // Mettre à jour le timestamp du polling
        if (fetched.length > 0) {
          lastMsgTimestampRef.current = fetched[fetched.length - 1].created_at;
        }
        // Re-cacher (cacheMessages supprime les anciens messages de cette conversation)
        cacheMessages(convId, fetched).catch(() => {});
      }
    } catch (err) {
      console.warn('Erreur refreshMessages:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [convId]);

  // ==========================================
  // SUPPRESSION D'UN MESSAGE
  // ==========================================
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    const profileId = myProfileId || getMyProfileId();
    if (!convId || !profileId) return false;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', profileId); // Seulement ses propres messages

    if (error) {
      console.warn('Erreur suppression message:', error.message);
      return false;
    }

    // Supprimer du state local immédiatement
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    return true;
  }, [convId, myProfileId]);

  // ==========================================
  // MODIFICATION D'UN MESSAGE (texte uniquement)
  // ==========================================
  const editMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
    const profileId = myProfileId || getMyProfileId();
    if (!convId || !profileId) return false;
    if (!newContent.trim()) return false;

    const trimmed = newContent.trim();
    const editedAt = new Date().toISOString();

    // Mise à jour optimiste immédiate
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.type === 'text'
          ? { ...m, content: trimmed, edited_at: editedAt }
          : m
      )
    );

    const { error } = await supabase
      .from('messages')
      .update({ content: trimmed, edited_at: editedAt })
      .eq('id', messageId)
      .eq('sender_id', profileId); // Seulement ses propres messages

    if (error) {
      console.warn('Erreur modification message:', error.message);
      // Rollback : on recharge les messages pour revenir à l'état réel
      refreshMessages();
      return false;
    }

    // Synchroniser le cache (le champ optimiste correspond à la valeur serveur)
    const updatedMsg = messages.find((m) => m.id === messageId);
    if (updatedMsg) updateCachedMessage({ ...updatedMsg, content: trimmed, edited_at: editedAt }).catch(() => {});
    return true;
  }, [convId, myProfileId, messages, refreshMessages]);

  return {
    messages, sendText, sendVoice, sendImage, sendImages, deleteMessage, editMessage,
    isLoading, isRefreshing, refreshMessages,
    isUploading, uploadProgress, myProfileId, error,
  };
}
