import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
import {
  KOA_EXPRESSIONS,
  PALETTE,
  type KoaExpression,
  type KoaPose,
} from '@/components/ascnd/koa/koa-parts';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';

/**
 * Koa · spec sheet — the character review screen.
 *
 * Panels 3 (BIỂU CẢM) and 5 (TƯ THẾ) of "KOALA MASCOT – SVG DESIGN", live on
 * device, so the drawing can be checked against the sheet on real hardware
 * instead of in a simulator screenshot. Tap the hero to cycle expressions —
 * the same affordance the design's Mascot Room panel has ("chạm vào Koa để
 * đổi biểu cảm"); tap any card to load it into the hero.
 *
 * Reached from the DEV bar in the Mascot Room; nothing links to it in a
 * production build.
 */

const POSES: { key: KoaPose; label: string }[] = [
  { key: 'idle', label: 'ĐỨNG YÊN' },
  { key: 'running', label: 'CHẠY BỘ' },
  { key: 'lifting', label: 'TẬP TẠ' },
  { key: 'stretching', label: 'GIÃN CƠ' },
  { key: 'relaxing', label: 'THƯ GIÃN' },
];

/** the expression each pose is drawn with on the sheet's §5 */
const POSE_FACE: Record<KoaPose, KoaExpression> = {
  idle: 'happy',
  running: 'happytired',
  lifting: 'confident',
  stretching: 'happy',
  relaxing: 'tired',
};

export default function KoaSheetScreen() {
  const [expression, setExpression] = useState<KoaExpression>('happy');
  const [pose, setPose] = useState<KoaPose>('idle');
  const [pokes, setPokes] = useState(0);

  const label = KOA_EXPRESSIONS.find((e) => e.key === expression)?.label ?? expression.toUpperCase();

  const cycle = () => {
    Haptics.selectionAsync();
    setPokes((n) => n + 1);
    const i = KOA_EXPRESSIONS.findIndex((e) => e.key === expression);
    setExpression(KOA_EXPRESSIONS[(i + 1) % KOA_EXPRESSIONS.length].key);
  };

  return (
    <Screen title="Koa · spec sheet" back>
      <View style={styles.hero}>
        <Pressable onPress={cycle} hitSlop={8}>
          <KoaFigure expression={expression} pose={pose} size={200} pokeSignal={pokes} />
        </Pressable>
        <Text style={styles.heroLabel}>
          {label} · {pose.toUpperCase()}
        </Text>
        <Text style={styles.heroHint}>Chạm vào Koa để đổi biểu cảm</Text>
      </View>

      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.section}>3. BIỂU CẢM</Text>
          <Text style={styles.sectionSub}>Koa · Koala · {PALETTE.body}</Text>
        </View>
        <View style={styles.grid}>
          {KOA_EXPRESSIONS.map((e) => (
            <Pressable
              key={e.key}
              onPress={() => {
                Haptics.selectionAsync();
                setExpression(e.key);
              }}
              style={[styles.tile, expression === e.key && styles.tileOn]}>
              {/* expressions are judged on the face — crop to the head, as
                  the sheet's own §3 board does */}
              <View style={styles.tileFace}>
                <KoaFigure expression={e.key} size={104} />
              </View>
              <Text style={[styles.tileLabel, expression === e.key && styles.tileLabelOn]}>
                {e.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.section}>5. TƯ THẾ</Text>
          <Text style={styles.sectionSub}>pose · 5 trạng thái</Text>
        </View>
        <View style={styles.grid}>
          {POSES.map((po) => (
            <Pressable
              key={po.key}
              onPress={() => {
                Haptics.selectionAsync();
                setPose(po.key);
                setExpression(POSE_FACE[po.key]);
              }}
              style={[styles.tile, pose === po.key && styles.tileOn]}>
              {/* a pose is the whole silhouette — never crop it */}
              <KoaFigure expression={POSE_FACE[po.key]} pose={po.key} size={104} />
              <Text style={[styles.tileLabel, pose === po.key && styles.tileLabelOn]}>
                {po.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: {
    ...type.caption,
    ...type.mono,
    color: colors.foreground,
    letterSpacing: 1.6,
    marginTop: spacing.sm,
  },
  heroHint: { ...type.caption, color: colors.mutedForeground },
  card: { gap: spacing.md, marginBottom: spacing.stack },
  cardHead: { gap: 2 },
  section: { ...type.caption, ...type.mono, color: colors.primary, letterSpacing: 2.2 },
  sectionSub: { ...type.caption, color: colors.mutedForeground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  tileOn: { borderColor: colors.primary },
  // the figure is 104 × 130; keep the top 88 so the head fills the tile
  tileFace: { height: 88, width: 104, overflow: 'hidden' },
  tileLabel: { ...type.caption, ...type.mono, fontSize: 9, color: colors.mutedForeground, letterSpacing: 1 },
  tileLabelOn: { color: colors.foreground },
});
