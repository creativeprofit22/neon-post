/**
 * Apify API Client - Content Scraping
 *
 * Calls Apify actor REST API to scrape TikTok, Instagram, and YouTube.
 * Requires user's Apify API key (stored in SettingsManager).
 */

import type { ContentResult } from './pocket-cli';

const LOG_PREFIX = '[apify]';
const APIFY_BASE = 'https://api.apify.com/v2';
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max

// ── Types ──

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

type ApifyItem = Record<string, unknown>;

// ── Error class ──

export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

// ── Internals ──

function assertApiKey(apiKey: string): void {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new ApifyError('Apify API key is not set. Add your key in Settings.');
  }
}

async function apifyFetch<T>(url: string, apiKey: string, options?: RequestInit): Promise<T> {
  // Use query-param auth (?token=) — more reliable than Bearer header with Apify
  const separator = url.includes('?') ? '&' : '?';
  const authedUrl = `${url}${separator}token=${encodeURIComponent(apiKey)}`;
  const response = await fetch(authedUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new ApifyError('Invalid Apify API key. Check your key in Settings.', response.status);
  }

  if (response.status === 429) {
    throw new ApifyError('Apify rate limit exceeded. Try again later.', 429);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApifyError(
      `Apify API error (HTTP ${response.status}): ${body.slice(0, 200)}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Start an Apify actor run, poll until completion, and return dataset items.
 */
async function runActorAndCollect(
  actorId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<ApifyItem[]> {
  console.log(`${LOG_PREFIX} Starting actor ${actorId}`);

  // Start the run
  const runUrl = `${APIFY_BASE}/acts/${actorId}/runs`;
  const runResponse = await apifyFetch<ApifyRunResponse>(runUrl, apiKey, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  const runId = runResponse.data.id;
  const datasetId = runResponse.data.defaultDatasetId;
  console.log(`${LOG_PREFIX} Run started: ${runId}, dataset: ${datasetId}`);

  // Poll for completion
  const pollUrl = `${APIFY_BASE}/actor-runs/${runId}`;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const status = await apifyFetch<ApifyRunResponse>(pollUrl, apiKey);
    const runStatus = status.data.status;

    if (runStatus === 'SUCCEEDED') {
      console.log(`${LOG_PREFIX} Run ${runId} succeeded`);
      break;
    }

    if (runStatus === 'FAILED' || runStatus === 'ABORTED' || runStatus === 'TIMED-OUT') {
      throw new ApifyError(`Actor run ${runId} ended with status: ${runStatus}`);
    }

    // Still running (READY, RUNNING) — continue polling
  }

  // Fetch dataset items
  const datasetUrl = `${APIFY_BASE}/datasets/${datasetId}/items?format=json`;
  const dataset = await apifyFetch<ApifyItem[]>(datasetUrl, apiKey);

  // The items endpoint returns the array directly (not wrapped in data)
  const items = Array.isArray(dataset) ? dataset : [];
  console.log(`${LOG_PREFIX} Collected ${items.length} items from dataset ${datasetId}`);
  return items;
}

// ── Mappers ──

function mapTikTokItem(item: ApifyItem): ContentResult {
  return {
    platform: 'tiktok',
    externalId: String(item.id ?? item.videoId ?? ''),
    url: String(item.webVideoUrl ?? item.url ?? item.link ?? ''),
    title: String(item.text ?? item.title ?? ''),
    caption: String(item.text ?? item.desc ?? item.description ?? ''),
    views: Number(item.playCount ?? item.plays ?? item.views ?? 0),
    likes: Number(item.diggCount ?? item.likes ?? item.likeCount ?? 0),
    comments: Number(item.commentCount ?? item.comments ?? 0),
    shares: Number(item.shareCount ?? item.shares ?? 0),
    creatorUsername: String(
      item.authorMeta?.toString() === '[object Object]'
        ? ((item.authorMeta as Record<string, unknown>).name ?? '')
        : (item.author ?? item.creatorUsername ?? '')
    ),
  };
}

function mapInstagramItem(item: ApifyItem): ContentResult {
  return {
    platform: 'instagram',
    externalId: String(item.id ?? item.shortCode ?? ''),
    url: String(item.url ?? item.displayUrl ?? item.link ?? ''),
    title: String(item.caption ?? ''),
    caption: String(item.caption ?? item.text ?? item.description ?? ''),
    views: Number(item.videoViewCount ?? item.views ?? item.playCount ?? 0),
    likes: Number(item.likesCount ?? item.likes ?? item.likeCount ?? 0),
    comments: Number(item.commentsCount ?? item.comments ?? item.commentCount ?? 0),
    shares: Number(item.shares ?? item.shareCount ?? 0),
    creatorUsername: String(item.ownerUsername ?? item.owner ?? item.username ?? ''),
  };
}

function mapYouTubeItem(item: ApifyItem): ContentResult {
  return {
    platform: 'youtube',
    externalId: String(item.id ?? item.videoId ?? ''),
    url: String(item.url ?? item.link ?? ''),
    title: String(item.title ?? ''),
    caption: String(item.description ?? item.text ?? ''),
    views: Number(item.viewCount ?? item.views ?? 0),
    likes: Number(item.likes ?? item.likeCount ?? 0),
    comments: Number(item.commentsCount ?? item.commentCount ?? item.comments ?? 0),
    shares: Number(item.shares ?? 0),
    creatorUsername: String(item.channelName ?? item.channelTitle ?? item.author ?? ''),
  };
}

// ── Public API ──

/**
 * Search TikTok via Apify actor.
 */
export async function searchTikTok(
  params: { hashtags?: string[]; query?: string; limit?: number },
  apiKey: string
): Promise<ContentResult[]> {
  assertApiKey(apiKey);

  const input: Record<string, unknown> = {
    resultsPerPage: params.limit ?? 20,
  };
  if (params.hashtags && params.hashtags.length > 0) {
    input.hashtags = params.hashtags;
  }
  if (params.query) {
    input.searchQueries = [params.query];
  }

  const items = await runActorAndCollect('clockworks~tiktok-scraper', input, apiKey);
  return items.map(mapTikTokItem);
}

/**
 * Search Instagram via Apify actor.
 */
export async function searchInstagram(
  params: { hashtags?: string[]; username?: string; limit?: number },
  apiKey: string
): Promise<ContentResult[]> {
  assertApiKey(apiKey);

  const input: Record<string, unknown> = {
    resultsLimit: params.limit ?? 20,
  };
  if (params.hashtags && params.hashtags.length > 0) {
    input.hashtags = params.hashtags;
  }
  if (params.username) {
    input.directUrls = [`https://www.instagram.com/${params.username}/`];
  }

  const items = await runActorAndCollect('apify~instagram-scraper', input, apiKey);
  return items.map(mapInstagramItem);
}

/**
 * Search YouTube via Apify actor.
 */
export async function searchYouTube(
  params: { query?: string; channelUrl?: string; limit?: number },
  apiKey: string
): Promise<ContentResult[]> {
  assertApiKey(apiKey);

  const input: Record<string, unknown> = {
    maxResults: params.limit ?? 20,
  };
  if (params.query) {
    input.searchKeywords = params.query;
  }
  if (params.channelUrl) {
    input.startUrls = [{ url: params.channelUrl }];
  }

  const items = await runActorAndCollect('apify~youtube-scraper', input, apiKey);
  return items.map(mapYouTubeItem);
}
