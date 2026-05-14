/**
 * SQLite-backed token store.
 * Persists JWT + session metadata between MCP server restarts.
 * DB path: $PAPERID_DB_PATH or ~/.paperid-mcp/tokens.db
 */
import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

export interface StoredToken {
  phone: string;
  token: string;
  user_id: string;
  company_id: string;
  expires_at: number; // Unix timestamp seconds
  created_at: number;
  updated_at: number;
}

export class TokenStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolved = dbPath || process.env.PAPERID_DB_PATH || join(homedir(), '.paperid-mcp', 'tokens.db');
    // Ensure directory exists
    mkdirSync(join(resolved, '..'), { recursive: true });
    this.db = new Database(resolved);
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        phone       TEXT PRIMARY KEY,
        token       TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        company_id  TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  }

  save(data: Omit<StoredToken, 'created_at' | 'updated_at'>) {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO tokens (phone, token, user_id, company_id, expires_at, created_at, updated_at)
      VALUES (@phone, @token, @user_id, @company_id, @expires_at, @now, @now)
      ON CONFLICT(phone) DO UPDATE SET
        token      = excluded.token,
        user_id    = excluded.user_id,
        company_id = excluded.company_id,
        expires_at = excluded.expires_at,
        updated_at = @now
    `).run({ ...data, now });
  }

  load(phone: string): StoredToken | undefined {
    return this.db.prepare('SELECT * FROM tokens WHERE phone = ?').get(phone) as StoredToken | undefined;
  }

  loadLatest(): StoredToken | undefined {
    return this.db.prepare('SELECT * FROM tokens ORDER BY updated_at DESC LIMIT 1').get() as StoredToken | undefined;
  }

  delete(phone: string) {
    this.db.prepare('DELETE FROM tokens WHERE phone = ?').run(phone);
  }

  isExpired(token: StoredToken, bufferSeconds = 300): boolean {
    const now = Math.floor(Date.now() / 1000);
    return token.expires_at - bufferSeconds <= now;
  }

  close() {
    this.db.close();
  }
}
