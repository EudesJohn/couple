// Déclarations de types pour expo-sqlite (SDK 57 preview)
// Le package ne fournit pas ses .d.ts — cette déclaration comble le manque.

declare module 'expo-sqlite' {
  export interface SQLiteDatabase {
    execAsync(sql: string): Promise<void>;
    getAllAsync<T = any[]>(sql: string, params?: any[]): Promise<T>;
    runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
    getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
    closeAsync(): Promise<void>;
  }

  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
