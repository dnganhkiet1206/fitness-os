import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
import {
  KOA_EXPRESSIONS,
  KOA_ITEMS,
  KOA_POSES,
  KOA_SLOTS,
  type KoaExpression,
  type KoaPose,
  type KoaSlot,
  type Worn,
} from '@/components/ascnd/koa/koa-flags';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

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
 *
 * Only the hero animates. The boards are 86 thumbnails — leaving those live
 * meant 86 clocks and several hundred native prop commits a frame, which is
 * enough to heat a phone on its own.
 *
 * The wardrobe is an accordion for the same reason. Seventy items, each a
 * whole figure, is around 6,000 native views mounted at once; one slot open
 * at a time keeps it under a thousand.
 */

/** the expression each pose is drawn with on the sheet's §4 */
const POSE_FACE: Record<KoaPose, KoaExpression> = {
  idle: 'happy',
  turn34: 'happy',
  running: 'happytired',
  lifting: 'strain',
  stretching: 'happy',
  relaxing: 'tired',
};

const SLOT_LABEL: Record<KoaSlot, string> = {
  head: 'ĐẦU',
  face: 'MẶT',
  top: 'ÁO',
  bottom: 'QUẦN',
  shoes: 'GIÀY',
  back: 'SAU LƯNG',
  hand: 'CẦM TAY',
};

export default function KoaSheetScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const [expression, setExpression] = useState<KoaExpression>('happy');
  const [pose, setPose] = useState<KoaPose>('idle');
  const [worn, setWorn] = useState<Worn>({});
  // one wardrobe slot open at a time — see the note above
  const [openSlot, setOpenSlot] = useState<KoaSlot | null>('head');

  const label = KOA_EXPRESSIONS.find((e) => e.key === expression)?.label ?? expression.toUpperCase();

  const cycle = () => {
    Haptics.selectionAsync();
    const i = KOA_EXPRESSIONS.findIndex((e) => e.key === expression);
    setExpression(KOA_EXPRESSIONS[(i + 1) % KOA_EXPRESSIONS.length].key);
  };

  /** tapping an item wears it; tapping it again takes it off */
  const toggle = (slot: KoaSlot, id: string) => {
    Haptics.selectionAsync();
    setWorn((w) => ({ ...w, [slot]: w[slot] === id ? undefined : id }));
  };

  return (
    <Screen title="Koa · spec sheet" back>
      <View style={styles.hero}>
        <Pressable onPress={cycle} hitSlop={8}>
          <KoaFigure expression={expression} pose={pose} worn={worn} size={200} />
        </Pressable>
        <Text style={styles.heroLabel}>
          {label} · {pose.toUpperCase()}
        </Text>
        <Text style={styles.heroHint}>Chạm vào Koa để đổi biểu cảm</Text>
      </View>

      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.section}>3. BIỂU CẢM</Text>
          <Text style={styles.sectionSub}>Koa · Koala · #BFC7CF</Text>
        </View>
        <View style={styles.grid}>
          {KOA_EXPRESSIONS.map((e: { key: KoaExpression; label: string }) => (
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
                <KoaFigure expression={e.key} worn={worn} size={104} animated={false} />
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
          <Text style={styles.sectionSub}>pose · {KOA_POSES.length} trạng thái</Text>
        </View>
        <View style={styles.grid}>
          {KOA_POSES.map((po) => (
            <Pressable
              key={po.key}
              onPress={() => {
                Haptics.selectionAsync();
                setPose(po.key);
                setExpression(POSE_FACE[po.key]);
              }}
              style={[styles.tile, pose === po.key && styles.tileOn]}>
              {/* a pose is the whole silhouette — never crop it */}
              <KoaFigure expression={POSE_FACE[po.key]} pose={po.key} worn={worn} size={104} animated={false} />
              <Text style={[styles.tileLabel, pose === po.key && styles.tileLabelOn]}>
                {po.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>
      {KOA_SLOTS.map((slot) => {
        const open = openSlot === slot;
        return (
          <GlassCard elevation="inset" key={slot} style={styles.card}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setOpenSlot(open ? null : slot);
              }}
              style={styles.cardHead}>
              <Text style={styles.section}>
                {open ? '−' : '+'}  {SLOT_LABEL[slot]}
              </Text>
              <Text style={styles.sectionSub}>
                {slot} · {KOA_ITEMS[slot].length} món
                {worn[slot] ? ` · đang mặc ${worn[slot]}` : ''}
              </Text>
            </Pressable>
            {open && (
              <View style={styles.grid}>
                {KOA_ITEMS[slot].map((id) => (
                  <Pressable
                    key={id}
                    onPress={() => toggle(slot, id)}
                    style={[styles.tile, worn[slot] === id && styles.tileOn]}>
                    <View style={styles.tileFace}>
                      <KoaFigure pose="idle" worn={{ [slot]: id }} size={104} animated={false} />
                    </View>
                    <Text style={[styles.tileLabel, worn[slot] === id && styles.tileLabelOn]}>
                      {id}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </GlassCard>
        );
      })}
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: {
    ...type.caption,
    ...type.mono,
    color: c.foreground,
    letterSpacing: 1.6,
    marginTop: spacing.sm,
  },
  heroHint: { ...type.caption, color: c.mutedForeground },
  card: { gap: spacing.md, marginBottom: spacing.stack },
  cardHead: { gap: 2 },
  section: { ...type.caption, ...type.mono, color: c.primary, letterSpacing: 2.2 },
  sectionSub: { ...type.caption, color: c.mutedForeground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  tileOn: { borderColor: c.primary },
  // the figure is 104 × 130; keep the top 88 so the head fills the tile
  tileFace: { height: 88, width: 104, overflow: 'hidden' },
  tileLabel: { ...type.caption, ...type.mono, fontSize: 11, color: c.mutedForeground, letterSpacing: 1 },
  tileLabelOn: { color: c.foreground },
}));
