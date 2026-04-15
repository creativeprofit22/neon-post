import { GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import type { TemplateDefinition } from '../compositor/types';

import headlineCenter from './presets/headline-center.json';
import headlineBottom from './presets/headline-bottom.json';
import splitCard from './presets/split-card.json';
import carouselSlide from './presets/carousel-slide.json';
import bottomBar from './presets/bottom-bar.json';
import socialEmbed from './presets/social-embed.json';

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const PRESETS: Map<string, TemplateDefinition> = new Map([
  ['headline-center', headlineCenter as TemplateDefinition],
  ['headline-bottom', headlineBottom as TemplateDefinition],
  ['split-card', splitCard as TemplateDefinition],
  ['carousel-slide', carouselSlide as TemplateDefinition],
  ['bottom-bar', bottomBar as TemplateDefinition],
  ['social-embed', socialEmbed as TemplateDefinition],
]);

export function getTemplate(id: string): TemplateDefinition | null {
  return PRESETS.get(id) ?? null;
}

export function listTemplates(): TemplateDefinition[] {
  return [...PRESETS.values()];
}

export function listTemplateIds(): string[] {
  return [...PRESETS.keys()];
}

// ---------------------------------------------------------------------------
// Font registration
// ---------------------------------------------------------------------------

let fontsRegistered = false;

/**
 * Registers the Douro brand fonts with the canvas runtime.
 * Safe to call multiple times — only registers once.
 */
export function registerFonts(assetsDir?: string): void {
  if (fontsRegistered) return;

  // Default: <project-root>/assets/fonts
  const fontsDir = assetsDir
    ? path.join(assetsDir, 'fonts')
    : path.resolve(process.cwd(), 'assets', 'fonts');

  const fonts = [
    { file: 'space-grotesk.woff2', family: 'Space Grotesk' },
    { file: 'press-start-2p.woff2', family: 'Press Start 2P' },
    { file: 'fragment-mono.woff2', family: 'Fragment Mono' },
    { file: 'instrument-serif.woff2', family: 'Instrument Serif' },
    { file: 'instrument-serif-italic.woff2', family: 'Instrument Serif Italic' },
    { file: 'Anton-Regular.ttf', family: 'Anton' },
    { file: 'BebasNeue-Regular.ttf', family: 'Bebas Neue' },
  ];

  for (const { file, family } of fonts) {
    const fontPath = path.join(fontsDir, file);
    try {
      GlobalFonts.registerFromPath(fontPath, family);
    } catch {
      console.warn(`[templates] Failed to register font: ${fontPath}`);
    }
  }

  fontsRegistered = true;
}

// ---------------------------------------------------------------------------
// Logo paths helper
// ---------------------------------------------------------------------------

export function getLogoPath(
  variant: 'icon' | 'wordmark' | 'wordmark-dark' | 'wordmark-white' | 'wordmark-red',
  assetsDir?: string
): string {
  const logosDir = assetsDir
    ? path.join(assetsDir, 'logos')
    : path.resolve(process.cwd(), 'assets', 'logos');

  switch (variant) {
    case 'icon':
      return path.join(logosDir, 'douro-logo.png');
    case 'wordmark':
      return path.join(logosDir, 'douro-digital-logo.png');
    case 'wordmark-dark':
      return path.join(logosDir, 'douro-wordmark.jpeg');
    case 'wordmark-white':
      return path.join(logosDir, 'douro-digital-logo-white.png');
    case 'wordmark-red':
      return path.join(logosDir, 'douro-digital-logo-red.png');
  }
}

// ---------------------------------------------------------------------------
// Divider asset paths
// ---------------------------------------------------------------------------

export function getDividerPath(
  variant: 'circuit-fade' | 'circuit-line',
  assetsDir?: string
): string {
  const baseDir = assetsDir ?? path.resolve(process.cwd(), 'assets');

  switch (variant) {
    case 'circuit-fade':
      return path.join(baseDir, 'divider-circuit-fade.png');
    case 'circuit-line':
      return path.join(baseDir, 'divider-circuit-line.png');
  }
}
