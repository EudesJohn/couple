// ============================================================
// Types TypeScript — reflet exact du schéma SQL Supabase
// ============================================================

export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'call' | 'system';
export type DeliveryStatus = 'sent' | 'delivered' | 'read';
export type CallType = 'audio' | 'video';
export type CallStatus = 'missed' | 'answered' | 'cancelled' | 'failed';

// --- PROFILS ---
export interface Profile {
  id: string;
  supabase_uid: string;
  display_name: string;
  avatar_url: string | null;
  pin_hash: string;
  created_at: string;
  updated_at: string;
}

// --- CONVERSATIONS ---
export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  profile_id: string;
  joined_at: string;
}

// --- MESSAGES ---
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: MessageType;
  content: string | null;
  reply_to: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string;
  file_size: number | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  created_at: string;
}

export interface MessageStatus {
  message_id: string;
  profile_id: string;
  status: DeliveryStatus;
  read_at: string | null;
  created_at: string;
}

// --- APPELS ---
export interface Call {
  id: string;
  caller_id: string;
  type: CallType;
  status: CallStatus;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  created_at: string;
}

// --- PRÉSENCE ---
export interface Presence {
  profile_id: string;
  is_online: boolean;
  is_typing: boolean;
  last_seen_at: string;
}

// --- UNION POUR LE CHAT (message + attachements + statuts) ---
export interface MessageWithDetails extends Message {
  sender: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
  attachments: Attachment[];
  statuses: MessageStatus[];
  reply_to_message?: Pick<Message, 'id' | 'content' | 'type'> | null;
}
