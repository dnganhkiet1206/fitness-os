import { Music } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { LiquidGlass } from '@/components/ascnd/liquid-glass';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18n } from '@/hooks/use-app-settings';
import { MUSIC_APPS, offerable, type MusicApp } from '@/lib/music-app';

/**
 * Put something on before you start.
 *
 * Hands off to the music app the person already pays for, rather than trying to
 * be one. `lib/music-app.ts` records why that is the right shape rather than a
 * shortcut — Spotify cannot legally or technically play inside a third-party
 * app, and Apple Music can but only for subscribers and only after an
 * entitlement, a signing key and a permission prompt.
 *
 * ── it only shows what is there ──
 *
 * `canOpenURL` per app, and apps that are not installed are not offered. A
 * button for an app somebody does not have is a button that fails after they
 * press it; a row with nothing in it does not render at all.
 *
 * That check is also the thing most likely to break silently: `canOpenURL`
 * answers **false** for any scheme missing from `LSApplicationQueriesSchemes`,
 * with no error, so a forgotten declaration hides this row on every device for
 * ever. `tools/music-launch.mjs` compares the schemes against `app.json`.
 */
export function MusicLaunch() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const [apps, setApps] = useState<MusicApp[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const found: Record<string, boolean> = {};
      await Promise.all(
        MUSIC_APPS.map(async (a) => {
          /* `canOpenURL` rejects rather than resolving false on a malformed
             url, and a music shortcut is not worth an unhandled rejection. */
          found[a.id] = await Linking.canOpenURL(a.url).catch(() => false);
        }),
      );
      if (alive) setApps(offerable(found));
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* `null` while the answer is unknown, so the row does not flash in and then
     empty out on a device with neither app. */
  if (!apps || apps.length === 0) return null;

  return (
    <View style={styles.row}>
      <Icon icon={Music} size={14} color={c.mutedForeground} />
      <Text style={styles.label}>{i18n.nMusicLabel}</Text>
      {apps.map((a) => (
        <PressScale
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`${i18n.nMusicLabel}: ${a.label}`}
          onPress={() => {
            Haptics.selectionAsync();
            /* Nothing to report if this fails: the app was there a moment ago
               when `canOpenURL` said so, and a toast about a music shortcut in
               the middle of logging a set is worse than a button that did
               nothing. */
            Linking.openURL(a.url).catch(() => {});
          }}>
          {/* Same material as every other pill — and tinted by the service, the
              one colour these two unambiguously own. */}
          <LiquidGlass style={styles.chip} radius={radius.full} tint={a.tint} material="blur">
            <View style={styles.chipInner}>
              <Text style={styles.chipText}>{a.label}</Text>
            </View>
          </LiquidGlass>
        </PressScale>
      ))}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  label: { fontSize: 12, color: c.mutedForeground, marginRight: 'auto' },
  /* 44 tall like every other pill in the app, and lifted the same way — see
     `raisedPill`. These two are the only pills with no glyph, so the colour
     comes from the service instead. */
  chip: {
    borderRadius: radius.full,
  /* A firmer edge than a card's.

     `glass.border` is 12% white at half a point, and that is right for a large
     panel sitting in the aura on the assistant screen, where there is light
     behind the glass for the edge to catch. Today has `AmbientLight`, which is
     much quieter, and a pill is a fraction of a card's area — the same hairline
     that outlines a whole panel disappears around something this small. So the
     edge is carried here, where the surface is little and the light behind it
     is low. */
  borderColor: alpha(m.ink, 0.22),
  borderWidth: 1,
  },
  chipInner: { height: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  chipText: { fontSize: 12, fontWeight: '600', color: c.foreground },
}));
