import crypto from 'crypto';
import Database from 'better-sqlite3';

// ============ Types ============

export interface DiscoveredContent {
  id: string;
  social_account_id: string | null;
  platform: string;
  source_url: string | null;
  source_author: string | null;
  content_type: string;
  title: string | null;
  body: string | null;
  media_urls: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  discovered_at: string;
  tags: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDiscoveredContentInput {
  social_account_id?: string | null;
  platform: string;
  source_url?: string | null;
  source_author?: string | null;
  content_type: string;
  title?: string | null;
  body?: string | null;
  media_urls?: string | null;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  tags?: string | null;
  metadata?: string | null;
}

export interface UpdateDiscoveredContentInput {
  social_account_id?: string | null;
  platform?: string;
  source_url?: string | null;
  source_author?: string | null;
  content_type?: string;
  title?: string | null;
  body?: string | null;
  media_urls?: string | null;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  tags?: string | null;
  metadata?: string | null;
}

// ============ Schema ============

export const DISCOVERED_CONTENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS discovered_content (
    id TEXT PRIMARY KEY,
    social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    source_url TEXT,
    source_author TEXT,
    content_type TEXT NOT NULL,
    title TEXT,
    body TEXT,
    media_urls TEXT,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    discovered_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
    tags TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
  );

  CREATE INDEX IF NOT EXISTS idx_discovered_content_platform
    ON discovered_content(platform);
  CREATE INDEX IF NOT EXISTS idx_discovered_content_type
    ON discovered_content(content_type);
  CREATE INDEX IF NOT EXISTS idx_discovered_content_discovered_at
    ON discovered_content(discovered_at);
  CREATE INDEX IF NOT EXISTS idx_discovered_content_account
    ON discovered_content(social_account_id);
`;

// ============ CRUD Class ============

export class DiscoveredContentStore {
  constructor(private db: Database.Database) {}

  create(input: CreateDiscoveredContentInput): DiscoveredContent {
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO discovered_content
           (id, social_account_id, platform, source_url, source_author, content_type,
            title, body, media_urls, likes, comments, shares, views, tags, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.social_account_id ?? null,
        input.platform,
        input.source_url ?? null,
        input.source_author ?? null,
        input.content_type,
        input.title ?? null,
        input.body ?? null,
        input.media_urls ?? null,
        input.likes ?? 0,
        input.comments ?? 0,
        input.shares ?? 0,
        input.views ?? 0,
        input.tags ?? null,
        input.metadata ?? null
      );
    return this.getById(id)!;
  }

  getById(id: string): DiscoveredContent | null {
    const row = this.db.prepare('SELECT * FROM discovered_content WHERE id = ?').get(id) as
      | DiscoveredContent
      | undefined;
    return row ?? null;
  }

  getAll(): DiscoveredContent[] {
    return this.db
      .prepare('SELECT * FROM discovered_content ORDER BY discovered_at DESC')
      .all() as DiscoveredContent[];
  }

  update(id: string, input: UpdateDiscoveredContentInput): DiscoveredContent | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.social_account_id !== undefined) {
      fields.push('social_account_id = ?');
      values.push(input.social_account_id);
    }
    if (input.platform !== undefined) {
      fields.push('platform = ?');
      values.push(input.platform);
    }
    if (input.source_url !== undefined) {
      fields.push('source_url = ?');
      values.push(input.source_url);
    }
    if (input.source_author !== undefined) {
      fields.push('source_author = ?');
      values.push(input.source_author);
    }
    if (input.content_type !== undefined) {
      fields.push('content_type = ?');
      values.push(input.content_type);
    }
    if (input.title !== undefined) {
      fields.push('title = ?');
      values.push(input.title);
    }
    if (input.body !== undefined) {
      fields.push('body = ?');
      values.push(input.body);
    }
    if (input.media_urls !== undefined) {
      fields.push('media_urls = ?');
      values.push(input.media_urls);
    }
    if (input.likes !== undefined) {
      fields.push('likes = ?');
      values.push(input.likes);
    }
    if (input.comments !== undefined) {
      fields.push('comments = ?');
      values.push(input.comments);
    }
    if (input.shares !== undefined) {
      fields.push('shares = ?');
      values.push(input.shares);
    }
    if (input.views !== undefined) {
      fields.push('views = ?');
      values.push(input.views);
    }
    if (input.tags !== undefined) {
      fields.push('tags = ?');
      values.push(input.tags);
    }
    if (input.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(input.metadata);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ'))");
    values.push(id);

    this.db
      .prepare(`UPDATE discovered_content SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM discovered_content WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============ Domain-specific queries ============

  getByPlatform(platform: string): DiscoveredContent[] {
    return this.db
      .prepare('SELECT * FROM discovered_content WHERE platform = ? ORDER BY discovered_at DESC')
      .all(platform) as DiscoveredContent[];
  }

  getByContentType(contentType: string): DiscoveredContent[] {
    return this.db
      .prepare(
        'SELECT * FROM discovered_content WHERE content_type = ? ORDER BY discovered_at DESC'
      )
      .all(contentType) as DiscoveredContent[];
  }

  getTopByEngagement(limit: number = 20): DiscoveredContent[] {
    return this.db
      .prepare(
        `SELECT * FROM discovered_content
         ORDER BY (likes + comments + shares + views) DESC
         LIMIT ?`
      )
      .all(limit) as DiscoveredContent[];
  }

  getByAccount(socialAccountId: string): DiscoveredContent[] {
    return this.db
      .prepare(
        'SELECT * FROM discovered_content WHERE social_account_id = ? ORDER BY discovered_at DESC'
      )
      .all(socialAccountId) as DiscoveredContent[];
  }

  getRecent(limit: number = 50): DiscoveredContent[] {
    return this.db
      .prepare('SELECT * FROM discovered_content ORDER BY discovered_at DESC LIMIT ?')
      .all(limit) as DiscoveredContent[];
  }
}
