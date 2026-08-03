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
  /**
   * Secondary text — captions, units, macro labels, timestamps.
   *
   * Was `#6b6b6b`, which measures 3.39:1 against a card surface (`glass.bg`,
   * 6% white over the page) and 3.78:1 against the page itself. WCAG 2.1 SC
   * 1.4.3 asks 4.5:1 for text at this size, so it failed AA everywhere it was
   * used — and after `foreground` it is the most-used colour in the app.
   *
   * `#828282` is the smallest step that clears it: 4.71:1 on a card, 5.24:1 on
   * the page. The gap to `foreground` (15.45:1) stays wide enough that the two
   * still read as different ranks, which is the job this colour actually has.
   *
   * Measured rather than eyeballed. Eyeballing in a dark room on a good screen
   * is how it arrived at 3.39 in the first place.
   */
  mutedForeground: '#828282',
  secondaryForeground: '#999999',

  // Brand (premium silver)
  primary: '#a8afbd',
  primaryForeground: '#070708',
  goldLight: '#c7cad1',
  champagne: '#9fa3ad',

  /**
   * ── the signalling colours are neon ──
   *
   * Everything below carries meaning — a state, a metric, a warning — as
   * opposed to the surfaces and text above it, which carry none and are
   * unchanged. Each is the same hue it was, with chroma and luminance pushed
   * up until it reads as emitted light rather than pigment. On a near-black
   * page that is what makes a colour legible at a glance: there is nothing to
   * reflect, so a muted colour has only its own brightness to work with.
   *
   * It happens to fix a real contrast problem. Every one of these went *up*
   * against `background`, and `readinessRed`/`destructive` at 4.20:1 had been
   * under the 4.5:1 that small text wants — the colour the app uses to say
   * something is wrong was the one hardest to read:
   *
   *   green   7.75 → 14.12    blue    5.56 →  7.75
   *   yellow 11.02 → 14.62    purple  4.23 →  5.67
   *   red     4.20 →  5.78    cyan    9.39 → 12.94
   *                           orange  7.29 →  8.96
   *
   * The brand silver (`primary`, `goldLight`, `champagne`) is deliberately
   * left alone. It is an identity, not a signal, and a neon brand colour would
   * compete with every one of these for attention.
   */

  // Semantic
  destructive: '#ff3b5c',

  // Readiness
  readinessGreen: '#2bf5a8',
  readinessYellow: '#ffd93d',
  readinessRed: '#ff3b5c',

  // Metrics
  metricBlue: '#3ba6ff',
  metricPurple: '#b45cff',
  metricCyan: '#22e3ff',
  metricOrange: '#ff9130',
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
