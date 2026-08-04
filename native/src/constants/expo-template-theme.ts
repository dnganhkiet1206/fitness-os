/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Clearance a page leaves for the floating tab bar, above the safe-area inset.
 *
 * Two capsules, not one. The bar is 58pt — a 50pt row of icon-over-label, which
 * is what a `UITabBar` item measures, plus its own 4pt of padding — and the
 * coach accessory above it is 52 with 8 between them. The bar also sits 21pt
 * off the bottom edge now, Apple's inset for the floating capsule. That is 139;
 * Android carries the same eight points more it always did.
 *
 * It was 72 for a single 56pt bar flush at 8. The extra is the price of three
 * things asked for together — labels on every tab, Apple's own metrics, and the
 * coach no longer pretending to be a destination — and it is charged to the
 * bottom of every page, so it is worth knowing what would buy some back:
 * moving the coach into the page headers would return 60.
 */
export const BottomTabInset = Platform.select({ ios: 139, android: 147 }) ?? 0;
export const MaxContentWidth = 800;
