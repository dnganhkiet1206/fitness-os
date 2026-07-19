import { Platform } from 'react-native';

/**
 * ASCND design tokens — a faithful port of the web app's index.css
 * (HSL → hex, dark theme). Colours, radii, glass recipe and type scale
 * match the original so the native app reads as the same product.
 */

export const colors = {
  // Core surfaces (dark) — exact from --background/--card/etc.
  background: '#070708',
  card: '#0e0e11',
  secondary: '#18181b',
  muted: '#161618',
  accent: '#1d1d20',
  border: '#2b2b31',
  input: '#303036',

  // Text
  foreground: '#ededed',
  mutedForeground: '#6b6b6b',
  secondaryForeground: '#999999',

  // Brand (premium silver)
  primary: '#a8afbd',
  primaryForeground: '#070708',
  goldLight: '#c7cad1',
  champagne: '#9fa3ad',

  // Semantic
  destructive: '#dc2828',

  // Readiness
  readinessGreen: '#20b684',
  readinessYellow: '#e8ba30',
  readinessRed: '#dc2828',

  // Metrics
  metricBlue: '#3e86ea',
  metricPurple: '#8d52e0',
  metricCyan: '#18c2dc',
  metricOrange: '#f17b27',
} as const;

/**
 * Liquid-glass surface recipe (dark) — the web renders cards as a 6%
 * white overlay with a hairline 12% white border and a faint top
 * highlight, over the near-black background. Replicated here without a
 * backdrop blur (nothing sits behind the card but the background, so the
 * blur is visually a no-op).
 */
export const glass = {
  bg: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  highlight: 'rgba(255,255,255,0.08)',
  borderWidth: 0.5,
  radius: 20,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  card: 20, // web metric-card padding (p-5)
  stack: 20, // web dashboard gap (space-y-5)
  lg: 24,
  xl: 32,
} as const;

/**
 * Canonical pressed-state feedback for Pressables — the app already uses
 * this recipe in ~90% of places; import it (`pressed && press`) so every
 * new tap target feels identical instead of re-deriving a slightly
 * different scale/opacity each time.
 */
export const press = { opacity: 0.85, transform: [{ scale: 0.97 }] } as const;

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Type scale. Big numbers use a monospace face + tabular figures to match
 * the web's `font-mono` metrics.
 */
export const type = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  title2: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
  /** Monospace numeric — for big metric read-outs (web `font-mono`). */
  mono: { fontFamily: mono, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
} as const;
