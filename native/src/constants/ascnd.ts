/**
 * ASCND design tokens — ported from the web app's index.css (HSL values
 * converted to hex). Dark-first, matching the shipped Capacitor app.
 */

export const colors = {
  // Core surfaces (dark)
  background: '#08080a',
  card: '#0e0e11',
  secondary: '#18181b',
  muted: '#151517',
  border: '#2a2a30',

  // Text
  foreground: '#ededee',
  mutedForeground: '#6b6b6b',
  secondaryForeground: '#999999',

  // Brand (premium silver)
  primary: '#a8b2c4',
  primaryForeground: '#08080a',

  // Semantic
  destructive: '#dc2f2f',

  // Readiness
  readinessGreen: '#20b583',
  readinessYellow: '#e6b93d',
  readinessRed: '#dc2f2f',

  // Metrics
  metricBlue: '#4189e0',
  metricPurple: '#8a55dd',
  metricCyan: '#16a8c4',
  metricOrange: '#ef7c26',
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** iOS type scale used across the app (matches the web build) */
export const type = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
} as const;
