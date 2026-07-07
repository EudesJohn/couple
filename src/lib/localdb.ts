// ============================================================
// Base de données locale SQLite — Cache des messages
// Lecture instantanée avant sync Supabase
// ============================================================
import * as SQLite from 'expo-sqlite';
import type { MessageWithDetails, Message, Attachment, MessageStatus } from '../types/database';

let db: SQLite.SQLiteDatabase | null = null;

// ==========================================
// INITIALISATION
// ==========================================
export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('notre-bulle.db');

  // Activer WAL pour les performances
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Créer les tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT,
      reply_to TEXT,
      edited_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sender_display_name TEXT,
      sender_avatar_url TEXT
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      storage_path TEXT,
      local_path TEXT,
      mime_type TEXT NOT NULL,
      file_size INTEGER,
      duration_ms INTEGER,
      width INTEGER,
      height INTEGER,
      thumbnail_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_status (
      message_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      supabase_uid TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      updated_at TEXT
    );

    -- Index pour accélérer les requêtes
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_msg ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_status_msg ON message_status(message_id);
  `);
}

// ==========================================
// MESSAGES
// ==========================================
export async function getMessages(convId: string, limit = 100): Promise<MessageWithDetails[]> {
  if (!db) return [];

  const rows: any[] = await db.getAllAsync(
    `SELECT m.*, a.id as att_id, a.storage_path, a.local_path, a.mime_type,
            a.file_size as att_file_size, a.duration_ms as att_duration_ms,
            a.width as att_width, a.height as att_height, a.thumbnail_path,
            a.created_at as att_created_at,
            s.profile_id as s_profile_id, s.status as s_status,
            s.read_at as s_read_at, s.created_at as s_created_at
     FROM messages m
     LEFT JOIN attachments a ON a.message_id = m.id
     LEFT JOIN message_status s ON s.message_id = m.id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC
     LIMIT ?`,
    [convId, limit]
  );

  return groupMessages(rows);
}

export async function getMessageById(msgId: string): Promise<MessageWithDetails | null> {
  if (!db) return null;

  const rows: any[] = await db.getAllAsync(
    `SELECT m.*, a.id as att_id, a.storage_path, a.local_path, a.mime_type,
            a.file_size as att_file_size, a.duration_ms as att_duration_ms,
            a.width as att_width, a.height as att_height, a.thumbnail_path,
            a.created_at as att_created_at,
            s.profile_id as s_profile_id, s.status as s_status,
            s.read_at as s_read_at, s.created_at as s_created_at
     FROM messages m
     LEFT JOIN attachments a ON a.message_id = m.id
     LEFT JOIN message_status s ON s.message_id = m.id
     WHERE m.id = ?
     ORDER BY a.created_at ASC`,
    [msgId]
  );

  const grouped = groupMessages(rows);
  return grouped[0] || null;
}

export async function insertMessage(
  msg: Message,
  att?: Partial<Attachment> | null,
  statuses?: Partial<MessageStatus>[]
): Promise<void> {
  if (!db) return;

  await db.runAsync(
    `INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, type, content, reply_to, edited_at, created_at, sender_display_name, sender_avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.conversation_id, msg.sender_id, msg.type, msg.content, msg.reply_to, msg.edited_at, msg.created_at, null, null]
  );

  if (att && att.id) {
    await db.runAsync(
      `INSERT OR IGNORE INTO attachments (id, message_id, storage_path, local_path, mime_type, file_size, duration_ms, width, height, thumbnail_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [att.id, msg.id, att.storage_path ?? null, null, att.mime_type ?? '', att.file_size ?? null, att.duration_ms ?? null, att.width ?? null, att.height ?? null, att.thumbnail_path ?? null, att.created_at ?? msg.created_at]
    );
  }

  if (statuses && statuses.length > 0) {
    for (const s of statuses) {
      await db.runAsync(
        `INSERT OR IGNORE INTO message_status (message_id, profile_id, status, read_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [msg.id, s.profile_id ?? '', s.status ?? 'sent', s.read_at ?? null, s.created_at ?? msg.created_at]
      );
    }
  }
}

export async function updateMessageStatus(
  messageId: string,
  profileId: string,
  status: string
): Promise<void> {
  if (!db) return;

  await db.runAsync(
    `INSERT OR REPLACE INTO message_status (message_id, profile_id, status, read_at, created_at)
     VALUES (?, ?, ?, CASE WHEN ? = 'read' THEN datetime('now') ELSE NULL END, COALESCE((SELECT created_at FROM message_status WHERE message_id = ? AND profile_id = ?), datetime('now')))`,
    [messageId, profileId, status, status, messageId, profileId]
  );
}

export async function deleteMessage(msgId: string): Promise<void> {
  if (!db) return;
  await db.runAsync('DELETE FROM attachments WHERE message_id = ?', [msgId]);
  await db.runAsync('DELETE FROM message_status WHERE message_id = ?', [msgId]);
  await db.runAsync('DELETE FROM messages WHERE id = ?', [msgId]);
}

// ==========================================
// CONVERSATIONS
// ==========================================
export async function getConversationId(): Promise<string | null> {
  if (!db) return null;
  const row: any = await db.getFirstAsync('SELECT id FROM conversations LIMIT 1');
  return row?.id ?? null;
}

export async function cacheConversation(id: string, title?: string): Promise<void> {
  if (!db) return;
  await db.runAsync(
    `INSERT OR IGNORE INTO conversations (id, title, created_at) VALUES (?, ?, datetime('now'))`,
    [id, title ?? '']
  );
}

// ==========================================
// PROFILES
// ==========================================
export async function cacheProfile(profile: { id: string; display_name?: string; avatar_url?: string }): Promise<void> {
  if (!db) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO profiles (id, display_name, avatar_url, updated_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [profile.id, profile.display_name ?? '', profile.avatar_url ?? null]
  );
}

export async function getProfile(profileId: string): Promise<{ id: string; display_name?: string; avatar_url?: string } | null> {
  if (!db) return null;
  const row: any = await db.getFirstAsync('SELECT id, display_name, avatar_url FROM profiles WHERE id = ?', [profileId]);
  return row || null;
}

// ==========================================
// TRONÇONNER ET GROUPER les lignes plates
// ==========================================
function groupMessages(rows: any[]): MessageWithDetails[] {
  const map = new Map<string, MessageWithDetails>();

  for (const row of rows) {
    if (!row.id) continue;

    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        type: row.type,
        content: row.content,
        reply_to: row.reply_to,
        edited_at: row.edited_at,
        created_at: row.created_at,
        sender: {
          id: row.sender_id,
          display_name: row.sender_display_name ?? '',
          avatar_url: row.sender_avatar_url ?? null,
        },
        attachments: [],
        statuses: [],
      });
    }

    const entry = map.get(row.id)!;

    // Ajouter attachment si pas déjà présente (clé unique = att_id)
    if (row.att_id && !entry.attachments.some((a) => a.id === row.att_id)) {
      entry.attachments.push({
        id: row.att_id,
        message_id: row.id,
        storage_path: row.storage_path ?? null,
        local_path: row.local_path ?? null,
        mime_type: row.mime_type ?? '',
        file_size: row.att_file_size ?? null,
        duration_ms: row.att_duration_ms ?? null,
        width: row.att_width ?? null,
        height: row.att_height ?? null,
        thumbnail_path: row.thumbnail_path ?? null,
        created_at: row.att_created_at ?? row.created_at,
      });
    }

    // Ajouter status si pas déjà présente
    if (row.s_profile_id && !entry.statuses.some((s) => s.profile_id === row.s_profile_id)) {
      entry.statuses.push({
        message_id: row.id,
        profile_id: row.s_profile_id,
        status: row.s_status ?? 'sent',
        read_at: row.s_read_at ?? null,
        created_at: row.s_created_at ?? row.created_at,
      });
    }
  }

  return Array.from(map.values());
}

// ==========================================
// NETTOYAGE
// ==========================================
export async function clearOldMessages(keepCount = 500): Promise<void> {
  if (!db) return;
  await db.runAsync(
    `DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC LIMIT ?)`,
    [keepCount]
  );
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
