import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { MuscleArt } from '@/components/ascnd/muscle-art';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18n } from '@/hooks/use-app-settings';
import { muscleArtKeysFor, type MuscleArtKey } from '@/lib/muscle-group';
import { nav } from '@/lib/nav';

/**
 * The tiles, in the order a body is worked rather than alphabetically.
 *
 * Push, pull, then the two arms, then the trunk, then everything below the
 * waist. Alphabetical would put Abs first and Triceps next to Shoulders, which
 * is an order that serves the spelling and nobody else.
 *
 * The names are written here rather than taken from `i18n.muscleChest` and its
 * siblings, because those are the *stored* labels — changing one has to keep
 * matching data already filed under it, and a tile caption has no such
 * obligation.
 */
const MUSCLE_TILES: { key: MuscleArtKey; vi: string; en: string }[] = [
  { key: 'chest', vi: 'Ngực', en: 'Chest' },
  { key: 'back', vi: 'Lưng', en: 'Back' },
  { key: 'legs', vi: 'Chân', en: 'Legs' },
  { key: 'shoulders', vi: 'Vai', en: 'Shoulders' },
  { key: 'biceps', vi: 'Tay trước', en: 'Biceps' },
  { key: 'triceps', vi: 'Tay sau', en: 'Triceps' },
  { key: 'abs', vi: 'Bụng', en: 'Abs' },
  { key: 'glutes', vi: 'Mông', en: 'Glutes' },
  { key: 'calves', vi: 'Bắp chân', en: 'Calves' },
  { key: 'cardio', vi: 'Tim mạch', en: 'Cardio' },
];

/** Two rows of three — what the library shows before you open it up. */
const TILES_COLLAPSED = 6;

/**
 * The exercise library, entered by body part.
 *
 * ── why it is here ──
 *
 * The library was reachable only through an "Exercises" button in the header
 * row, which is a word next to two other words. A person opening this tab wants
 * to train something, and the thing they want to train is a body part — so the
 * way in is a picture of that body part with the count of what is filed under
 * it.
 *
 * The button stays. This is a second door to the same room, not a replacement,
 * and somebody who has learned where the button is should not have to relearn.
 *
 * ── every group, every time ──
 *
 * All ten exist, including the ones with nothing filed under them yet. The grid
 * is a menu of what the app knows about as much as a view of what is in the
 * library, and a menu that changes shape as exercises are added is one you have
 * to re-read every visit — the chest tile moving because calves appeared is
 * motion that means nothing.
 *
 * A group with no *art* still gets no tile. That is a different thing: the
 * missing piece there is a picture, not a shelf.
 *
 * ── six of them, until you ask for ten ──
 *
 * Ten tiles three across is four rows of a 64pt drawing over two lines of type
 * — around 440pt, most of a phone screen, for a section that is a *door* to the
 * library rather than the library itself. Collapsed to the first two rows it is
 * a menu you take in at a glance, and the toggle underneath restores the rest.
 *
 * This does not contradict the paragraph above. What that forbids is the grid
 * rearranging itself as data arrives; the order here is fixed forever and
 * collapsing only hides its tail, so expanding puts every tile back exactly
 * where it was. The order was changed once, when this was added, so that the
 * six always-visible ones are the six biggest movements — hiding Chân while
 * showing Bắp chân would have been a menu with the main course missing.
 *
 * ── the counts are real, or they are absent ──
 *
 * Each tile counts what is actually filed under it. If the read failed, the
 * count is left off rather than printed as zero — "0 bài" is a claim about the
 * library, and the claim would be wrong. Same rule the templates header above
 * already follows.
 */
export function MuscleGrid({
  exercises,
  failed,
  vi,
}: {
  exercises: { muscle_group: string | null }[];
  /** the library did not load — show the shelves, do not claim they are empty */
  failed: boolean;
  vi: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  /*
    Grouped by *art*, not by stored name.

    `muscle_group` is free text written by two screens in two languages — the
    builder stores "Quads", the library stores "Chân trước" — so counting by the
    raw string would put the same shelf on two tiles. Folding to the art key
    first is what makes one tile mean one body part.
  */
  const counts = new Map<MuscleArtKey, number>();
  for (const e of exercises) {
    // `Lưng/Chân` is two groups and both are true, so the deadlift is counted
    // under each. The tiles therefore sum to more than the library holds — a
    // tile says how many exercises work that muscle, not how many are filed
    // there and nowhere else.
    for (const key of muscleArtKeysFor(e.muscle_group)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }


  return (
    <View style={styles.libSection}>
      <View style={styles.libHead}>
        <Text style={styles.sectionLabel}>{i18n.nToolsExercises}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            Haptics.selectionAsync();
            nav.push('/exercises');
          }}>
          <Text style={styles.libAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
        </Pressable>
      </View>
      <View style={styles.libGrid}>
        {(open ? MUSCLE_TILES : MUSCLE_TILES.slice(0, TILES_COLLAPSED)).map((t) => {
          const n = counts.get(t.key) ?? 0;
          return (
            <PressScale
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={
                failed ? (vi ? t.vi : t.en) : `${vi ? t.vi : t.en}, ${n} ${vi ? 'bài' : 'exercises'}`
              }
              style={styles.libTile}
              onPress={() => {
                Haptics.selectionAsync();
                // The art key, not the caption: the caption is a display string
                // and the library has to match against every spelling of the
                // group, which is what the key stands for.
                nav.push({ pathname: '/exercises', params: { group: t.key } });
              }}>
              <MuscleArt group={t.key} size={64} />
              <Text style={styles.libName} numberOfLines={1}>{vi ? t.vi : t.en}</Text>
              {failed ? null : (
                <Text style={styles.libCount}>
                  {n} {vi ? 'bài' : n === 1 ? 'exercise' : 'exercises'}
                </Text>
              )}
            </PressScale>
          );
        })}
      </View>

      {/* Says which way it goes and how much is behind it — "Xem thêm" alone is
          a button whose result you have to press it to find out. */}
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.libToggle}
        onPress={() => {
          Haptics.selectionAsync();
          setOpen((v) => !v);
        }}>
        <Text style={styles.libToggleText}>
          {open
            ? vi ? 'Thu gọn' : 'Show less'
            : vi
              ? `Xem thêm ${MUSCLE_TILES.length - TILES_COLLAPSED} nhóm`
              : `Show ${MUSCLE_TILES.length - TILES_COLLAPSED} more`}
        </Text>
        <Icon icon={open ? ChevronUp : ChevronDown} size={14} color={c.primary} />
      </PressScale>
    </View>
  );
}


const stylesFor = makeStyles((c, m) => ({
  /* Taller than the pills above it — it is what this tab is for. */
  libSection: { gap: spacing.sm },
  libHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  libAll: { ...type.footnote, color: c.primary },
  libGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* Full width and centred, so it reads as the end of the grid rather than as
     an eleventh tile that lost its picture. */
  libToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
    borderRadius: radius.md,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
    backgroundColor: m.inset.bg,
  },
  /* Full width, 52 tall, and a shade more border than the pills above it.
     It is the thing this tab is for, and it had been the flattest control on
     the page. */
  libToggleText: { fontSize: 13, fontWeight: '600', color: c.primary },
  /*
    Three across. Two makes each tile large enough to show the drawing's
    striations, which is detail nobody reads on a tile; four shrinks the figure
    to the point where chest and shoulders are the same picture.

    `31%` with an 8pt gap rather than `flex: 1`, because a last row holding one
    tile would stretch that tile across the screen.
  */
  /*
    The same surface as every other card, not a colour invented for this grid.

    It had a hand-picked `rgba(24,24,27,0.35)` fill and a `rgba(43,43,49,0.35)`
    border, which is a *fourth* dark in a screen that already has three, and it
    is what made the section read as pasted in from somewhere else. `glass` is
    what the templates, the sessions and every card on every other tab are made
    of; a tile made of it belongs to the app whether or not anyone can say why.
  */
  libTile: {
    width: '31%',
    alignItems: 'center',
    gap: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  libName: { ...type.footnote, fontWeight: '600', color: c.foreground, marginTop: 4 },
  libCount: { ...type.caption, color: c.mutedForeground },
  /* The list's own section, spaced like the library's above it. */
  tplSection: { gap: spacing.sm },
  sessionsWrap: { gap: spacing.sm },
  sessionsCard: { paddingVertical: 4 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  /*
    Flat siblings, wrapping on their own.

    Two of them used to sit inside a grouping `<View>`, which has no styling of
    its own and one visible effect: the group is a single flex item, so it wraps
    as a block. With the pills at 44pt that put one button on the first row and
    two on the second, leaving a long empty gap. Flat, they pack.
  */
  sectionLabel: { fontSize: 14, fontWeight: '600', color: c.foreground },
  /* Hàng "tạo mới" ở cuối danh sách.

     KHÔNG dùng viền đứt nét: `tools/training-card.mjs` đã ghi lại rằng trên
     iOS `borderStyle: 'dashed'` bị từ chối khi bốn cạnh khác màu, và nó không
     vẽ nét liền thay thế — nó không vẽ gì cả. Bản đầu của hàng này đúng là như
     vậy, và luật bắt được. Viền liền cùng chất với các thẻ khác, còn việc "đây
     là chỗ để THÊM" do dấu cộng và màu chữ nói. */
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
    backgroundColor: m.inset.bg,
  },
}));
