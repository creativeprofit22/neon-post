/**
 * Message Extraction — Extract text, images, and suggested prompts from SDK messages
 *
 * Standalone functions extracted from AgentManager for processing
 * assistant messages, extracting image blocks, screenshot paths,
 * and suggested follow-up prompts.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getCurrentSessionId } from '../tools';
import type { MediaAttachment } from './index';

/**
 * State container holding the session-scoped Maps that message extraction
 * functions read from and write to.
 */
export interface MessageExtractionState {
  pendingMediaBySession: Map<string, MediaAttachment[]>;
  lastSuggestedPromptBySession: Map<string, string | undefined>;
}

/**
 * Extract text content from a single SDK message, accumulating into `current`.
 * Handles both 'assistant' and 'result' message types.
 */
export function extractFromMessage(
  state: MessageExtractionState,
  message: unknown,
  current: string,
  sessionId: string
): string {
  const msg = message as {
    type?: string;
    subtype?: string;
    message?: { content?: unknown };
    output?: string;
    result?: string;
    errors?: string[];
  };
  if (msg.type === 'assistant') {
    const content = msg.message?.content;
    if (Array.isArray(content)) {
      // Extract image blocks and save to disk
      extractImageBlocks(state, content, sessionId);

      const textBlocks = content
        .filter((block: unknown) => (block as { type?: string })?.type === 'text')
        .map((block: unknown) => (block as { text: string }).text);
      // If no text blocks (tool-only turn), preserve the accumulated response
      if (textBlocks.length === 0) {
        const blockTypes = content.map((b: unknown) => (b as { type?: string })?.type).join(', ');
        console.log(
          `[AgentManager] Assistant message with no text blocks (block types: ${blockTypes})`
        );
        return current;
      }
      const text = textBlocks.join('\n');
      // Extract and strip any trailing "User:" suggested prompts
      const { text: cleanedText, suggestion } = extractSuggestedPrompt(text);
      if (suggestion) {
        state.lastSuggestedPromptBySession.set(getCurrentSessionId(), suggestion);
      }
      if (!cleanedText && text) {
        console.warn(
          `[AgentManager] extractSuggestedPrompt stripped entire response (original ${text.length} chars)`
        );
      }
      // Accumulate text across multi-message turns (e.g. text → tool → text)
      return current ? current + '\n\n' + cleanedText : cleanedText;
    } else if (content !== undefined) {
      // content exists but isn't an array — unexpected format
      console.warn(
        `[AgentManager] Assistant message content is not an array (type: ${typeof content})`
      );
    }
  }

  if (msg.type === 'result') {
    // Log error results for diagnostics
    if (msg.subtype && msg.subtype !== 'success') {
      console.warn(
        `[AgentManager] Result subtype: ${msg.subtype}, errors: ${msg.errors?.join('; ') || 'none'}`
      );
    }
    const result = msg.output || msg.result;
    if (result) {
      // Extract and strip any trailing "User:" suggested prompts from result
      const { text: cleanedText, suggestion } = extractSuggestedPrompt(result);
      if (suggestion) {
        state.lastSuggestedPromptBySession.set(getCurrentSessionId(), suggestion);
      }
      // If we've already accumulated text from assistant messages, keep it
      // (SDK result.output only contains the last assistant message's text)
      return current || cleanedText;
    }
  }

  return current;
}

/**
 * Extract image blocks from SDK assistant message content and save to disk.
 * Images are accumulated in pendingMediaBySession and included in the final ProcessResult.
 */
export function extractImageBlocks(
  state: MessageExtractionState,
  content: unknown[],
  sessionId: string
): void {
  const pendingMedia = state.pendingMediaBySession.get(sessionId) || [];
  if (!state.pendingMediaBySession.has(sessionId)) {
    state.pendingMediaBySession.set(sessionId, pendingMedia);
  }
  for (const block of content) {
    const b = block as {
      type?: string;
      source?: { type?: string; media_type?: string; data?: string; url?: string };
    };
    if (b.type !== 'image' || !b.source) continue;

    try {
      const mediaDir = path.join(os.homedir(), 'Documents', 'Pocket-agent', 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      const mimeType = b.source.media_type || 'image/png';
      const ext =
        mimeType.includes('jpeg') || mimeType.includes('jpg')
          ? '.jpg'
          : mimeType.includes('gif')
            ? '.gif'
            : mimeType.includes('webp')
              ? '.webp'
              : '.png';

      if (b.source.type === 'base64' && b.source.data) {
        // Base64 image — save directly to disk
        const filename = `img-${Date.now()}-${pendingMedia.length}${ext}`;
        const filePath = path.join(mediaDir, filename);
        fs.writeFileSync(filePath, Buffer.from(b.source.data, 'base64'));

        pendingMedia.push({ type: 'image', filePath, mimeType });
        console.log(`[AgentManager] Saved image: ${filePath}`);
      } else if (b.source.type === 'url' && b.source.url) {
        // URL image — download and save to disk
        const filename = `img-${Date.now()}-${pendingMedia.length}${ext}`;
        const filePath = path.join(mediaDir, filename);

        // Fire-and-forget download; image will be available for Telegram sync
        fetch(b.source.url)
          .then((res) =>
            res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))
          )
          .then((buf) => {
            fs.writeFileSync(filePath, Buffer.from(buf));
            console.log(`[AgentManager] Downloaded image: ${filePath}`);
          })
          .catch((err) => console.error('[AgentManager] Failed to download image:', err));

        pendingMedia.push({ type: 'image', filePath, mimeType });
      }
    } catch (err) {
      console.error('[AgentManager] Failed to save image block:', err);
    }
  }
}

/**
 * Extract screenshot file paths from tool result blocks.
 * The browser tool saves full-res screenshots and includes the path in its result JSON.
 */
export function extractScreenshotPaths(
  state: MessageExtractionState,
  block: unknown,
  sessionId: string
): void {
  try {
    const b = block as { content?: unknown };
    if (!b.content) return;

    const pendingMedia = state.pendingMediaBySession.get(sessionId) || [];
    if (!state.pendingMediaBySession.has(sessionId)) {
      state.pendingMediaBySession.set(sessionId, pendingMedia);
    }

    if (Array.isArray(b.content)) {
      // Extract image blocks from tool result content (e.g. computer_use screenshots)
      extractImageBlocks(state, b.content, sessionId);

      // Also check text blocks for file paths
      for (const part of b.content) {
        const p = part as { type?: string; text?: string };
        if (p.type === 'text' && p.text) {
          const match = p.text.match(/saved to (\/[^\s"]+\/screenshot-\d+\.png)/);
          if (match && fs.existsSync(match[1])) {
            if (!pendingMedia.some((m) => m.filePath === match[1])) {
              pendingMedia.push({ type: 'image', filePath: match[1], mimeType: 'image/png' });
              console.log(`[AgentManager] Found screenshot in tool result: ${match[1]}`);
            }
          }
        }
      }
    } else if (typeof b.content === 'string') {
      const match = b.content.match(/saved to (\/[^\s"]+\/screenshot-\d+\.png)/);
      if (match && fs.existsSync(match[1])) {
        if (!pendingMedia.some((m) => m.filePath === match[1])) {
          pendingMedia.push({ type: 'image', filePath: match[1], mimeType: 'image/png' });
          console.log(`[AgentManager] Found screenshot in tool result: ${match[1]}`);
        }
      }
    }
  } catch {
    // Ignore parsing errors
  }
}

/**
 * Extract and strip trailing suggested user prompts that the SDK might include.
 * These appear as "User: ..." at the end of responses.
 * Returns both the cleaned text and the extracted suggestion.
 */
export function extractSuggestedPrompt(text: string): { text: string; suggestion?: string } {
  if (!text) return { text };

  // Pattern: newlines followed by "User:" (case-insensitive) and any text until end
  const match = text.match(/\n\nuser:\s*(.+)$/is);

  if (match) {
    const suggestion = match[1].trim();
    const cleanedText = text.replace(/\n\nuser:[\s\S]*$/is, '').trim();

    // Validate that the suggestion looks like a user prompt, not an assistant question
    const valid = isValidUserPrompt(suggestion);

    if (valid) {
      console.log('[AgentManager] Extracted suggested prompt:', suggestion);
      return { text: cleanedText, suggestion };
    } else {
      // Not a valid prompt suggestion — return original text unmodified
      return { text: text.trim() };
    }
  }

  return { text: text.trim() };
}

/**
 * Check if a suggestion looks like a valid user prompt.
 * Rejects questions and assistant-style speech.
 */
export function isValidUserPrompt(suggestion: string): boolean {
  if (!suggestion) return false;

  // Reject if it ends with a question mark (assistant asking a question)
  if (suggestion.endsWith('?')) return false;

  // Reject if it starts with common question/assistant words
  const assistantPatterns =
    /^(what|how|would|do|does|is|are|can|could|shall|should|may|might|let me|i can|i'll|i will|here's|here is)/i;
  if (assistantPatterns.test(suggestion)) return false;

  // Reject if it's too long (likely not a simple user command)
  if (suggestion.length > 100) return false;

  // Accept short, command-like suggestions
  return true;
}
