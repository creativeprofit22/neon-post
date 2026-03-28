/**
 * Social tools for the agent
 *
 * 14 tools for social media operations:
 * - search_content: Search content across platforms
 * - scrape_profile: Scrape a user's profile posts
 * - get_trending: Get trending content
 * - download_video: Download video from URL
 * - post_content: Post content to a platform
 * - schedule_post: Schedule a post for later
 * - list_social_accounts: List connected social accounts
 * - list_social_posts: List tracked social posts
 * - process_video: Process/edit a video file
 * - transcribe_video: Transcribe audio/video to text
 * - generate_content: Generate social media content (captions, hooks, etc.)
 * - save_content: Save discovered or generated content to the database
 * - reply_to_comment: Reply to a comment on social media
 * - flag_comment: Flag a comment for review
 */

import { MemoryManager } from '../memory';
import { searchContent, scrapeProfile, getTrendingTikTok, downloadVideo } from '../social/scraping';
import type { ScrapingPlatform } from '../social/scraping';
import { postContent, buildCredentialsFromAccount } from '../social/posting';
import { Platform } from '../social/posting/types';
import type { PlatformPostOptions } from '../social/posting/types';
import { processVideo } from '../social/video/pipeline';
import { transcribeVideo } from '../social/video/transcribe';
import { fetchComments, prioritizeComments } from '../social/engagement/monitor';
import { postReply } from '../social/engagement/reply';
import { captionPrompt, hookPrompt, threadPrompt, scriptPrompt } from '../social/content/prompts';
import type {
  ContentPromptContext,
  HookPromptContext,
  ThreadPromptContext,
  ScriptPromptContext,
} from '../social/content/prompts';

let memoryManager: MemoryManager | null = null;

export function setSocialMemoryManager(memory: MemoryManager): void {
  memoryManager = memory;
}

// ── Tool Definitions ──

function getSearchContentDefinition() {
  return {
    name: 'search_content',
    description:
      'Search social media content across platforms (YouTube, TikTok, Instagram, Twitter, Reddit). Returns matching posts/videos with metadata.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform to search: youtube, tiktok, instagram, twitter, reddit',
        },
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (1-20, default 10)',
        },
      },
      required: ['platform', 'query'],
    },
  };
}

async function handleSearchContent(input: unknown): Promise<string> {
  const { platform, query, limit } = input as {
    platform: string;
    query: string;
    limit?: number;
  };

  if (!platform || !query) {
    return JSON.stringify({ error: 'Missing required fields: platform, query' });
  }

  try {
    const results = await searchContent(platform as ScrapingPlatform, query, { limit });
    console.log(`[SearchContent] Found ${results.length} results for "${query}" on ${platform}`);
    return JSON.stringify({ success: true, count: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getScrapeProfileDefinition() {
  return {
    name: 'scrape_profile',
    description:
      "Scrape a user's social media profile for their recent posts. Supports TikTok, Instagram, and YouTube.",
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform: youtube, tiktok, instagram',
        },
        username: {
          type: 'string',
          description: 'Username or channel name to scrape (with or without @)',
        },
        limit: {
          type: 'number',
          description: 'Max posts to return (1-20, default 10)',
        },
      },
      required: ['platform', 'username'],
    },
  };
}

async function handleScrapeProfile(input: unknown): Promise<string> {
  const { platform, username, limit } = input as {
    platform: string;
    username: string;
    limit?: number;
  };

  if (!platform || !username) {
    return JSON.stringify({ error: 'Missing required fields: platform, username' });
  }

  try {
    const results = await scrapeProfile(platform as ScrapingPlatform, username, { limit });
    console.log(`[ScrapeProfile] Found ${results.length} posts for @${username} on ${platform}`);
    return JSON.stringify({ success: true, count: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getGetTrendingDefinition() {
  return {
    name: 'get_trending',
    description:
      'Get trending content. Currently supports TikTok trending videos with optional region filter.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform: tiktok (more platforms coming soon)',
        },
        region: {
          type: 'string',
          description: 'Region code (e.g. "US", "GB") for localized trending',
        },
        count: {
          type: 'number',
          description: 'Number of trending items to return (default 20)',
        },
      },
      required: ['platform'],
    },
  };
}

async function handleGetTrending(input: unknown): Promise<string> {
  const { platform, region, count } = input as {
    platform: string;
    region?: string;
    count?: number;
  };

  if (!platform) {
    return JSON.stringify({ error: 'Missing required field: platform' });
  }

  try {
    if (platform !== 'tiktok') {
      return JSON.stringify({
        error: `Trending is currently only supported for TikTok. Got: ${platform}`,
      });
    }

    const results = await getTrendingTikTok(region, count);
    console.log(`[GetTrending] Found ${results.length} trending items on ${platform}`);
    return JSON.stringify({ success: true, count: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getDownloadVideoDefinition() {
  return {
    name: 'download_video',
    description:
      'Download a video from a URL (YouTube, TikTok, Instagram, etc.). Uses yt-dlp with HTTP fallback.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the video to download',
        },
        output_dir: {
          type: 'string',
          description: 'Directory to save the downloaded video',
        },
      },
      required: ['url', 'output_dir'],
    },
  };
}

async function handleDownloadVideo(input: unknown): Promise<string> {
  const { url, output_dir } = input as {
    url: string;
    output_dir: string;
  };

  if (!url || !output_dir) {
    return JSON.stringify({ error: 'Missing required fields: url, output_dir' });
  }

  try {
    const filePath = await downloadVideo(url, output_dir);
    console.log(`[DownloadVideo] Downloaded: ${filePath}`);
    return JSON.stringify({ success: true, filePath });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getPostContentDefinition() {
  return {
    name: 'post_content',
    description:
      'Post content to a social media platform. Requires a connected account with valid credentials. Supports TikTok, YouTube, Instagram, X/Twitter, and LinkedIn.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform: tiktok, youtube, instagram, x, linkedin',
        },
        account_id: {
          type: 'string',
          description: 'Social account ID to post from (from list_social_accounts)',
        },
        text: {
          type: 'string',
          description: 'Post text/caption content',
        },
        media_files: {
          type: 'string',
          description: 'Comma-separated local file paths for media attachments',
        },
        title: {
          type: 'string',
          description: 'Title (required for YouTube)',
        },
        privacy: {
          type: 'string',
          description: 'Visibility: public, private, unlisted',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated hashtags (without #)',
        },
      },
      required: ['platform', 'account_id', 'text'],
    },
  };
}

async function handlePostContent(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { platform, account_id, text, media_files, title, privacy, tags } = input as {
    platform: string;
    account_id: string;
    text: string;
    media_files?: string;
    title?: string;
    privacy?: string;
    tags?: string;
  };

  if (!platform || !account_id || !text) {
    return JSON.stringify({ error: 'Missing required fields: platform, account_id, text' });
  }

  const account = memoryManager.socialAccounts.getById(account_id);
  if (!account) {
    return JSON.stringify({ error: `Social account not found: ${account_id}` });
  }

  const credentials = buildCredentialsFromAccount(account);
  const platformEnum = platform.toLowerCase() as Platform;

  const postOptions: PlatformPostOptions = {
    platform: platformEnum as Platform,
    text,
    credentials,
    mediaFiles: media_files ? media_files.split(',').map((f) => f.trim()) : undefined,
    title: title ?? text.slice(0, 100),
    privacy: (privacy as 'public' | 'private' | 'unlisted') ?? 'public',
    tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
  } as PlatformPostOptions;

  try {
    const result = await postContent(postOptions);
    console.log(`[PostContent] ${result.success ? 'Posted' : 'Failed'} on ${platform}`);

    // Track the post in the database
    if (result.success) {
      memoryManager.socialPosts.create({
        social_account_id: account_id,
        platform,
        status: 'posted',
        content: text,
      });
    }

    return JSON.stringify(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getSchedulePostDefinition() {
  return {
    name: 'schedule_post',
    description:
      'Schedule a post for later publishing. Creates a draft/scheduled post entry in the database.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform: tiktok, youtube, instagram, x, linkedin',
        },
        account_id: {
          type: 'string',
          description: 'Social account ID (from list_social_accounts)',
        },
        content: {
          type: 'string',
          description: 'Post content/caption',
        },
        scheduled_at: {
          type: 'string',
          description: 'ISO-8601 datetime for when to publish (e.g. "2024-03-15T14:00:00Z")',
        },
        media_urls: {
          type: 'string',
          description: 'Comma-separated media URLs or file paths',
        },
      },
      required: ['platform', 'content', 'scheduled_at'],
    },
  };
}

async function handleSchedulePost(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { platform, account_id, content, scheduled_at, media_urls } = input as {
    platform: string;
    account_id?: string;
    content: string;
    scheduled_at: string;
    media_urls?: string;
  };

  if (!platform || !content || !scheduled_at) {
    return JSON.stringify({ error: 'Missing required fields: platform, content, scheduled_at' });
  }

  try {
    const post = memoryManager.socialPosts.create({
      social_account_id: account_id ?? null,
      platform,
      status: 'scheduled',
      content,
      scheduled_at,
      media_urls: media_urls ?? null,
    });

    console.log(`[SchedulePost] Scheduled post ${post.id} for ${scheduled_at} on ${platform}`);
    return JSON.stringify({
      success: true,
      message: `Post scheduled for ${scheduled_at}`,
      post_id: post.id,
      platform,
      scheduled_at,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getListSocialAccountsDefinition() {
  return {
    name: 'list_social_accounts',
    description:
      'List all connected social media accounts. Shows platform, username, and active status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Optional: filter by platform (tiktok, youtube, instagram, x, linkedin)',
        },
        active_only: {
          type: 'string',
          description: 'If "true", show only active accounts (default: all)',
        },
      },
      required: [],
    },
  };
}

async function handleListSocialAccounts(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { platform, active_only } = input as {
    platform?: string;
    active_only?: string;
  };

  try {
    let accounts;
    if (active_only === 'true') {
      accounts = memoryManager.socialAccounts.getActive();
    } else if (platform) {
      accounts = memoryManager.socialAccounts.getByPlatform(platform);
    } else {
      accounts = memoryManager.socialAccounts.getAll();
    }

    // Filter by platform if both platform and active_only are set
    if (platform && active_only === 'true') {
      accounts = accounts.filter((a) => a.platform === platform);
    }

    return JSON.stringify({
      success: true,
      count: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        account_name: a.account_name,
        display_name: a.display_name,
        active: a.active,
        created_at: a.created_at,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getListSocialPostsDefinition() {
  return {
    name: 'list_social_posts',
    description: 'List tracked social media posts. Filter by platform, status, or account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Filter by platform',
        },
        status: {
          type: 'string',
          description: 'Filter by status: draft, scheduled, posting, posted, failed',
        },
        account_id: {
          type: 'string',
          description: 'Filter by social account ID',
        },
        limit: {
          type: 'number',
          description: 'Max posts to return (default: all)',
        },
      },
      required: [],
    },
  };
}

async function handleListSocialPosts(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { platform, status, account_id, limit } = input as {
    platform?: string;
    status?: string;
    account_id?: string;
    limit?: number;
  };

  try {
    let posts;
    if (status) {
      posts = memoryManager.socialPosts.getByStatus(
        status as 'draft' | 'scheduled' | 'posting' | 'posted' | 'failed'
      );
    } else if (platform) {
      posts = memoryManager.socialPosts.getByPlatform(platform);
    } else if (account_id) {
      posts = memoryManager.socialPosts.getByAccount(account_id);
    } else {
      posts = memoryManager.socialPosts.getAll();
    }

    if (limit && limit > 0) {
      posts = posts.slice(0, limit);
    }

    return JSON.stringify({
      success: true,
      count: posts.length,
      posts: posts.map((p) => ({
        id: p.id,
        platform: p.platform,
        status: p.status,
        content: p.content.slice(0, 200) + (p.content.length > 200 ? '...' : ''),
        scheduled_at: p.scheduled_at,
        posted_at: p.posted_at,
        external_url: p.external_url,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        views: p.views,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getProcessVideoDefinition() {
  return {
    name: 'process_video',
    description:
      'Process/edit a video file. Supports trimming, resolution changes, effects, and caption overlays. Requires the video engine (effect_engine).',
    input_schema: {
      type: 'object' as const,
      properties: {
        input_path: {
          type: 'string',
          description: 'Absolute path to the input video file',
        },
        output_path: {
          type: 'string',
          description: 'Absolute path for the output video file',
        },
        resolution: {
          type: 'string',
          description:
            'Target resolution (e.g. "1080x1920" for vertical, "1920x1080" for landscape)',
        },
        trim_start: {
          type: 'number',
          description: 'Trim start time in seconds',
        },
        trim_end: {
          type: 'number',
          description: 'Trim end time in seconds',
        },
      },
      required: ['input_path', 'output_path'],
    },
  };
}

async function handleProcessVideo(input: unknown): Promise<string> {
  const { input_path, output_path, resolution, trim_start, trim_end } = input as {
    input_path: string;
    output_path: string;
    resolution?: string;
    trim_start?: number;
    trim_end?: number;
  };

  if (!input_path || !output_path) {
    return JSON.stringify({ error: 'Missing required fields: input_path, output_path' });
  }

  try {
    const result = await processVideo({
      inputPath: input_path,
      outputPath: output_path,
      resolution,
      trimStart: trim_start,
      trimEnd: trim_end,
    });

    console.log(
      `[ProcessVideo] ${result.success ? 'Processed' : 'Failed'}: ${input_path} → ${output_path}`
    );
    return JSON.stringify(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getTranscribeVideoDefinition() {
  return {
    name: 'transcribe_video',
    description:
      'Transcribe audio/video to text with timestamps. Uses Whisper via the video engine. Returns segments with timing data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        input_path: {
          type: 'string',
          description: 'Absolute path to the audio/video file',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g. "en", "es") — auto-detected if omitted',
        },
        model_size: {
          type: 'string',
          description: 'Whisper model size: tiny, base, small, medium, large (default: base)',
        },
        output_path: {
          type: 'string',
          description: 'Optional: path to write transcript file (srt/vtt/json/txt)',
        },
        output_format: {
          type: 'string',
          description: 'Output format: srt, vtt, json, txt (default: json)',
        },
      },
      required: ['input_path'],
    },
  };
}

async function handleTranscribeVideo(input: unknown): Promise<string> {
  const { input_path, language, model_size, output_path, output_format } = input as {
    input_path: string;
    language?: string;
    model_size?: string;
    output_path?: string;
    output_format?: string;
  };

  if (!input_path) {
    return JSON.stringify({ error: 'Missing required field: input_path' });
  }

  try {
    const result = await transcribeVideo({
      inputPath: input_path,
      language,
      modelSize: model_size as 'tiny' | 'base' | 'small' | 'medium' | 'large' | undefined,
      outputPath: output_path,
      outputFormat: output_format as 'srt' | 'vtt' | 'json' | 'txt' | undefined,
    });

    console.log(`[TranscribeVideo] ${result.success ? 'Transcribed' : 'Failed'}: ${input_path}`);
    return JSON.stringify(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getGenerateContentDefinition() {
  return {
    name: 'generate_content',
    description:
      'Generate social media content: captions, hooks, threads, or scripts. Returns a prompt ready for content generation. Use with a follow-up LLM call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content_type: {
          type: 'string',
          description: 'Type of content: caption, hook, thread, script',
        },
        platform: {
          type: 'string',
          description: 'Target platform: tiktok, youtube, instagram, x, linkedin',
        },
        topic: {
          type: 'string',
          description: 'Topic or subject for the content',
        },
        brand_voice: {
          type: 'string',
          description: 'Brand voice description (optional)',
        },
        brand_tone: {
          type: 'string',
          description: 'Brand tone (e.g. casual, professional)',
        },
        count: {
          type: 'number',
          description: 'Number of variations (for hooks, default 5)',
        },
        thread_length: {
          type: 'number',
          description: 'Number of posts in thread (default 7)',
        },
        duration_seconds: {
          type: 'number',
          description: 'Target video duration for scripts (default 60)',
        },
      },
      required: ['content_type', 'platform', 'topic'],
    },
  };
}

async function handleGenerateContent(input: unknown): Promise<string> {
  const {
    content_type,
    platform,
    topic,
    brand_voice,
    brand_tone,
    count,
    thread_length,
    duration_seconds,
  } = input as {
    content_type: string;
    platform: string;
    topic: string;
    brand_voice?: string;
    brand_tone?: string;
    count?: number;
    thread_length?: number;
    duration_seconds?: number;
  };

  if (!content_type || !platform || !topic) {
    return JSON.stringify({
      error: 'Missing required fields: content_type, platform, topic',
    });
  }

  const baseCtx: ContentPromptContext = {
    platform,
    topic,
    brandVoice: brand_voice,
    brandTone: brand_tone,
  };

  try {
    let prompt: string;

    switch (content_type) {
      case 'caption':
        prompt = captionPrompt(baseCtx);
        break;
      case 'hook':
        prompt = hookPrompt({ ...baseCtx, count } as HookPromptContext);
        break;
      case 'thread':
        prompt = threadPrompt({ ...baseCtx, threadLength: thread_length } as ThreadPromptContext);
        break;
      case 'script':
        prompt = scriptPrompt({
          ...baseCtx,
          durationSeconds: duration_seconds,
        } as ScriptPromptContext);
        break;
      default:
        return JSON.stringify({ error: `Unsupported content type: ${content_type}` });
    }

    console.log(`[GenerateContent] Generated ${content_type} prompt for ${platform}: "${topic}"`);
    return JSON.stringify({
      success: true,
      content_type,
      platform,
      topic,
      prompt,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getSaveContentDefinition() {
  return {
    name: 'save_content',
    description:
      'Save discovered or generated content to the database for later use. Use for bookmarking interesting content or storing generated drafts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'Content type: discovered or generated',
        },
        platform: {
          type: 'string',
          description: 'Source platform',
        },
        title: {
          type: 'string',
          description: 'Content title',
        },
        body: {
          type: 'string',
          description: 'Content body/text',
        },
        source_url: {
          type: 'string',
          description: 'URL of the source content (for discovered)',
        },
        source_author: {
          type: 'string',
          description: 'Author of the source content (for discovered)',
        },
        content_type: {
          type: 'string',
          description: 'Subtype: caption, hook, thread, script, video, post (for generated)',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
      },
      required: ['type', 'platform', 'body'],
    },
  };
}

async function handleSaveContent(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { type, platform, title, body, source_url, source_author, content_type, tags } = input as {
    type: string;
    platform: string;
    title?: string;
    body: string;
    source_url?: string;
    source_author?: string;
    content_type?: string;
    tags?: string;
  };

  if (!type || !platform || !body) {
    return JSON.stringify({ error: 'Missing required fields: type, platform, body' });
  }

  try {
    if (type === 'discovered') {
      const saved = memoryManager.discoveredContent.create({
        platform,
        content_type: content_type ?? 'post',
        title: title ?? null,
        body,
        source_url: source_url ?? null,
        source_author: source_author ?? null,
        tags: tags ?? null,
      });
      console.log(`[SaveContent] Saved discovered content: ${saved.id}`);
      return JSON.stringify({ success: true, id: saved.id, type: 'discovered' });
    } else if (type === 'generated') {
      const saved = memoryManager.generatedContent.create({
        content_type: (content_type ?? 'caption') as
          | 'caption'
          | 'hook'
          | 'thread'
          | 'script'
          | 'image_prompt'
          | 'image'
          | 'carousel'
          | 'story',
        platform,
        output: body,
        prompt_used: title ?? null,
      });
      console.log(`[SaveContent] Saved generated content: ${saved.id}`);
      return JSON.stringify({ success: true, id: saved.id, type: 'generated' });
    } else {
      return JSON.stringify({
        error: `Unknown content type: ${type}. Use "discovered" or "generated".`,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getReplyToCommentDefinition() {
  return {
    name: 'reply_to_comment',
    description:
      'Reply to a comment on social media. Fetches comments for a post and posts a reply. Supports X/Twitter and YouTube.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform: youtube, x, tiktok, instagram, linkedin',
        },
        post_external_id: {
          type: 'string',
          description: 'External post/video ID to fetch comments from',
        },
        comment_id: {
          type: 'string',
          description: 'ID of the specific comment to reply to',
        },
        reply_text: {
          type: 'string',
          description: 'Reply text to post',
        },
        account_id: {
          type: 'string',
          description: 'Social account ID for credentials',
        },
      },
      required: ['platform', 'comment_id', 'reply_text', 'account_id'],
    },
  };
}

async function handleReplyToComment(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { platform, comment_id, reply_text, account_id } = input as {
    platform: string;
    post_external_id?: string;
    comment_id: string;
    reply_text: string;
    account_id: string;
  };

  if (!platform || !comment_id || !reply_text || !account_id) {
    return JSON.stringify({
      error: 'Missing required fields: platform, comment_id, reply_text, account_id',
    });
  }

  const account = memoryManager.socialAccounts.getById(account_id);
  if (!account) {
    return JSON.stringify({ error: `Social account not found: ${account_id}` });
  }

  const credentials = buildCredentialsFromAccount(account);

  try {
    const result = await postReply({
      platform,
      comment: {
        externalId: comment_id,
        platform,
        text: '',
        authorUsername: '',
        likeCount: 0,
        replyCount: 0,
        publishedAt: new Date().toISOString(),
      },
      replyText: reply_text,
      credentials,
    });

    console.log(
      `[ReplyToComment] ${result.success ? 'Replied' : 'Failed'} on ${platform} to ${comment_id}`
    );

    // Log engagement
    if (result.success) {
      memoryManager.engagementLog.create({
        social_account_id: account_id,
        platform,
        action: 'reply',
        target_url: comment_id,
        content: reply_text,
        external_id: result.replyId ?? null,
        success: true,
      });
    }

    return JSON.stringify(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

function getFlagCommentDefinition() {
  return {
    name: 'flag_comment',
    description:
      'Flag a comment for review. Fetches comments for a post and prioritizes which ones need attention (questions, high engagement, negative sentiment).',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          description: 'Platform: youtube, tiktok, reddit',
        },
        post_external_id: {
          type: 'string',
          description: 'External post/video ID',
        },
        post_url: {
          type: 'string',
          description: 'Post URL (needed for TikTok)',
        },
        limit: {
          type: 'number',
          description: 'Number of comments to fetch (default 20)',
        },
        min_likes: {
          type: 'number',
          description: 'Minimum likes to consider "high engagement" (default 5)',
        },
      },
      required: ['platform', 'post_external_id'],
    },
  };
}

async function handleFlagComment(input: unknown): Promise<string> {
  const { platform, post_external_id, post_url, limit, min_likes } = input as {
    platform: string;
    post_external_id: string;
    post_url?: string;
    limit?: number;
    min_likes?: number;
  };

  if (!platform || !post_external_id) {
    return JSON.stringify({ error: 'Missing required fields: platform, post_external_id' });
  }

  try {
    const result = await fetchComments({
      platform,
      externalPostId: post_external_id,
      postUrl: post_url,
      limit,
    });

    if (!result.success) {
      return JSON.stringify({ success: false, error: result.error });
    }

    const prioritized = prioritizeComments(result.comments, { minLikes: min_likes });

    console.log(
      `[FlagComment] Fetched ${result.comments.length} comments, prioritized ${prioritized.length} for ${platform}/${post_external_id}`
    );

    return JSON.stringify({
      success: true,
      total_comments: result.totalCount ?? result.comments.length,
      flagged_count: prioritized.length,
      flagged_comments: prioritized.slice(0, 10).map((c) => ({
        id: c.externalId,
        author: c.authorUsername,
        text: c.text,
        likes: c.likeCount,
        replies: c.replyCount,
        published_at: c.publishedAt,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

// ── Export all tools ──

/**
 * Get all social media tools
 */
export function getSocialTools() {
  return [
    {
      ...getSearchContentDefinition(),
      handler: handleSearchContent,
    },
    {
      ...getScrapeProfileDefinition(),
      handler: handleScrapeProfile,
    },
    {
      ...getGetTrendingDefinition(),
      handler: handleGetTrending,
    },
    {
      ...getDownloadVideoDefinition(),
      handler: handleDownloadVideo,
    },
    {
      ...getPostContentDefinition(),
      handler: handlePostContent,
    },
    {
      ...getSchedulePostDefinition(),
      handler: handleSchedulePost,
    },
    {
      ...getListSocialAccountsDefinition(),
      handler: handleListSocialAccounts,
    },
    {
      ...getListSocialPostsDefinition(),
      handler: handleListSocialPosts,
    },
    {
      ...getProcessVideoDefinition(),
      handler: handleProcessVideo,
    },
    {
      ...getTranscribeVideoDefinition(),
      handler: handleTranscribeVideo,
    },
    {
      ...getGenerateContentDefinition(),
      handler: handleGenerateContent,
    },
    {
      ...getSaveContentDefinition(),
      handler: handleSaveContent,
    },
    {
      ...getReplyToCommentDefinition(),
      handler: handleReplyToComment,
    },
    {
      ...getFlagCommentDefinition(),
      handler: handleFlagComment,
    },
  ];
}
