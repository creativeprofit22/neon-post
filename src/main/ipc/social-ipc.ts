import { ipcMain } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import { SettingsManager } from '../../settings';
import { searchContent } from '../../social/scraping/index';
import type { ScrapingPlatform } from '../../social/scraping/index';
import type { GeneratedContentType } from '../../memory/generated-content';
import type { SocialPostStatus } from '../../memory/social-posts';
import type { IPCDependencies } from './types';

export function registerSocialIpc(deps: IPCDependencies): void {
  const { getMemory } = deps;

  // ============ Account CRUD ============

  ipcMain.handle('social:listAccounts', async () => {
    try {
      const memory = getMemory();
      if (!memory) return [];
      const accounts = memory.socialAccounts.getAll();
      return accounts.map((account) => ({
        id: account.id,
        platform: account.platform,
        account_name: account.account_name,
        display_name: account.display_name,
        active: account.active,
        hasCredentials: !!(account.access_token || account.metadata),
        created_at: account.created_at,
        updated_at: account.updated_at,
      }));
    } catch (err) {
      console.error('[SocialIPC] listAccounts error:', err);
      return [];
    }
  });

  ipcMain.handle('social:getAccount', async (_, id: string) => {
    try {
      const memory = getMemory();
      if (!memory) return null;
      return memory.socialAccounts.getById(id);
    } catch (err) {
      console.error('[SocialIPC] getAccount error:', err);
      return null;
    }
  });

  ipcMain.handle(
    'social:addAccount',
    async (
      _,
      input: {
        platform: string;
        account_name: string;
        display_name?: string | null;
        access_token?: string | null;
        refresh_token?: string | null;
        metadata?: string | null;
      }
    ) => {
      try {
        const memory = getMemory();
        if (!memory) return { success: false, error: 'Memory not initialized' };
        const account = memory.socialAccounts.create(input);
        return { success: true, id: account.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SocialIPC] addAccount error:', err);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'social:updateAccount',
    async (
      _,
      id: string,
      updates: {
        platform?: string;
        account_name?: string;
        display_name?: string | null;
        access_token?: string | null;
        refresh_token?: string | null;
        token_expires_at?: string | null;
        scopes?: string | null;
        metadata?: string | null;
        active?: boolean;
      }
    ) => {
      try {
        const memory = getMemory();
        if (!memory) return { success: false, error: 'Memory not initialized' };
        memory.socialAccounts.update(id, updates ?? {});
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SocialIPC] updateAccount error:', err);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('social:removeAccount', async (_, id: string) => {
    try {
      const memory = getMemory();
      if (!memory) return { success: false, error: 'Memory not initialized' };
      memory.socialAccounts.delete(id);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] removeAccount error:', err);
      return { success: false, error: message };
    }
  });

  // ============ Scraping Key Validation ============

  ipcMain.handle('social:validateApifyKey', async (_, apiKey: string) => {
    try {
      const trimmed = (apiKey || '').trim();
      if (!trimmed) return { valid: false, error: 'API key is empty' };
      // Apify supports both Bearer token and ?token= query param — use query param as it's more reliable
      const response = await fetch(
        `https://api.apify.com/v2/users/me?token=${encodeURIComponent(trimmed)}`
      );
      console.log(`[SocialIPC] Apify validation response: ${response.status}`);
      if (response.ok) {
        return { valid: true };
      }
      const text = await response.text().catch(() => response.statusText);
      console.warn(`[SocialIPC] Apify validation failed: ${response.status} ${text}`);
      return { valid: false, error: text || `HTTP ${response.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] validateApifyKey error:', message);
      return { valid: false, error: message };
    }
  });

  ipcMain.handle('social:validateRapidAPIKey', async (_, apiKey: string) => {
    try {
      const response = await fetch(
        'https://tiktok-scraper7.p.rapidapi.com/user/info?unique_id=tiktok',
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'tiktok-scraper7.p.rapidapi.com',
          },
        }
      );
      // RapidAPI returns 403 for invalid keys and 200/other for valid ones
      if (response.status !== 403 && response.status !== 401) {
        return { valid: true };
      }
      const text = await response.text().catch(() => response.statusText);
      return { valid: false, error: text || `HTTP ${response.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] validateRapidAPIKey error:', err);
      return { valid: false, error: message };
    }
  });

  // ============ Brand Voice ============

  ipcMain.handle('social:saveBrand', async (_, brandData: unknown) => {
    try {
      SettingsManager.set('social.brand', JSON.stringify(brandData));
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] saveBrand error:', err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('social:getBrand', async () => {
    try {
      const raw = SettingsManager.get('social.brand');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('[SocialIPC] getBrand error:', err);
      return null;
    }
  });

  // ============ Content Discovery ============

  ipcMain.handle('social:searchContent', async (_, query: string, platform?: string) => {
    try {
      const results = await searchContent((platform ?? 'youtube') as ScrapingPlatform, query);
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] searchContent error:', err);
      return { error: message };
    }
  });

  ipcMain.handle('social:getDiscovered', async (_, limit?: number) => {
    try {
      const memory = getMemory();
      if (!memory) return [];
      return memory.discoveredContent.getRecent(limit ?? 50);
    } catch (err) {
      console.error('[SocialIPC] getDiscovered error:', err);
      return [];
    }
  });

  // ============ Social Posts ============

  ipcMain.handle('social:listPosts', async (_, status?: string) => {
    try {
      const memory = getMemory();
      if (!memory) return [];
      if (status) {
        return memory.socialPosts.getByStatus(status as SocialPostStatus);
      }
      return memory.socialPosts.getAll();
    } catch (err) {
      console.error('[SocialIPC] listPosts error:', err);
      return [];
    }
  });

  ipcMain.handle(
    'social:createPost',
    async (
      _,
      input: {
        platform: string;
        content: string;
        status?: SocialPostStatus;
        social_account_id?: string | null;
        media_urls?: string | null;
        scheduled_at?: string | null;
        metadata?: string | null;
      }
    ) => {
      try {
        const memory = getMemory();
        if (!memory) return { success: false, error: 'Memory not initialized' };
        const post = memory.socialPosts.create(input);
        return { success: true, id: post.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SocialIPC] createPost error:', err);
        return { success: false, error: message };
      }
    }
  );

  // ============ Generated Content ============

  ipcMain.handle('social:getGenerated', async (_, limit?: number) => {
    try {
      const memory = getMemory();
      if (!memory) return [];
      const all = memory.generatedContent.getAll();
      return limit ? all.slice(0, limit) : all;
    } catch (err) {
      console.error('[SocialIPC] getGenerated error:', err);
      return [];
    }
  });

  ipcMain.handle('social:deleteGenerated', async (_, id: string) => {
    try {
      const memory = getMemory();
      if (!memory) return { success: false, error: 'Memory not initialized' };
      const deleted = memory.generatedContent.delete(id);
      if (!deleted) return { success: false, error: 'Record not found' };
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] deleteGenerated error:', err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('social:favoriteGenerated', async (_, id: string, rating: number) => {
    try {
      const memory = getMemory();
      if (!memory) return { success: false, error: 'Memory not initialized' };
      const updated = memory.generatedContent.update(id, { rating });
      if (!updated) return { success: false, error: 'Record not found' };
      return { success: true, data: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SocialIPC] favoriteGenerated error:', err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    'social:generateContent',
    async (
      _,
      input: {
        content_type: GeneratedContentType;
        platform?: string | null;
        prompt_used?: string | null;
      }
    ) => {
      try {
        const memory = getMemory();
        if (!memory) return { success: false, error: 'Memory not initialized' };

        const prompt = input.prompt_used;
        if (!prompt) return { success: false, error: 'No prompt provided' };

        const apiKey = SettingsManager.get('anthropic.apiKey');
        if (!apiKey) return { success: false, error: 'Anthropic API key not configured' };

        const model = SettingsManager.get('agent.model') || 'claude-3-5-haiku-20241022';

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });

        const output = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');

        const generated = memory.generatedContent.create({
          content_type: input.content_type,
          platform: input.platform ?? null,
          prompt_used: prompt,
          output,
        });

        return { success: true, data: generated };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SocialIPC] generateContent error:', err);
        return { success: false, error: message };
      }
    }
  );
}
