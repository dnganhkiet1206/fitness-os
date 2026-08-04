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
 * Clearance a page leaves under its content, above the safe-area inset.
 *
 * Back to 72 now that the tab bar is UIKit's. It had climbed to 139 while the
 * bar was hand-drawn and each measurement was being matched by hand — a
 * labelled row, an accessory capsule, Apple's 21pt float — and every one of
 * those numbers is the system's business again.
 *
 * It exists at all because `Screen` sets `contentInsetAdjustmentBehavior` to
 * `never`: these pages lay out their own safe-area padding, which means iOS
 * cannot apply the tab bar's inset for them. 72 clears a floating tab bar with
 * room to spare, and being a little generous costs a few points of scroll
 * where being short hides the last card behind the bar.
 */
export const BottomTabInset = Platform.select({ ios: 72, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
